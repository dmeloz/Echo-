import { iso, plusJours } from "./dates";
import { aHorairesFixes, paques, reglesDe } from "./fixes";
import type { Horaire } from "./horaires";
import type { Noms, Personne } from "./types";

// Les vacances de l'année, posées par semaines (du lundi). Elles s'enregistrent comme des jours « VAC »
// dans les horaires, donc elles se synchronisent et s'affichent partout comme le reste.

export const lundiDe = (jour: string) => plusJours(jour, -((new Date(jour + "T12:00:00").getDay() + 6) % 7));
// Les jours qu'une semaine de vacances couvre : du lundi au vendredi pour des horaires fixes, toute la semaine sinon.
export const joursDeSemaine = (lundi: string, fixe: boolean) => Array.from({ length: fixe ? 5 : 7 }, (_, i) => plusJours(lundi, i));

// L'année dont on prépare les vacances : la suivante dès novembre.
export const anneeVacances = (now = new Date()) => now.getFullYear() + (now.getMonth() >= 10 ? 1 : 0);

// Les semaines de vacances de quelqu'un dans l'année : lundi → nombre de jours de vacances.
export function semainesDe(horaires: Horaire[], qui: Personne, annee: number): Map<string, number> {
  const m = new Map<string, number>();
  for (const h of horaires) {
    if (h.qui !== qui || h.code !== "VAC") continue;
    const l = lundiDe(h.jour);
    if (Number(l.slice(0, 4)) !== annee) continue;
    m.set(l, (m.get(l) ?? 0) + 1);
  }
  return m;
}
// Combien de semaines sont posées (5 jours = une semaine, une semaine ne compte jamais plus d'une fois).
export const compte = (s: Map<string, number>) => Math.round([...s.values()].reduce((n, j) => n + Math.min(j, 5) / 5, 0) * 10) / 10;

// Les bonnes semaines, dans l'ordre où Echo les propose : l'été, Noël, Pâques, l'automne, puis le reste de l'été, février, l'Ascension.
function semainesPreferees(annee: number): string[] {
  const p = paques(annee);
  const nieme = (mois: number, n: number) => { const d = new Date(annee, mois, 1, 12); return plusJours(iso(d), ((8 - d.getDay()) % 7) + 7 * (n - 1)); };
  const noel = lundiDe(`${annee}-12-24`);
  return [nieme(6, 3), nieme(6, 4), noel, lundiDe(plusJours(p, 1)), nieme(9, 3), nieme(7, 1), nieme(1, 2), lundiDe(plusJours(p, 39)), nieme(9, 4), nieme(7, 2)]
    .filter((l) => l.startsWith(String(annee)));
}

export interface Proposition { lundi: string; qui: Personne[] }

// Echo propose le reste : d'abord des semaines ensemble (autant que les deux en ont encore), puis celles de celui qui en a le plus.
// Il évite les semaines déjà prises par l'un ou l'autre.
export function proposer(horaires: Horaire[], noms: Noms, annee: number): Proposition[] {
  const gens: Personne[] = (["moi", "elle"] as Personne[]).filter((p) => reglesDe(noms[p]));
  const semaines = new Map(gens.map((p) => [p, semainesDe(horaires, p, annee)]));
  const reste = new Map(gens.map((p) => [p, Math.max(0, Math.floor(reglesDe(noms[p])!.vacances - compte(semaines.get(p)!)))]));
  const prise = (l: string) => gens.some((p) => semaines.get(p)!.has(l));
  const libres = [...semainesPreferees(annee)];
  // Si les bonnes semaines ne suffisent pas, n'importe quel autre lundi de l'année.
  for (let l = lundiDe(`${annee}-01-08`); l.startsWith(String(annee)); l = plusJours(l, 7)) if (!libres.includes(l)) libres.push(l);
  const res: Proposition[] = [];
  for (const l of libres) {
    if (prise(l)) continue;
    const qui = gens.filter((p) => reste.get(p)! > 0);
    if (!qui.length) break;
    // Ensemble tant que les deux en ont ; ensuite seul.
    res.push({ lundi: l, qui });
    for (const p of qui) reste.set(p, reste.get(p)! - 1);
  }
  return res.sort((a, b) => a.lundi.localeCompare(b.lundi));
}

// Les jours à poser pour une semaine de vacances de quelqu'un.
export const joursVacances = (lundi: string, noms: Noms, qui: Personne) => joursDeSemaine(lundi, aHorairesFixes(noms, qui));
