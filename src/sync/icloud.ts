import type { Transaction } from "dexie";
import { db } from "../data/db";
import { auJour } from "../lib/dates";
import type { Personne, Tache } from "../lib/types";
import { supa } from "./client";
import { locale } from "./file";

// Le calendrier iCloud, dans les deux sens, par la fonction serveur « icloud ».
// Lire : les événements d'iCloud deviennent des événements d'Echo (même id sur les deux téléphones).
// Écrire : un événement créé, changé ou supprimé dans Echo part vers iCloud (file d'attente gardée sur le téléphone).

const FILE = "echo-icloud-envoi";
const DE = -7, A = 90; // la fenêtre lue : une semaine en arrière, trois mois devant

export interface Calendrier { href: string; nom: string }
interface Lu { uid: string; rid: string; titre: string; note: string; jour: string; heure: string; fin: string; serie: boolean; href: string }
interface Reponse { place: Personne; calendriers: Calendrier[]; evenements: Lu[]; echecs?: string[] }

const MESSAGES: Record<string, string> = {
  pas_configure: "iCloud n'est pas encore branché sur le serveur : il manque l'identifiant Apple et le mot de passe pour app.",
  apple_refuse: "Apple refuse la connexion. Vérifie le mot de passe pour app sur le serveur.",
  pas_autorise: "Ton foyer n'a pas encore accès à iCloud.",
  connexion: "Ce téléphone n'est pas connecté au foyer. Va dans Réglages, Synchro.",
  pas_de_calendrier: "Aucun calendrier trouvé dans iCloud.",
  apple: "iCloud ne répond pas pour le moment. Réessaie plus tard.",
};

let actif = false;
export const icloudActif = () => actif;

async function appeler<T>(corps: Record<string, unknown>): Promise<T> {
  if (!navigator.onLine) throw new Error("Pas de connexion internet.");
  const { data, error } = await supa.functions.invoke("icloud", { body: corps });
  if (error) {
    const r = (error as { context?: Response }).context;
    const code = r && typeof r.json === "function" ? ((await r.json().catch(() => ({}))) as { erreur?: string }).erreur : undefined;
    throw new Error(MESSAGES[code ?? ""] ?? "iCloud ne répond pas pour le moment. Réessaie plus tard.");
  }
  return data as T;
}

/* ---------- Lire ---------- */

// Un id court et stable, le même sur les deux téléphones.
function empreinte(s: string) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}

// Les écritures qui viennent d'iCloud ne repartent pas vers iCloud.
const depuisIcloud = new WeakSet<Transaction>();

// Ce qui arrive d'iCloud, comparé à ce que le téléphone a déjà : à ajouter, à changer, à retirer.
export function fusionner(taches: Tache[], r: Reponse, de: string, a: string, now = Date.now()): { mettre: Tache[]; retirer: string[] } {
  const parUid = new Map(taches.filter((t) => t.ical && !t.ical.serie).map((t) => [t.ical!.uid, t]));
  const parId = new Map(taches.map((t) => [t.id, t]));
  const vus = new Set<string>();
  const mettre: Tache[] = [];
  for (const e of r.evenements) {
    const id = e.rid ? "ic-" + empreinte(e.uid + "|" + e.rid) : parUid.get(e.uid)?.id ?? (parId.get(e.uid)?.evt ? e.uid : "ic-" + empreinte(e.uid));
    if (vus.has(id)) continue;
    vus.add(id);
    const avant = parId.get(id);
    const t: Tache = {
      id, titre: e.titre.slice(0, 140), qui: avant?.qui ?? r.place, jour: e.jour, heure: e.heure, niveau: null, repete: "", note: e.note,
      fait: null, faitLe: null, suite: null, cree: avant?.cree ?? now, evt: true, ...(e.fin ? { fin: e.fin } : {}),
      ical: { uid: e.uid, href: e.href, ...(e.serie ? { serie: true } : {}) },
    };
    const pareil = avant && avant.titre === t.titre && avant.jour === t.jour && avant.heure === t.heure && (avant.fin ?? "") === (t.fin ?? "")
      && avant.note === t.note && avant.ical?.href === t.ical?.href && !!avant.ical?.serie === !!t.ical?.serie && avant.evt;
    if (!pareil) mettre.push(t);
  }
  const echec = (href: string) => (r.echecs ?? []).some((c) => href.startsWith(c));
  const retirer = taches.filter((t) => t.ical && t.jour >= de && t.jour <= a && !vus.has(t.id) && !echec(t.ical.href) && !(t.id in lireFile())).map((t) => t.id);
  return { mettre, retirer };
}

