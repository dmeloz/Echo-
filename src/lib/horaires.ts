import { heureFr, iso, minutes, sansAccents } from "./dates";
import type { Personne } from "./types";

// Les horaires de travail : un code par jour, comme sur la fiche du chef (C1 à C6, Repos, VAC…).
// On simplifie la fiche : pas de matin / après-midi séparés, un seul code pour la journée.

export interface Horaire { qui: Personne; jour: string; code: Code }
export type Code = "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "R" | "VAC" | "CHR" | "FIX" | "FER";
// auto : un code qu'Echo calcule tout seul (les horaires fixes de Sarah), jamais posé à la main.
interface InfoCode { court: string; libelle: string; plages: Array<[string, string]>; travail: boolean; rare?: boolean; auto?: boolean }

export const CODES: Record<Code, InfoCode> = {
  C1: { court: "C1", libelle: "Coupé", plages: [["09:00", "14:00"], ["18:30", "22:30"]], travail: true },
  C5: { court: "C5", libelle: "Journée", plages: [["08:00", "16:30"]], travail: true },
  C6: { court: "C6", libelle: "Midi-soir", plages: [["12:00", "21:00"]], travail: true },
  R: { court: "Repos", libelle: "Repos", plages: [], travail: false },
  VAC: { court: "Vac.", libelle: "Vacances", plages: [], travail: false },
  C2: { court: "C2", libelle: "Matin long", plages: [["09:00", "15:00"]], travail: true, rare: true },
  C3: { court: "C3", libelle: "Après-midi", plages: [["14:00", "22:00"]], travail: true, rare: true },
  C4: { court: "C4", libelle: "Matin", plages: [["09:00", "14:00"]], travail: true, rare: true },
  CHR: { court: "Congé", libelle: "Congé", plages: [], travail: false },
  FIX: { court: "", libelle: "Travail", plages: [["07:30", "17:00"]], travail: true, auto: true },
  FER: { court: "Férié", libelle: "Férié", plages: [], travail: false, auto: true },
};
const aLaMain = (Object.keys(CODES) as Code[]).filter((c) => !CODES[c].auto);
export const CODES_COURANTS = aLaMain.filter((c) => !CODES[c].rare);
export const CODES_RARES = aLaMain.filter((c) => CODES[c].rare);

const h = (x: string) => heureFr(x).replace(/^0/, "");
const plageFr = ([a, b]: [string, string]) => `${h(a)} – ${h(b)}`;
// « 9 h – 14 h et 18 h 30 – 22 h 30 », ou rien pour un jour sans heures connues.
export const heuresDe = (code: Code) => CODES[code].plages.map(plageFr).join(" et ");
export const debutDe = (code: Code) => CODES[code].plages[0]?.[0] ?? "";
export const minutesDe = (code: Code) => CODES[code].plages.reduce((n, [a, b]) => n + minutes(b) - minutes(a), 0);
// Ce qu'on affiche pour un jour : « Travail C5 · 8 h – 16 h 30 », « Vacances », « Repos ».
export function phraseDe(code: Code) {
  const c = CODES[code];
  if (!c.travail) return c.libelle;
  const heures = heuresDe(code);
  if (!heures) return `Travail · ${c.libelle}`;
  return c.court ? `Travail ${c.court} · ${heures}` : `Travail · ${heures}`;
}

// La petite ligne de l'accueil : ce qui reste du travail aujourd'hui, ou le jour off. Rien une fois le travail fini.
export function ligneAccueil(code: Code | undefined, nowMin: number): string | null {
  if (!code) return null;
  const c = CODES[code];
  if (!c.travail) return c.libelle;
  const reste = c.plages.filter(([, b]) => minutes(b) > nowMin);
  return reste.length ? `Travail ${reste.map(plageFr).join(" et ")}` : null;
}

// Tous les jours d'un mois « 2026-12 », du 1er au dernier.
export function joursDuMois(mois: string): string[] {
  const [a, m] = mois.split("-").map(Number);
  const n = new Date(a, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => iso(new Date(a, m - 1, i + 1)));
}
export const moisDe = (jour: string) => jour.slice(0, 7);
export function moisVoisin(mois: string, n: number) {
  const [a, m] = mois.split("-").map(Number);
  return iso(new Date(a, m - 1 + n, 1)).slice(0, 7);
}
// Combien de cases vides avant le 1er dans une grille qui commence le lundi.
export const decalageLundi = (mois: string) => (new Date(mois + "-01T12:00:00").getDay() + 6) % 7;

// Écrire le mois d'un coup : les codes dans l'ordre des jours, séparés par des espaces (« C5 C6 C1 R R … »).
// R ou Repos, V ou Vac pour les vacances, C ou CHR pour un congé ; un tiret laisse le jour comme il est.
const LU: Record<string, Code | null> = {
  c1: "C1", c2: "C2", c3: "C3", c4: "C4", c5: "C5", c6: "C6", r: "R", repos: "R", v: "VAC", vac: "VAC", vacances: "VAC",
  chr: "CHR", conge: "CHR", c: "CHR", "-": null, ".": null,
  // Codes de la fiche que l'app ne garde pas (choix de Melo) : le jour reste comme il est.
  for: null, formation: null, epm: null, nyon: null,
};
export function lireSuite(texte: string, mois: string): { jours: Array<[string, Code]>; inconnus: string[]; trop: number } {
  const mots = sansAccents(texte).replace(/\/\s*8\s*h/g, "").split(/[\s,;]+/).filter(Boolean);
  const jours = joursDuMois(mois);
  const res: Array<[string, Code]> = [];
  const inconnus: string[] = [];
  mots.slice(0, jours.length).forEach((m, i) => {
    if (!(m in LU)) { inconnus.push(m); return; }
    const c = LU[m];
    if (c) res.push([jours[i], c]);
  });
  return { jours: res, inconnus, trop: Math.max(0, mots.length - jours.length) };
}

export function bilanMois(horaires: Horaire[], mois: string) {
  const du = horaires.filter((h) => moisDe(h.jour) === mois);
  const travail = du.filter((h) => CODES[h.code].travail);
  return {
    travail: travail.length,
    vacances: du.filter((h) => h.code === "VAC").length,
    repos: du.filter((h) => h.code === "R").length,
    heures: Math.round(travail.reduce((n, h) => n + minutesDe(h.code), 0) / 6) / 10,
  };
}
