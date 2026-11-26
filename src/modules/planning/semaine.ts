import { auJour, minutes } from "../../lib/dates";
import { niveau } from "../../lib/importance";
import type { Personne, Tache } from "../../lib/types";
import { CODES, minutesDe, type Code } from "../../lib/horaires";

// Les calculs du planning, sans écran (testés à part).

export const NB_JOURS = 7; // aujourd'hui et les six jours suivants
export const joursAVenir = (now = new Date()) => Array.from({ length: NB_JOURS }, (_, i) => auJour(i, now));

const ordre = (a: Tache, b: Tache) => (a.heure ? minutes(a.heure) : 9999) - (b.heure ? minutes(b.heure) : 9999) || a.cree - b.cree;

// Ce qui est prévu un jour donné (ce qui n'est pas fait). Aujourd'hui garde aussi ce qui est en retard.
export function duJour(taches: Tache[], jour: string, today: string): Tache[] {
  return taches.filter((t) => !t.fait && (t.jour === jour || (jour === today && t.jour < today))).sort(ordre);
}
export const faitesDuJour = (taches: Tache[], jour: string) => taches.filter((t) => t.fait && t.faitLe === jour).sort(ordre);

export const concerne = (t: Tache, p: Personne) => t.qui === p || t.qui === "nous";
export const charge = (taches: Tache[], p: Personne) => taches.filter((t) => concerne(t, p)).length;

export interface Proposition { pour: Personne; tache: Tache; de: string; vers: string; nbDe: number; nbVers: number }

// Une idée simple pour alléger la semaine : le jour le plus chargé d'une personne a au moins
// trois choses de plus que son jour le plus calme ; on propose d'y déplacer la chose la moins importante.
// On ne touche pas à aujourd'hui (ni comme départ ni comme arrivée) ni aux tâches à deux, qui ont une heure ou qui reviennent.
export function proposerDeplacement(taches: Tache[], ordrePersonnes: Personne[], now = new Date()): Proposition | null {
  const jours = joursAVenir(now).slice(1);
  const today = auJour(0, now);
  for (const p of ordrePersonnes) {
    const nb = jours.map((j) => charge(duJour(taches, j, today), p));
    const max = Math.max(...nb), min = Math.min(...nb);
    if (max - min < 3) continue;
    const de = jours[nb.indexOf(max)], vers = jours[nb.indexOf(min)];
    const candidates = duJour(taches, de, today)
      .filter((t) => t.qui === p && !t.heure && !t.repete)
      .sort((a, b) => niveau(a, now) - niveau(b, now) || a.cree - b.cree);
    if (candidates[0]) return { pour: p, tache: candidates[0], de, vers, nbDe: max, nbVers: min };
  }
  return null;
}

export interface IdeeRepos { tache: Tache; de: string; vers: string }

// Une idée pour les jours de repos : une petite chose posée un jour de travail (sans heure, pas répétée)
// irait mieux un jour de repos. On part du jour où l'on travaille le plus, la chose la moins importante,
// vers le jour de repos le plus calme de la semaine. Aujourd'hui n'est jamais touché.
export function proposerRepos(taches: Tache[], travail: Map<string, Code>, p: Personne, now = new Date()): IdeeRepos | null {
  const jours = joursAVenir(now).slice(1);
  const today = auJour(0, now);
  const repos = jours.filter((j) => travail.get(j) === "R");
  if (!repos.length) return null;
  const pourP = (j: string) => duJour(taches, j, today).filter((t) => t.qui === p && t.jour === j);
  const vers = repos.reduce((a, b) => (pourP(b).length < pourP(a).length ? b : a));
  const charges = jours
    .filter((j) => { const c = travail.get(j); return c && CODES[c].travail; })
    .sort((a, b) => minutesDe(travail.get(b)!) - minutesDe(travail.get(a)!) || a.localeCompare(b));
  for (const de of charges) {
    const t = pourP(de).filter((x) => !x.heure && !x.repete).sort((a, b) => niveau(a, now) - niveau(b, now) || a.cree - b.cree)[0];
    if (t) return { tache: t, de, vers };
  }
  return null;
}
