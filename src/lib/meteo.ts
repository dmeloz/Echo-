import { db } from "../data/db";
import { auJour } from "./dates";

// La météo, lue sur le téléphone chez Open-Meteo (gratuit, sans clé, sans compte).
// Le lieu vient de Réglages → Agenda → Trajets : la ville écrite pour la météo, sinon le code postal ou la ville de l'adresse
// de départ. Seul ce mot part chez Open-Meteo, puis des coordonnées arrondies au kilomètre : jamais la rue, rien du foyer.
// Gardée trois heures sur le téléphone. Sans réseau ou sans lieu : rien n'est affiché, rien ne bloque.

export interface Heure { t: number; pluie: number; neige: number; code: number }
// heures : pour chaque jour (AAAA-MM-JJ), 24 heures (0 h à 23 h).
export interface Meteo { quand: number; lieu: string; heures: Record<string, Heure[]> }
export type Glisse = "neige" | "gel";

const CLE = "echo-meteo", CLE_LIEU = "echo-meteo-lieu";
const VALABLE = 3 * 3600_000;
const lire = <T>(cle: string): T | null => { try { return JSON.parse(localStorage.getItem(cle) ?? "null") as T | null; } catch { return null; } };
const ecrire = (cle: string, v: unknown) => { try { localStorage.setItem(cle, JSON.stringify(v)); } catch { /* stockage plein : on relira */ } };
const json = async (url: string) => { const r = await fetch(url, { signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error(String(r.status)); return r.json(); };

// Le mot à chercher : la ville écrite, sinon le code postal de l'adresse, sinon ce qui suit la dernière virgule.
export function lieuDe(ville: string, adresse: string): string {
  const v = ville.trim();
  if (v) return v.slice(0, 60);
  const cp = adresse.match(/\b(\d{4,5})\b(?!.*\b\d{4,5}\b)/);
  if (cp) return cp[1];
  const fin = adresse.split(",").at(-1)?.trim() ?? "";
  return adresse.includes(",") && /^[\p{L}' -]{2,40}$/u.test(fin) ? fin : "";
}
export async function lieuMeteo(): Promise<string> {
  const t = ((await db.reglages.get("trajets"))?.valeur ?? {}) as { ville?: unknown; maison?: unknown };
  return lieuDe(typeof t.ville === "string" ? t.ville : "", typeof t.maison === "string" ? t.maison : "");
}

// Ce qu'Open-Meteo répond, vérifié et rangé par jour.
export function lireMeteo(brut: unknown, lieu: string, now = Date.now()): Meteo | null {
  const h = (brut as { hourly?: Record<string, unknown> } | null)?.hourly;
  const temps = h?.time, t = h?.temperature_2m, pluie = h?.precipitation, neige = h?.snowfall, code = h?.weather_code;
  if (!Array.isArray(temps) || ![t, pluie, neige, code].every((x) => Array.isArray(x) && x.length === temps.length)) return null;
  const heures: Record<string, Heure[]> = {};
  temps.forEach((quand, i) => {
    const m = typeof quand === "string" ? quand.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):/) : null;
    const n = (x: unknown) => (typeof (x as unknown[])[i] === "number" ? ((x as number[])[i]) : NaN);
    if (!m || !Number.isFinite(n(t))) return;
    (heures[m[1]] ??= [])[Number(m[2])] = { t: n(t), pluie: n(pluie) || 0, neige: n(neige) || 0, code: n(code) || 0 };
  });
  const jours = Object.entries(heures).filter(([, l]) => l.length === 24 && !l.includes(undefined as never));
  return jours.length ? { quand: now, lieu, heures: Object.fromEntries(jours) } : null;
}

let enCours: Promise<Meteo | null> | null = null;
// La météo d'hier (pour le gel du matin), d'aujourd'hui et de demain, ou null (pas de lieu, pas de réseau). Ne lève jamais d'erreur.
export function meteo(now = Date.now()): Promise<Meteo | null> {
  return (enCours ??= (async () => {
    try {
      const lieu = await lieuMeteo();
      if (!lieu) return null;
      const garde = lire<Meteo>(CLE);
      const frais = garde && garde.lieu === lieu && garde.heures?.[auJour(0, new Date(now))];
      if (frais && now - garde.quand < VALABLE) return garde;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return frais ? garde : null;
      try {
        let ou = lire<{ lieu: string; lat: number; lon: number }>(CLE_LIEU);
        if (ou?.lieu !== lieu || !Number.isFinite(ou.lat) || !Number.isFinite(ou.lon)) {
          const g = await json(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(lieu)}&count=1&language=fr&countryCode=CH`);
          const p = g?.results?.[0];
          if (typeof p?.latitude !== "number" || typeof p?.longitude !== "number") return null;
          ou = { lieu, lat: Math.round(p.latitude * 100) / 100, lon: Math.round(p.longitude * 100) / 100 };
          ecrire(CLE_LIEU, ou);
        }
        const m = lireMeteo(await json(`https://api.open-meteo.com/v1/forecast?latitude=${ou.lat}&longitude=${ou.lon}&hourly=temperature_2m,precipitation,snowfall,weather_code&timezone=Europe%2FZurich&past_days=1&forecast_days=2`), lieu, now);
        if (m) ecrire(CLE, m);
        return m ?? (frais ? garde : null);
      } catch { return frais ? garde : null; } // pas de réseau : la dernière lue, si elle parle encore d'aujourd'hui
    } catch { return null; }
  })().finally(() => { enCours = null; }));
}

// Le temps qu'il fait, en un ou deux mots, d'après le code météo (OMM) le plus marquant d'une plage d'heures.
const NEIGE = (c: number) => (c >= 71 && c <= 77) || c === 85 || c === 86;
const PLUIE = (c: number) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82);
function ciel(l: Heure[]): string {
  if (l.some((h) => h.neige > 0 || NEIGE(h.code))) return "neige";
  if (l.some((h) => h.code >= 95)) return "orage";
  if (l.filter((h) => h.pluie >= 0.2 || PLUIE(h.code)).length >= 2 || l.some((h) => h.pluie >= 1)) return "pluie";
  if (l.filter((h) => h.code === 45 || h.code === 48).length > l.length / 2) return "brouillard";
  const moyen = l.reduce((n, h) => n + (h.code <= 1 ? 0 : h.code === 2 ? 1 : 2), 0) / (l.length || 1);
  return moyen < 0.6 ? "soleil" : moyen < 1.5 ? "éclaircies" : "couvert";
}
const degres = (t: number) => `${Math.round(t) === 0 ? 0 : Math.round(t)}°`;

// « 3°, neige ce matin » : la phrase courte du résumé. jour : le jour raconté ; heure : l'heure qu'il est ce jour-là (0 pour une journée entière à venir).
export function phraseMeteo(m: Meteo | null, jour: string, heure = 0): string {
  const l = m?.heures[jour];
  if (!l) return "";
  const matin = l.slice(Math.max(6, heure), 12), aprem = l.slice(Math.max(12, heure), 19);
  if (!aprem.length) return `${degres(l[Math.min(23, heure)].t)}, ${ciel(l.slice(heure, 23).length ? l.slice(heure, 23) : [l[23]])} ce soir`;
  const cm = matin.length ? ciel(matin) : "", ca = ciel(aprem);
  const maintenant = degres(l[Math.min(23, Math.max(heure, 7))].t), max = degres(Math.max(...l.slice(Math.max(heure, 7), 19).map((h) => h.t)));
  const temps = !cm ? `${ca} cet après-midi` : cm === ca ? `${cm} toute la journée` : `${cm} ce matin, ${ca} cet après-midi`;
  return `${maintenant}${max !== maintenant ? ` (jusqu'à ${max})` : ""}, ${temps}`;
}

// La route risque-t-elle de glisser autour de l'heure de départ (HH:MM) ? Neige dans les 3 heures avant ou l'heure après ;
// gel : 0° ou moins au départ après de la pluie ou de la neige dans les 12 heures d'avant.
export function routeGlissante(m: Meteo | null, jour: string, depart: string): Glisse | null {
  const l = m?.heures[jour];
  const h = Number(depart.slice(0, 2));
  if (!l || !Number.isInteger(h) || h < 0 || h > 23) return null;
  const veille = m!.heures[auJour(-1, new Date(`${jour}T12:00:00`))] ?? [];
  const avant = (n: number) => [...veille, ...l].slice(veille.length + h - n < 0 ? 0 : veille.length + h - n, veille.length + h + 1);
  if ([...avant(3), ...l.slice(h + 1, h + 2)].some((x) => x.neige > 0 || NEIGE(x.code))) return "neige";
  if (Math.min(l[h].t, l[Math.max(0, h - 1)].t) <= 0 && avant(12).reduce((n, x) => n + x.pluie + x.neige, 0) >= 0.5) return "gel";
  return null;
}
