// Le pont entre Echo et le calendrier iCloud (CalDAV), dans les deux sens.
// L'identifiant Apple et le mot de passe pour app restent ici (secrets ICLOUD_IDENTIFIANT et ICLOUD_MOT_DE_PASSE) :
// ils ne sont jamais dans l'app. Seuls les téléphones d'un foyer autorisé (table prive.icloud_foyers) peuvent appeler.
//
// Actions (POST JSON) :
//   { action: "lire", de: "AAAA-MM-JJ", a: "AAAA-MM-JJ" } → { place, calendriers, evenements }
//   { action: "ecrire", cal?, href?, uid, titre, note, jour, heure, fin } → { href, etag }
//   { action: "effacer", href } → { ok }
import { createClient } from "npm:@supabase/supabase-js@2.119.2";
import {
  creerIcs, depuisZurich, estCalendrierEvenements, formatUtc, lienDans, lireEvenements, modifierIcs, prop, reponses,
  type Champs, type Evenement,
} from "./caldav.ts";

const ORIGINES = ["https://dmeloz.github.io", "http://localhost:5173", "http://localhost:4173"];
const RACINE = "https://caldav.icloud.com/";
const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const HEURE = /^(\d{2}:\d{2})?$/;

const entetes = (origine: string | null) => ({
  "Access-Control-Allow-Origin": origine && ORIGINES.includes(origine) ? origine : ORIGINES[0],
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
});

class Erreur extends Error { constructor(public code: string, public statut = 400) { super(code); } }

/* ---------- CalDAV ---------- */

function connexionApple(): string {
  const id = Deno.env.get("ICLOUD_IDENTIFIANT"), mdp = Deno.env.get("ICLOUD_MOT_DE_PASSE");
  if (!id || !mdp) throw new Erreur("pas_configure", 503);
  return "Basic " + btoa(`${id}:${mdp}`);
}

// Une requête CalDAV. Les redirections sont suivies à la main pour garder la connexion Apple.
async function dav(methode: string, url: string, auth: string, corps?: string, plus: Record<string, string> = {}): Promise<Response> {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, {
      method: methode,
      redirect: "manual",
      headers: { Authorization: auth, ...(corps ? { "Content-Type": methode === "PUT" ? "text/calendar; charset=utf-8" : "application/xml; charset=utf-8" } : {}), ...plus },
      body: corps,
    });
    const vers = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && vers) { await r.body?.cancel(); url = new URL(vers, url).href; continue; }
    if (r.status === 401) { await r.body?.cancel(); throw new Erreur("apple_refuse", 502); }
    return r;
  }
  throw new Erreur("apple", 502);
}
const absolu = (href: string, base: string) => new URL(href, base).href;

