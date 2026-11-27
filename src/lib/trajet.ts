import { db } from "../data/db";
import { entetesIA } from "../sync/client";
import type { Mode } from "../../supabase/functions/_shared/trajet-calcul";
import { meteo, routeGlissante, type Glisse } from "./meteo";

// L'heure de départ : « pars à 7 h 30 » pour arriver au travail (ou à un rendez-vous) à l'heure.
// Le calcul se fait sur le serveur (fonction « trajet » : route pour la moto, horaires CFF pour les transports).
// Les adresses sont gardées sur ce téléphone (Réglages → Agenda → Trajets, hors sauvegarde) ; elles ne sont envoyées que pour ce calcul.

export const ADRESSE_TRAJET = "https://ewqvgayhptfwbpkxsaij.supabase.co/functions/v1/trajet";
// moyen : à moto (s'il neige ou si la route gèle, Echo propose les transports), en voiture, ou en transports publics.
// ville : pour la météo, si l'adresse de départ ne suffit pas à la trouver (src/lib/meteo.ts).
export type Moyen = "moto" | "voiture" | "transports";
export interface Trajets { maison: string; travail: string; moyen: Moyen; ville: string }
export const TRAJETS_DEFAUT: Trajets = { maison: "", travail: "", moyen: "moto", ville: "" };
export const MOYENS: Moyen[] = ["moto", "voiture", "transports"];
// Pour le calcul, la voiture prend la même route que la moto.
export const modeDe = (m: Moyen): Mode => (m === "transports" ? "transports" : "moto");
export const lireTrajets = async (): Promise<Trajets> => {
  const t = { ...TRAJETS_DEFAUT, ...(((await db.reglages.get("trajets"))?.valeur as Partial<Trajets> | undefined) ?? {}) };
  return { ...t, moyen: MOYENS.includes(t.moyen) ? t.moyen : "moto", ville: typeof t.ville === "string" ? t.ville : "" };
};

export interface Depart { depart: string; minutes: number; mode: Mode; train?: string; ligne?: string; gare?: string }
export type Refus = "adresses" | "introuvable" | "service";

// Les trajets déjà calculés, gardés sur le téléphone : la moto ne change pas d'un jour à l'autre (30 jours),
// les transports valent pour ce jour-là seulement.
const CLE = "echo-trajets";
const MOTO_VALABLE = 30 * 86_400_000;
type Garde = Record<string, Depart & { quand: number }>;
const lireCache = (): Garde => { try { const v = JSON.parse(localStorage.getItem(CLE) ?? "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; } };
export const cleDe = (de: string, a: string, jour: string, arrivee: string, mode: Mode) =>
  [de.toLowerCase(), a.toLowerCase(), mode === "transports" ? jour : "", arrivee, mode].join("|");
export function departGarde(cle: string, now = Date.now()): Depart | null {
  const g = lireCache()[cle];
  if (!g || typeof g.depart !== "string" || now - g.quand > MOTO_VALABLE) return null;
  const { quand: _quand, ...d } = g;
  return d;
}
function garder(cle: string, d: Depart, now = Date.now()) {
  try {
    const tout = Object.entries({ ...lireCache(), [cle]: { ...d, quand: now } }).sort((x, y) => y[1].quand - x[1].quand).slice(0, 40);
    localStorage.setItem(CLE, JSON.stringify(Object.fromEntries(tout)));
  } catch { /* stockage plein : on recalculera */ }
}

// Quand partir de « de » pour être à « a » à l'heure dite. mode : la moto, ou les transports (s'il neige).
export async function heureDepart(p: { de: string; a: string; jour: string; arrivee: string; mode: Mode }): Promise<Depart | Refus> {
  const de = p.de.trim(), a = p.a.trim();
  if (!de || !a) return "adresses";
  const cle = cleDe(de, a, p.jour, p.arrivee, p.mode);
  const deja = departGarde(cle);
  if (deja) return deja;
  let r: Response;
  try {
    r = await fetch(ADRESSE_TRAJET, {
      // Le code Echo, pour un téléphone pas encore relié au foyer.
      method: "POST", headers: await entetesIA(String((await db.reglages.get("codeEcho"))?.valeur ?? "").trim()),
      body: JSON.stringify({ de, a, jour: p.jour, arrivee: p.arrivee, mode: p.mode }), signal: AbortSignal.timeout(15000),
    });
  } catch { return "service"; }
  const c = await r.json().catch(() => null);
  if (!r.ok || typeof c?.depart !== "string") return c?.erreur === "adresse" || c?.erreur === "introuvable" ? "introuvable" : "service";
  const d: Depart = { depart: c.depart, minutes: Number(c.minutes) || 0, mode: c.mode === "transports" ? "transports" : "moto", ...(c.train ? { train: String(c.train), ligne: String(c.ligne ?? ""), gare: String(c.gare ?? "") } : {}) };
  garder(cle, d);
  return d;
}

// Pour aller au travail : les adresses des réglages. null si elles ne sont pas remplies.
// À moto, s'il neige ou si la route gèle à l'heure de partir : glisse dit pourquoi, et autrement donne le départ en
// transports publics quand il existe (Echo le propose, la personne choisit). Sans météo, rien ne change.
export type DepartTravail = Depart & { glisse?: Glisse; autrement?: Depart };
export async function departTravail(jour: string, arrivee: string, now = Date.now()): Promise<DepartTravail | Refus> {
  const t = await lireTrajets();
  const d = await heureDepart({ de: t.maison, a: t.travail, jour, arrivee, mode: modeDe(t.moyen) });
  if (typeof d === "string" || t.moyen !== "moto") return d;
  const glisse = routeGlissante(await meteo(now), jour, d.depart);
  if (!glisse) return d;
  const train = await heureDepart({ de: t.maison, a: t.travail, jour, arrivee, mode: "transports" });
  return { ...d, glisse, ...(typeof train === "string" ? {} : { autrement: train }) };
}
// La ligne de l'accueil : « pars à 7 h 30 », ou, quand ça glisse, les transports proposés (ou la prudence s'il n'y en a pas).
export function phraseDepart(d: DepartTravail, heure: (h: string) => string): string {
  if (!d.glisse) return `pars à ${heure(d.depart)}`;
  const quoi = d.glisse === "neige" ? "neige" : "route gelée";
  return d.autrement ? `${quoi} : plutôt les transports, pars à ${heure(d.autrement.depart)} (à moto : ${heure(d.depart)})` : `${quoi} : prudence à moto, pars à ${heure(d.depart)}`;
}
// Un réglage changé : relu dans la base au moment même (deux champs quittés coup sur coup ne s'écrasent pas).
export async function poserTrajets(x: Partial<Trajets>) { await db.reglages.put({ cle: "trajets", valeur: { ...(await lireTrajets()), ...x } }); }
