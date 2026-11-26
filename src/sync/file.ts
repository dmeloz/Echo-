import type { Transaction } from "dexie";
import { db } from "../data/db";
import { GENRES } from "./genres";

// La file d'envoi : la liste de ce qui a changé sur ce téléphone et n'est pas encore parti au foyer.
// Elle ne garde que des clés (« tache:abc », « horaire:moi|2026-11-26 ») : au moment d'envoyer,
// on relit l'état actuel dans la base. Absent = supprimé.

const CLE = "echo-a-envoyer";
type File = Record<string, number>; // clé → numéro du dernier changement
let compteur = Date.now();
const abonnes = new Set<() => void>();

export function lireFile(): File {
  try { return JSON.parse(localStorage.getItem(CLE) || "{}") as File; } catch { return {}; }
}
const ecrire = (f: File) => { try { localStorage.setItem(CLE, JSON.stringify(f)); } catch { /* stockage plein : on renverra tout à la prochaine connexion */ } };

export function noter(cle: string) {
  const f = lireFile();
  f[cle] = ++compteur;
  ecrire(f);
  abonnes.forEach((fn) => fn());
}
// Retire ce qui est bien parti, sauf si ça a encore changé pendant l'envoi.
export function retirer(envoyes: File) {
  const f = lireFile();
  for (const [c, n] of Object.entries(envoyes)) if (f[c] === n) delete f[c];
  ecrire(f);
}
export const surChangement = (fn: () => void) => { abonnes.add(fn); return () => abonnes.delete(fn); };

export const cleHoraire = (qui: string, jour: string) => `horaire:${qui}|${jour}`;

// Un changement qui vient de l'autre téléphone est appliqué dans une transaction marquée : il ne repart pas.
const distantes = new WeakSet<Transaction>();
export const marquerDistante = (tx: Transaction) => distantes.add(tx);
export const locale = (tx: Transaction) => !distantes.has(tx);

db.taches.hook("creating", (_pk, obj, tx) => { if (locale(tx)) noter("tache:" + obj.id); });
db.taches.hook("updating", (_m, pk, _obj, tx) => { if (locale(tx)) noter("tache:" + pk); });
db.taches.hook("deleting", (pk, _obj, tx) => { if (locale(tx)) noter("tache:" + pk); });
db.horaires.hook("creating", (_pk, o, tx) => { if (locale(tx)) noter(cleHoraire(o.qui, o.jour)); });
db.horaires.hook("updating", (_m, _pk, o, tx) => { if (locale(tx)) noter(cleHoraire(o.qui, o.jour)); });
db.horaires.hook("deleting", (_pk, o, tx) => { if (locale(tx)) noter(cleHoraire(o.qui, o.jour)); });

// Les tables des modules : même règle, une clé « genre:clé ».
for (const [genre, { table }] of Object.entries(GENRES)) {
  table.hook("creating", (pk, _o, tx) => { if (locale(tx)) noter(`${genre}:${pk}`); });
  table.hook("updating", (_m, pk, _o, tx) => { if (locale(tx)) noter(`${genre}:${pk}`); });
  table.hook("deleting", (pk, _o, tx) => { if (locale(tx)) noter(`${genre}:${pk}`); });
}
