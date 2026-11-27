import type { Transaction } from "dexie";
import { db } from "../../data/db";
import { locale } from "../../sync/file";

// Annuler une action d'Echo plus tard, depuis son journal (Réglages → Echo), et pas seulement dans les 10 secondes.
// Pendant qu'Echo fait une action, on note chaque ligne qu'elle touche : ce qu'elle était avant, ce qu'elle est après.
// Annuler remet l'« avant », seulement si la ligne est encore comme Echo l'a laissée (sinon quelqu'un l'a changée depuis :
// on n'écrase pas son geste). Gardé sur ce téléphone, pour les 30 dernières actions, 7 jours.

export interface Retour { table: string; cle: string; avant: unknown | null; apres: unknown | null }
interface Garde { quand: number; retours: Retour[] }
const CLE = "echoRetours";
export const MAX_RETOURS = 30;
export const DUREE_RETOUR = 7 * 86_400_000;
// Ce qui ne s'annule pas : les réglages, le journal lui-même, les photos, les horaires (clé double, jamais touchés par Echo).
const HORS = new Set(["reglages", "echo_journal", "photos", "horaires"]);
const copie = <T>(x: T): T => (x == null ? x : structuredClone(x));
// Même contenu, quel que soit l'ordre des champs (une ligne revenue du serveur peut les ranger autrement).
const range = (_k: string, v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v);
const pareil = (a: unknown, b: unknown) => JSON.stringify(a ?? null, range) === JSON.stringify(b ?? null, range);

// Fait l'action en notant les lignes qu'elle touche (les changements venus de l'autre téléphone ne comptent pas).
export async function suivre<T>(faire: () => Promise<T>): Promise<{ resultat: T; retours: Retour[] }> {
  const vus = new Map<string, Retour>();
  const voir = (table: string, cle: unknown, avant: unknown, tx: Transaction) => {
    if (typeof cle !== "string" || !locale(tx)) return;
    const k = `${table}|${cle}`;
    if (!vus.has(k)) vus.set(k, { table, cle, avant: copie(avant) ?? null, apres: null });
  };
  const tables = db.tables.filter((t) => !HORS.has(t.name));
  const poses = tables.map((t) => {
    const creer = (pk: unknown, _o: unknown, tx: Transaction) => { voir(t.name, pk, null, tx); };
    const changer = (_m: unknown, pk: unknown, o: unknown, tx: Transaction) => { voir(t.name, pk, o, tx); };
    const effacer = (pk: unknown, o: unknown, tx: Transaction) => { voir(t.name, pk, o, tx); };
    t.hook("creating", creer); t.hook("updating", changer); t.hook("deleting", effacer);
    return () => { t.hook("creating").unsubscribe(creer); t.hook("updating").unsubscribe(changer); t.hook("deleting").unsubscribe(effacer); };
  });
  try {
    const resultat = await faire();
    const retours = [...vus.values()];
    for (const r of retours) r.apres = copie(await db.table(r.table).get(r.cle)) ?? null;
    return { resultat, retours: retours.filter((r) => !pareil(r.avant, r.apres)) };
  } finally {
    for (const oter of poses) oter();
  }
}

const lire = async (): Promise<Record<string, Garde>> => {
  const v = (await db.reglages.get(CLE))?.valeur;
  return v && typeof v === "object" ? (v as Record<string, Garde>) : {};
};
const ecrire = (tout: Record<string, Garde>, now = Date.now()) => db.reglages.put({
  cle: CLE,
  valeur: Object.fromEntries(Object.entries(tout).filter(([, g]) => now - g.quand < DUREE_RETOUR).sort((a, b) => b[1].quand - a[1].quand).slice(0, MAX_RETOURS)),
});
export async function garderRetours(id: string, retours: Retour[], now = Date.now()) {
  if (retours.length) await ecrire({ ...(await lire()), [id]: { quand: now, retours } }, now);
}
export async function oublierRetours(id: string) {
  const tout = await lire();
  if (id in tout) { delete tout[id]; await ecrire(tout); }
}
// Les lignes du journal qu'on peut encore annuler d'ici.
export async function annulables(now = Date.now()): Promise<Set<string>> {
  return new Set(Object.entries(await lire()).filter(([, g]) => now - g.quand < DUREE_RETOUR).map(([id]) => id));
}

// Annuler depuis le journal. remis : les lignes remises comme avant ; changes : celles laissées (modifiées depuis).
export async function annulerDuJournal(id: string, now = Date.now()): Promise<{ remis: number; changes: number } | null> {
  const g = (await lire())[id];
  if (!g || now - g.quand >= DUREE_RETOUR) return null;
  const noms = [...new Set(g.retours.map((r) => r.table))].filter((n) => db.tables.some((t) => t.name === n));
  let remis = 0, changes = 0;
  await db.transaction("rw", noms.map((n) => db.table(n)), async () => {
    for (const r of [...g.retours].reverse()) {
      if (!noms.includes(r.table)) continue;
      const t = db.table(r.table);
      if (!pareil(await t.get(r.cle), r.apres)) { changes++; continue; }
      if (r.avant == null) await t.delete(r.cle); else await t.put(r.avant);
      remis++;
    }
  });
  // Rien remis : la ligne reste telle quelle dans le journal (tout a changé depuis).
  if (remis) await db.echo_journal.update(id, { annule: now });
  await oublierRetours(id);
  return { remis, changes };
}
