import { auJour, minutes } from "../../lib/dates";
import { niveau } from "../../lib/importance";
import type { Personne, Tache } from "../../lib/types";

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
