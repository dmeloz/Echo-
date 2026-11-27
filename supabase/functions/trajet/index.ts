// L'heure de départ : combien de temps pour aller d'une adresse à une autre, et quand partir pour arriver à l'heure.
// POST { de, a, jour: AAAA-MM-JJ, arrivee: HH:MM, mode: "moto" | "transports" } → { depart, minutes, mode, ... }.
// Le calcul est dans ../_shared/trajet-calcul.ts. Services gratuits, sans clé : Nominatim (adresses), OSRM (route),
// transport.opendata.ch (CFF). Qui peut l'appeler : comme l'IA (../_shared/garde.ts), avec ses appels comptés.
import { garder } from "../_shared/garde.ts";
import { departMoto, departTransports, lireLieu, lireRoute, urlCorrespondances, urlLieu, urlRoute, type Point } from "../_shared/trajet-calcul.ts";

const ORIGINES = ["https://dmeloz.github.io", "http://localhost:5173", "http://localhost:4173"];
const JOUR = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
// Nominatim demande un nom d'app (pas de données de la personne).
const ENTETES = { "User-Agent": "Echo-foyer/1.0 (app de foyer)", "Accept-Language": "fr" };

function cors(origine: string | null) {
  return {
    "Access-Control-Allow-Origin": origine && ORIGINES.includes(origine) ? origine : ORIGINES[0],
    "Access-Control-Allow-Headers": "content-type, x-echo-code, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const repondre = (corps: unknown, statut: number, origine: string | null) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...cors(origine), "Content-Type": "application/json" } });
const court = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, 200) : "");

async function lireJson(url: string) {
  const r = await fetch(url, { headers: ENTETES, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json();
}
// Les adresses reviennent souvent (la maison, le travail) : gardées le temps que la fonction reste chaude.
const lieux = new Map<string, Point>();
async function lieu(q: string) {
  const k = q.toLowerCase();
  if (lieux.has(k)) return lieux.get(k)!;
  const p = lireLieu(await lireJson(urlLieu(q)));
  if (p) lieux.set(k, p);
  return p;
}

Deno.serve(async (req) => {
  const origine = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origine) });
  if (req.method !== "POST") return repondre({ erreur: "methode" }, 405, origine);
  // deno-lint-ignore no-explicit-any
  let d: any;
  try { d = await req.json(); } catch { return repondre({ erreur: "requete" }, 400, origine); }
  const de = court(d?.de), a = court(d?.a), mode = d?.mode === "transports" ? "transports" : "moto";
  if (!de || !a || !JOUR.test(d?.jour ?? "") || !HEURE.test(d?.arrivee ?? "")) return repondre({ erreur: "requete" }, 400, origine);
  const g = await garder(req, "trajet", { parPersonne: 60, tous: 200 });
  if (!g.ok) return repondre({ erreur: g.erreur }, g.statut, origine);
  try {
    if (mode === "transports") {
      const r = departTransports(await lireJson(urlCorrespondances(de, a, d.jour, d.arrivee)), d.jour, d.arrivee);
      return r ? repondre({ mode, ...r }, 200, origine) : repondre({ erreur: "introuvable" }, 404, origine);
    }
    const [p1, p2] = await Promise.all([lieu(de), lieu(a)]);
    if (!p1 || !p2) return repondre({ erreur: "adresse" }, 404, origine);
    const s = lireRoute(await lireJson(urlRoute(p1, p2)));
    if (!s) return repondre({ erreur: "introuvable" }, 404, origine);
    return repondre({ mode, ...departMoto(d.arrivee, s) }, 200, origine);
  } catch (e) {
    console.error("[trajet]", e instanceof Error ? e.message : e);
    return repondre({ erreur: "service" }, 502, origine);
  }
});
