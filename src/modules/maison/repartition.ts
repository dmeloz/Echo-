import { auJour, plusJours } from "../../lib/dates";
import { CODES, minutesDe as minutesTravail, type Horaire } from "../../lib/horaires";
import type { Personne } from "../../lib/types";
import { equilibre, jourDu, minutesDe, type Corvee, type Fait } from "./donnees";

// Répartir la semaine : qui prend quoi, d'après le temps libre de chacun (ses horaires de travail) et ce que chacun a déjà fait.
// Fichier sans écran : il propose, rien n'est écrit. La page (Repartir.tsx) montre la proposition, on la change, puis on valide.

const EVEIL = 16 * 60; // minutes éveillées dans une journée : le temps libre d'un jour est ce qui reste après le travail
const DEUX: Personne[] = ["moi", "elle"];
const ecart = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00") - Date.parse(a + "T12:00:00")) / 86_400_000);

export interface Part { corvee: Corvee; fois: number; min: number; qui: Personne; fixe: boolean }
export interface Proposition {
  parts: Part[];                      // les corvées de la semaine, les plus longues d'abord
  travail: Record<Personne, number>;  // minutes de travail sur les 7 jours (0 si aucun horaire n'est posé)
  jusqu: string;                      // le dernier jour de la semaine répartie
}

// Les minutes de corvées de chacun dans une proposition (après les changements faits à la main aussi).
export const minutesDeChacun = (parts: Array<Pick<Part, "min" | "qui">>): Record<Personne, number> =>
  parts.reduce((m, p) => ({ ...m, [p.qui]: m[p.qui] + p.min }), { moi: 0, elle: 0 } as Record<Personne, number>);

export function repartir(corvees: Corvee[], horaires: Horaire[], faits: Fait[], now = new Date()): Proposition {
  const debut = auJour(0, now), jusqu = plusJours(debut, 6);
  const travail: Record<Personne, number> = { moi: 0, elle: 0 };
  for (const h of horaires) if (h.jour >= debut && h.jour <= jusqu && CODES[h.code]?.travail) travail[h.qui] += minutesTravail(h.code);
  const libre: Record<Personne, number> = { moi: Math.max(60, 7 * EVEIL - travail.moi), elle: Math.max(60, 7 * EVEIL - travail.elle) };

  // Ce qui tombe dans les 7 jours, et combien de fois (la vaisselle de tous les jours compte 7 fois).
  const semaine = corvees.filter((c) => !c.entretien).flatMap((c) => {
    const du = jourDu(c), premier = du < debut ? debut : du;
    if (premier > jusqu) return [];
    const fois = 1 + Math.floor(ecart(premier, jusqu) / Math.max(1, c.tous));
    return [{ corvee: c, fois, min: fois * minutesDe(c.taille) }];
  }).sort((a, b) => b.min - a.min || a.corvee.nom.localeCompare(b.corvee.nom));

  // La charge de départ : ce que chacun a fait en moyenne par semaine ces 4 dernières semaines. Qui a moins fait reprend un peu plus.
  const e = equilibre(faits, now.getTime());
  const charge: Record<Personne, number> = { moi: e.moi / 4, elle: e.elle / 4 };
  const parts: Part[] = [];
  // D'abord ce qui est déjà donné à quelqu'un pour de bon : on n'y touche pas, mais ça pèse dans sa semaine.
  for (const s of semaine) if (s.corvee.qui === "moi" || s.corvee.qui === "elle") { charge[s.corvee.qui] += s.min; parts.push({ ...s, qui: s.corvee.qui, fixe: true }); }
  // Puis le reste, du plus long au plus court, à celui dont la semaine est la moins chargée pour son temps libre.
  for (const s of semaine) {
    if (s.corvee.qui === "moi" || s.corvee.qui === "elle") continue;
    const poids = (p: Personne) => (charge[p] + s.min) / libre[p];
    const qui = DEUX.reduce((a, b) => (poids(b) < poids(a) ? b : a));
    charge[qui] += s.min;
    parts.push({ ...s, qui, fixe: false });
  }
  parts.sort((a, b) => b.min - a.min || a.corvee.nom.localeCompare(b.corvee.nom));
  return { parts, travail, jusqu };
}

// « 42 h », « 37 h 30 » : les heures de travail de la semaine, dites simplement.
export const heuresDites = (min: number) => `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, "0")}` : ""}`;
