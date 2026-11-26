import { minutes } from "./dates";
import { niveau } from "./importance";
import type { Niveau, Tache } from "./types";

// L'ordre de la journée : d'abord l'importance, puis le rang choisi à la main, puis l'heure.
export const triJour = (now: Date) => (a: Tache, b: Tache) =>
  (niveau(b, now) - niveau(a, now))
  || ((a.ordre ?? Infinity) - (b.ordre ?? Infinity) || 0)
  || ((a.heure ? minutes(a.heure) : 9999) - (b.heure ? minutes(b.heure) : 9999))
  || a.jour.localeCompare(b.jour) || a.cree - b.cree;

export interface Rang { id: string; niveau: Niveau | null; ordre: number }

// Poser une tâche avant une autre (avantId = null : tout en bas). « liste » est déjà triée.
// La tâche prend l'importance de sa nouvelle voisine, et toutes celles de cette importance sont numérotées.
// Ne rend que ce qui change vraiment.
export function reordonner(liste: Tache[], id: string, avantId: string | null, now = new Date()): Rang[] {
  const t = liste.find((x) => x.id === id);
  if (!t || id === avantId) return [];
  const sans = liste.filter((x) => x.id !== id);
  const i = avantId ? sans.findIndex((x) => x.id === avantId) : sans.length;
  if (i < 0) return [];
  const voisine = sans[i - 1] ?? sans[i];
  const n = voisine ? niveau(voisine, now) : niveau(t, now);
  const apres = [...sans.slice(0, i), t, ...sans.slice(i)];
  if (apres.every((x, k) => x === liste[k])) return []; // reposée au même endroit
  return apres
    .filter((x) => x.id === id || niveau(x, now) === n)
    .map((x, k) => ({ id: x.id, niveau: x.id === id && niveau(t, now) !== n ? n : x.niveau, ordre: k }))
    .filter((r) => { const x = liste.find((y) => y.id === r.id)!; return x.ordre !== r.ordre || x.niveau !== r.niveau; });
}
