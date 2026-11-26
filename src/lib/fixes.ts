import { iso, plusJours, sansAccents } from "./dates";
import type { Code, Horaire } from "./horaires";
import type { Noms, Personne } from "./types";

// Les horaires fixes : Sarah travaille du lundi au vendredi, 7 h 30 – 17 h, jamais autrement.
// Echo les calcule tout seul (rien à remplir) ; un jour posé à la main (vacances…) passe devant.
// Les jours fériés vaudois sont des jours de repos pour elle (pas pour Dany : la cuisine travaille ces jours-là).
// Vacances par an : Sarah 4 semaines, Dany 6.
interface Regles { fixe: boolean; vacances: number }
const REGLES: Record<string, Regles> = {
  sarah: { fixe: true, vacances: 4 },
  dany: { fixe: false, vacances: 6 },
};
export const reglesDe = (nom: string): Regles | undefined => REGLES[sansAccents(nom.trim())];
export const aHorairesFixes = (noms: Noms, p: Personne) => !!reglesDe(noms[p])?.fixe;

const jourSemaine = (jour: string) => new Date(jour + "T12:00:00").getDay(); // 0 = dimanche

// Pâques (calcul de Meeus), pour les fériés qui bougent.
export function paques(annee: number): string {
  const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
  return iso(new Date(annee, mois - 1, jour, 12));
}

// Les jours fériés officiels du canton de Vaud.
export function feriesVaud(annee: number): Map<string, string> {
  const p = paques(annee);
  const sept1 = new Date(annee, 8, 1, 12);
  const troisiemeDimSept = iso(new Date(annee, 8, 1 + ((7 - sept1.getDay()) % 7) + 14, 12));
  return new Map([
    [`${annee}-01-01`, "Nouvel An"],
    [`${annee}-01-02`, "Saint-Berchtold"],
    [plusJours(p, -2), "Vendredi saint"],
    [plusJours(p, 1), "Lundi de Pâques"],
    [plusJours(p, 39), "Ascension"],
    [plusJours(p, 50), "Lundi de Pentecôte"],
    [`${annee}-08-01`, "Fête nationale"],
    [plusJours(troisiemeDimSept, 1), "Lundi du Jeûne"],
    [`${annee}-12-25`, "Noël"],
  ]);
}

const feries = new Map<number, Map<string, string>>();
export const ferie = (jour: string) => {
  const a = Number(jour.slice(0, 4));
  if (!feries.has(a)) feries.set(a, feriesVaud(a));
  return feries.get(a)!.get(jour);
};

// Le code d'un jour pour quelqu'un aux horaires fixes.
export function codeFixe(jour: string): Code {
  const js = jourSemaine(jour);
  if (js === 0 || js === 6) return "R";
  return ferie(jour) ? "FER" : "FIX";
}

// Les horaires posés + les horaires fixes calculés de du au (inclus). Ce qui est posé passe devant.
export function completer(poses: Horaire[], noms: Noms, du: string, au: string): Horaire[] {
  const fixes = (["moi", "elle"] as Personne[]).filter((p) => aHorairesFixes(noms, p));
  if (!fixes.length) return poses;
  const deja = new Set(poses.map((h) => h.qui + "|" + h.jour));
  const res = [...poses];
  for (let j = du; j <= au; j = plusJours(j, 1)) {
    for (const qui of fixes) if (!deja.has(qui + "|" + j)) res.push({ qui, jour: j, code: codeFixe(j) });
  }
  return res;
}
