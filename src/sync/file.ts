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

// « La base » : la ligne telle que le foyer la connaissait, gardée au premier changement fait ici.
// Elle sert à fusionner champ par champ si l'autre change la même ligne avant que ce changement soit parti (voir fusion.ts).
const BASES = "echo-bases";
type Bases = Record<string, unknown>;
export function lireBases(): Bases {
  try { return JSON.parse(localStorage.getItem(BASES) || "{}") as Bases; } catch { return {}; }
}
// Les genres fusionnés champ par champ : les tâches, et les modules qui le demandent (genres.ts).
export const fusionnable = (cle: string) => { const g = cle.slice(0, cle.indexOf(":")); return g === "tache" || !!GENRES[g]?.fusion; };
// Les bases ne sont gardées que si ce téléphone est dans un foyer (le moteur le dit) : seul, il n'y a personne avec qui fusionner,
// et elles s'entasseraient sans jamais être retirées.
let avecBases = false;
export const garderBases = (oui: boolean) => { avecBases = oui; };
// base absente : on l'oublie. Sans base (ou stockage plein), la ligne part comme avant : la dernière arrivée gagne.
export function poserBase(cle: string, base?: unknown) {
  const b = lireBases();
  if (base === undefined || base === null || !avecBases || !fusionnable(cle)) { if (!(cle in b)) return; delete b[cle]; }
  else b[cle] = base;
  try { localStorage.setItem(BASES, JSON.stringify(b)); } catch { /* rien */ }
}

// base : la ligne juste avant ce changement. Elle n'est gardée que pour le premier changement depuis le dernier envoi.
export function noter(cle: string, base?: unknown) {
  const f = lireFile();
  if (!(cle in f)) poserBase(cle, base);
  f[cle] = ++compteur;
  ecrire(f);
  abonnes.forEach((fn) => fn());
}
// Retire ce qui est bien parti, sauf si ça a encore changé pendant l'envoi.
export function retirer(envoyes: File) {
  const f = lireFile();
  for (const [c, n] of Object.entries(envoyes)) if (f[c] === n) { delete f[c]; poserBase(c); }
  ecrire(f);
}
// En entrant dans un autre foyer : ce qui attendait ne vaut plus rien (les clés peuvent même avoir changé de place),
// c'est « partager » qui décide de ce qui part.
export function viderFile() {
  try { localStorage.removeItem(CLE); localStorage.removeItem(BASES); } catch { /* rien */ }
}
export const surChangement = (fn: () => void) => { abonnes.add(fn); return () => abonnes.delete(fn); };

export const cleHoraire = (qui: string, jour: string) => `horaire:${qui}|${jour}`;

// Un changement qui vient de l'autre téléphone est appliqué dans une transaction marquée : il ne repart pas.
const distantes = new WeakSet<Transaction>();
export const marquerDistante = (tx: Transaction) => distantes.add(tx);
export const locale = (tx: Transaction) => !distantes.has(tx);

db.taches.hook("creating", (_pk, obj, tx) => { if (locale(tx)) noter("tache:" + obj.id); });
db.taches.hook("updating", (_m, pk, obj, tx) => { if (locale(tx)) noter("tache:" + pk, obj); });
db.taches.hook("deleting", (pk, obj, tx) => { if (locale(tx)) noter("tache:" + pk, obj); });
db.horaires.hook("creating", (_pk, o, tx) => { if (locale(tx)) noter(cleHoraire(o.qui, o.jour)); });
db.horaires.hook("updating", (_m, _pk, o, tx) => { if (locale(tx)) noter(cleHoraire(o.qui, o.jour)); });
db.horaires.hook("deleting", (_pk, o, tx) => { if (locale(tx)) noter(cleHoraire(o.qui, o.jour)); });

// Les tables des modules : même règle, une clé « genre:clé ».
for (const [genre, { table }] of Object.entries(GENRES)) {
  table.hook("creating", (pk, _o, tx) => { if (locale(tx)) noter(`${genre}:${pk}`); });
  table.hook("updating", (_m, pk, o, tx) => { if (locale(tx)) noter(`${genre}:${pk}`, o); });
  table.hook("deleting", (pk, o, tx) => { if (locale(tx)) noter(`${genre}:${pk}`, o); });
}