export async function lireIcloud(): Promise<Calendrier[]> {
  const de = auJour(DE), a = auJour(A);
  const r = await appeler<Reponse>({ action: "lire", de, a });
  await db.transaction("rw", db.taches, db.photos, async (tx) => {
    depuisIcloud.add(tx);
    const { mettre, retirer } = fusionner(await db.taches.toArray(), r, de, a);
    if (mettre.length) await db.taches.bulkPut(mettre);
    if (retirer.length) { await db.taches.bulkDelete(retirer); await db.photos.where("tacheId").anyOf(retirer).delete(); }
  });
  await db.reglages.bulkPut([{ cle: "icloudCals", valeur: r.calendriers }, { cle: "icloudLu", valeur: Date.now() }]);
  return r.calendriers;
}

/* ---------- Écrire ---------- */

type Envoi = Record<string, { href?: string }>;
function lireFile(): Envoi { try { return JSON.parse(localStorage.getItem(FILE) || "{}") as Envoi; } catch { return {}; } }
const ecrireFile = (f: Envoi) => { try { localStorage.setItem(FILE, JSON.stringify(f)); } catch { /* rien */ } };
let minuteur: ReturnType<typeof setTimeout> | undefined;
function noter(id: string, href?: string) {
  const f = lireFile();
  f[id] = { href: href ?? f[id]?.href };
  ecrireFile(f);
  clearTimeout(minuteur);
  minuteur = setTimeout(() => void envoyer(), 1500);
}

const aEnvoyer = (t: Partial<Tache> | undefined) => !!t && (!!t.evt || !!t.ical) && !t.ical?.serie;
db.taches.hook("creating", (_pk, o, tx) => { if (actif && locale(tx) && !depuisIcloud.has(tx) && aEnvoyer(o)) noter(o.id); });
db.taches.hook("updating", (mods, pk, o, tx) => {
  if (!actif || !locale(tx) || depuisIcloud.has(tx)) return;
  const apres = { ...o, ...(mods as Partial<Tache>) };
  if (aEnvoyer(o) || aEnvoyer(apres)) noter(String(pk), o.ical?.href);
});
db.taches.hook("deleting", (pk, o, tx) => { if (actif && locale(tx) && !depuisIcloud.has(tx) && o?.ical?.href && !o.ical.serie) noter(String(pk), o.ical.href); });

let enCours = false;
export async function envoyer() {
  if (enCours || !actif || !navigator.onLine) return;
  enCours = true;
  try {
    const cal = ((await db.reglages.get("icloudCal"))?.valeur as string | undefined) ?? "";
    for (const [id, { href }] of Object.entries(lireFile())) {
      const t = await db.taches.get(id);
      try {
        if (!t || !t.evt) {
          if (href) await appeler({ action: "effacer", href });
          if (t?.ical) await db.transaction("rw", db.taches, async (tx) => { depuisIcloud.add(tx); await db.taches.update(id, { ical: undefined }); });
        } else {
          const r = await appeler<{ href: string }>({
            action: "ecrire", cal, href: t.ical?.href ?? href ?? "", uid: t.ical?.uid ?? t.id,
            titre: t.titre, note: t.note, jour: t.jour, heure: t.heure, fin: t.fin ?? "",
          });
          await db.transaction("rw", db.taches, async (tx) => { depuisIcloud.add(tx); await db.taches.update(id, { ical: { uid: t.ical?.uid ?? t.id, href: r.href } }); });
        }
        const f = lireFile();
        delete f[id];
        ecrireFile(f);
      } catch (e) {
        console.warn("[Echo iCloud]", e);
        break; // on réessaiera plus tard, dans l'ordre
      }
    }
  } finally { enCours = false; }
}

/* ---------- Démarrage ---------- */

let derniereLecture = 0;
async function rafraichir() {
  if (!actif || Date.now() - derniereLecture < 5 * 60_000) return;
  derniereLecture = Date.now();
  await envoyer();
  await lireIcloud().catch((e) => console.warn("[Echo iCloud]", e));
}

let ecoute = false;
export async function demarrerIcloud() {
  actif = !!(await db.reglages.get("icloud"))?.valeur;
  if (!ecoute && typeof window !== "undefined") {
    ecoute = true;
    document.addEventListener("visibilitychange", () => { if (!document.hidden) void rafraichir(); });
    addEventListener("online", () => void envoyer());
  }
  void rafraichir();
}

// Le réglage : brancher lit tout de suite (et dit ce qui ne va pas), débrancher arrête les envois.
export async function brancherIcloud(oui: boolean): Promise<Calendrier[]> {
  if (!oui) { actif = false; await db.reglages.put({ cle: "icloud", valeur: false }); return []; }
  actif = true;
  try {
    const cals = await lireIcloud();
    await db.reglages.put({ cle: "icloud", valeur: true });
    derniereLecture = Date.now();
    return cals;
  } catch (e) {
    actif = false;
    throw e;
  }
}

export async function synchroniserIcloud() {
  derniereLecture = 0;
  await envoyer();
  return lireIcloud();
}