interface Calendrier { href: string; nom: string }
const pf = (p: string) => `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">${p}</d:propfind>`;
// Le dossier iCloud qui contient les calendriers (calendar-home-set).
async function dossierCalendriers(auth: string): Promise<string> {
  let r = await dav("PROPFIND", RACINE, auth, pf("<d:prop><d:current-user-principal/></d:prop>"), { Depth: "0" });
  const principal = lienDans(await r.text(), "current-user-principal");
  if (!principal) { console.warn("icloud: pas de principal, statut", r.status); throw new Erreur("apple", 502); }
  const urlPrincipal = absolu(principal, r.url || RACINE);
  r = await dav("PROPFIND", urlPrincipal, auth, pf("<d:prop><c:calendar-home-set/></d:prop>"), { Depth: "0" });
  const maison = lienDans(await r.text(), "calendar-home-set");
  if (!maison) { console.warn("icloud: pas de dossier des calendriers, statut", r.status); throw new Erreur("apple", 502); }
  return absolu(maison, urlPrincipal);
}
async function calendriers(auth: string, urlMaison?: string): Promise<Calendrier[]> {
  urlMaison ??= await dossierCalendriers(auth);
  const r = await dav("PROPFIND", urlMaison, auth, pf("<d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/></d:prop>"), { Depth: "1" });
  // Une liste qui échoue n'est pas « aucun calendrier » : sinon l'app retirerait ses événements, ou créerait un calendrier en trop.
  if (r.status !== 207 && !r.ok) { await r.body?.cancel(); console.warn("icloud: liste des calendriers refusée, statut", r.status); throw new Erreur("apple", 502); }
  const toutes = reponses(await r.text());
  if (!toutes.length) { console.warn("icloud: liste des calendriers illisible, statut", r.status); throw new Erreur("apple", 502); }
  const cals = toutes.filter((x) => estCalendrierEvenements(x.corps))
    .map((x) => ({ href: absolu(x.href, urlMaison!), nom: prop(x.corps, "displayname") || "Calendrier" }));
  // Trace sans données personnelles : combien de dossiers, de quel type, combien gardés.
  console.log("icloud: calendriers", JSON.stringify({ statut: r.status, dossiers: toutes.length, gardes: cals.length, types: toutes.map((x) => resume(x.corps)) }));
  return cals;
}
// Le type d'un dossier iCloud, sans son nom ni son adresse (pour la trace).
const resume = (corps: string) =>
  (corps.match(/<(?:[\w-]+:)?resourcetype\b[^>]*?(?:\/>|>[\s\S]*?<\/(?:[\w-]+:)?resourcetype>)/i)?.[0] ?? "?").replace(/\sxmlns(:\w+)?=(?:"[^"]*"|'[^']*')/g, "").replace(/\s+/g, " ").slice(0, 160)
  + " " + ((corps.match(/name=["']V\w+["']/gi) ?? []).join(",") || "-");

// Le premier calendrier d'événements. S'il n'y en a aucun sur iCloud (liste lue sans erreur), on crée le calendrier « Echo ».
async function calendrierPourEcrire(auth: string): Promise<string> {
  const urlMaison = await dossierCalendriers(auth);
  const deja = await calendriers(auth, urlMaison);
  if (deja[0]) return deja[0].href;
  const href = new URL("echo/", urlMaison.endsWith("/") ? urlMaison : urlMaison + "/").href;
  const corps = `<?xml version="1.0"?><c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:set><d:prop>
<d:displayname>Echo</d:displayname><c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>
</d:prop></d:set></c:mkcalendar>`;
  const r = await dav("MKCALENDAR", href, auth, corps);
  await r.body?.cancel();
  console.log("icloud: création du calendrier Echo, statut", r.status);
  // Créé à l'instant, ou par l'autre téléphone au même moment : on relit la liste et on prend l'adresse qu'iCloud donne.
  const apres = await calendriers(auth, urlMaison);
  if (apres[0]) return apres[0].href;
  if (r.ok) return r.url || href;
  throw new Erreur("pas_de_calendrier", 404);
}

type Lu = Evenement & { cal: string; href: string; etag: string };
async function lire(auth: string, cal: string, de: string, a: string): Promise<Lu[]> {
  const debut = formatUtc(depuisZurich(de, "00:00")), fin = formatUtc(depuisZurich(a, "23:59"));
  const corps = `<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
<d:prop><d:getetag/><c:calendar-data><c:expand start="${debut}" end="${fin}"/></c:calendar-data></d:prop>
<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${debut}" end="${fin}"/></c:comp-filter></c:comp-filter></c:filter>
</c:calendar-query>`;
  const r = await dav("REPORT", cal, auth, corps, { Depth: "1" });
  if (!r.ok && r.status !== 207) { await r.body?.cancel(); throw new Erreur("apple", 502); }
  return reponses(await r.text()).flatMap((x) => {
    const ics = prop(x.corps, "calendar-data");
    if (!ics) return [];
    const href = absolu(x.href, cal), etag = prop(x.corps, "getetag") ?? "";
    return lireEvenements(ics).filter((e) => e.jour >= de && e.jour <= a).map((e) => ({ ...e, cal, href, etag }));
  });
}

/* ---------- Le foyer ---------- */

// Le téléphone envoie son jeton de connexion ; le foyer doit être autorisé à utiliser iCloud.
async function placeDuFoyer(req: Request): Promise<string> {
  const jeton = req.headers.get("authorization");
  if (!jeton?.startsWith("Bearer ")) throw new Erreur("connexion", 401);
  const cle = Deno.env.get("SUPABASE_ANON_KEY") ?? "sb_publishable_2wPVoYlPZUopFvilGr4-Yg_oak9HOi2";
  const supa = createClient(Deno.env.get("SUPABASE_URL")!, cle, { global: { headers: { Authorization: jeton } }, auth: { persistSession: false } });
  const { data, error } = await supa.rpc("icloud_place");
  if (error) throw new Erreur("connexion", 401);
  if (data !== "moi" && data !== "elle") throw new Erreur("pas_autorise", 403);
  return data;
}

/* ---------- Entrée ---------- */

Deno.serve(async (req) => {
  const h = entetes(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: h });
  const repondre = (corps: unknown, statut = 200) => new Response(JSON.stringify(corps), { status: statut, headers: { ...h, "Content-Type": "application/json" } });
  try {
    if (req.method !== "POST") throw new Erreur("methode", 405);
    const place = await placeDuFoyer(req);
    const q = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!q || typeof q.action !== "string") throw new Erreur("demande");
    const auth = connexionApple();

    if (q.action === "lire") {
      const de = String(q.de ?? ""), a = String(q.a ?? "");
      if (!JOUR.test(de) || !JOUR.test(a) || a < de) throw new Erreur("demande");
      const cals = await calendriers(auth);
      // Un calendrier illisible est signalé (echecs) : l'app ne retire pas ses événements pour autant.
      const echecs: string[] = [];
      const evenements = (await Promise.all(cals.map((c) => lire(auth, c.href, de, a).catch(() => { echecs.push(c.href); return [] as Lu[]; })))).flat();
      return repondre({ place, calendriers: cals, evenements, echecs });
    }

    const pourApple = (href: string) => { const u = new URL(href); if (!u.hostname.endsWith(".icloud.com") || u.protocol !== "https:") throw new Erreur("demande"); return href; };

    if (q.action === "ecrire") {
      const c: Champs = {
        uid: String(q.uid ?? "").slice(0, 200), titre: String(q.titre ?? "").slice(0, 200).trim(), note: String(q.note ?? "").slice(0, 2000),
        jour: String(q.jour ?? ""), heure: String(q.heure ?? ""), fin: String(q.fin ?? ""),
      };
      if (!/^[^\r\n]{1,200}$/.test(c.uid) || !c.titre || !JOUR.test(c.jour) || !HEURE.test(c.heure) || !HEURE.test(c.fin)) throw new Erreur("demande");
      let href = typeof q.href === "string" && q.href ? pourApple(q.href) : "";
      let r: Response;
      if (href) {
        const avant = await dav("GET", href, auth);
        if (avant.status === 404) { await avant.body?.cancel(); href = ""; }
        else {
          if (!avant.ok) { await avant.body?.cancel(); throw new Erreur("apple", 502); }
          r = await dav("PUT", href, auth, modifierIcs(await avant.text(), c));
          if (!r.ok) { await r.body?.cancel(); throw new Erreur("apple", 502); }
          await r.body?.cancel();
          return repondre({ href, etag: r.headers.get("etag") ?? "" });
        }
      }
      let cal = typeof q.cal === "string" && q.cal ? pourApple(q.cal) : "";
      if (!cal) cal = await calendrierPourEcrire(auth);
      href = new URL(encodeURIComponent(c.uid) + ".ics", cal.endsWith("/") ? cal : cal + "/").href;
      r = await dav("PUT", href, auth, creerIcs(c), { "If-None-Match": "*" });
      if (!r.ok) { await r.body?.cancel(); throw new Erreur("apple", 502); }
      await r.body?.cancel();
      return repondre({ href, etag: r.headers.get("etag") ?? "" });
    }

    if (q.action === "effacer") {
      const href = pourApple(String(q.href ?? ""));
      const r = await dav("DELETE", href, auth);
      await r.body?.cancel();
      if (!r.ok && r.status !== 404) throw new Erreur("apple", 502);
      return repondre({ ok: true });
    }
    throw new Erreur("demande");
  } catch (e) {
    if (e instanceof Erreur) return repondre({ erreur: e.code }, e.statut);
    console.error("icloud", e);
    return repondre({ erreur: "apple" }, 502);
  }
});
