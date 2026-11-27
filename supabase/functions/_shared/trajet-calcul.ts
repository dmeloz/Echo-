// L'heure de départ, sans réseau : les adresses des services, la lecture de leurs réponses et le calcul.
// Lu par la fonction serveur « trajet » et par les tests de l'app (aucun import ici).
//
// Moto : le temps de route en voiture (OSRM, gratuit, sans trafic en direct) + 10 % + une marge fixe (casque, parking).
// Transports (s'il neige) : les horaires CFF (transport.opendata.ch), la dernière correspondance qui arrive à temps.

export type Mode = "moto" | "transports";
export const MARGE_MOTO = 10; // minutes : s'équiper, se garer, marcher jusqu'à la porte
export const MARGE_TRANSPORTS = 5; // minutes : arriver à l'arrêt

export const urlLieu = (q: string) =>
  `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: "json", limit: "1", countrycodes: "ch" })}`;
export const urlRoute = (de: Point, a: Point) =>
  `https://router.project-osrm.org/route/v1/driving/${de.lon},${de.lat};${a.lon},${a.lat}?overview=false`;
export const urlCorrespondances = (de: string, a: string, jour: string, heure: string) =>
  `https://transport.opendata.ch/v1/connections?${new URLSearchParams({ from: de, to: a, date: jour, time: heure, isArrivalTime: "1", limit: "4" })}`;

export interface Point { lat: number; lon: number }
// deno-lint-ignore no-explicit-any
export function lireLieu(r: any): Point | null {
  const p = Array.isArray(r) ? r[0] : null;
  const lat = Number(p?.lat), lon = Number(p?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}
// deno-lint-ignore no-explicit-any
export function lireRoute(r: any): number | null {
  const s = Number(r?.routes?.[0]?.duration);
  return r?.code === "Ok" && Number.isFinite(s) && s > 0 ? s : null;
}

const versMin = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const versHeure = (m: number) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0")}:${String(((m % 60) + 60) % 60).padStart(2, "0")}`;

// Moto : l'heure de départ (arrondie aux 5 minutes d'avant) pour arriver à l'heure dite.
export function departMoto(arrivee: string, secondes: number) {
  const minutes = Math.ceil((secondes / 60) * 1.1) + MARGE_MOTO;
  const depart = Math.floor((versMin(arrivee) - minutes) / 5) * 5;
  return { depart: versHeure(depart), minutes };
}

// Transports : la correspondance qui arrive le plus tard sans être en retard. Les heures du service sont locales
// (« 2026-11-28T07:34:00+0100 ») : on garde l'heure telle qu'écrite.
// deno-lint-ignore no-explicit-any
export function departTransports(r: any, jour: string, arrivee: string) {
  const heureDe = (iso: unknown) => (typeof iso === "string" && iso.slice(0, 10) === jour ? iso.slice(11, 16) : "");
  const bonnes = (Array.isArray(r?.connections) ? r.connections : [])
    .map((c: any) => ({ part: heureDe(c?.from?.departure), arrive: heureDe(c?.to?.arrival), ligne: c?.products?.[0] ?? "", gare: c?.from?.station?.name ?? "" }))
    .filter((c: { part: string; arrive: string }) => c.part && c.arrive && c.arrive <= arrivee)
    .sort((x: { arrive: string }, y: { arrive: string }) => (x.arrive < y.arrive ? 1 : -1));
  const c = bonnes[0];
  if (!c) return null;
  return { depart: versHeure(versMin(c.part) - MARGE_TRANSPORTS), minutes: versMin(arrivee) - versMin(c.part) + MARGE_TRANSPORTS, train: c.part, ligne: String(c.ligne), gare: String(c.gare) };
}
