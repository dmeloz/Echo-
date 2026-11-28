import { CODES, type Horaire } from "../lib/horaires";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { auJour, plusJours } from "../lib/dates";
import { completer } from "../lib/fixes";
import type { Noms, Personne, Qui, Tache } from "../lib/types";
import { nettoyerNoms } from "../lib/valider";
import { NOMS_DEFAUT, db } from "./db";

// Les tâches qui ont au moins une photo (pour la petite icône sur la ligne).
export const useAvecPhoto = () => useLiveQuery(async () => new Set((await db.photos.toArray()).map((p) => p.tacheId)), [], new Set<string>());

// Un ancien code que l'app ne connaît plus (FOR, EPM) est simplement ignoré.
// Les horaires fixes (Sarah) sont ajoutés par le calcul, d'un mois en arrière à un peu plus d'un an devant.
export function useHoraires() {
  const { moi, elle } = useNoms();
  const today = auJour(0);
  const poses = useLiveQuery(async () => (await db.horaires.toArray()).filter((h) => h.code in CODES && !CODES[h.code].auto), [], [] as Horaire[]);
  return useMemo(() => completer(poses, { moi, elle }, plusJours(today, -40), plusJours(today, 420)), [poses, moi, elle, today]);
}
export const useTaches = () => useLiveQuery(() => db.taches.toArray(), [], undefined as Tache[] | undefined);

export function useNoms(): Noms {
  const r = useLiveQuery(() => db.reglages.get("noms"), []);
  return nettoyerNoms(r?.valeur, NOMS_DEFAUT);
}
export const enregistrerNoms = (n: Noms) => db.reglages.put({ cle: "noms", valeur: n });

// Le téléphone de qui ? (choisi au premier lancement). undefined = pas encore chargé, null = pas encore choisi.
export function useProfil(): { proprio: Personne | null | undefined; guideVu: boolean } {
  const r = useLiveQuery(async () => ({ p: await db.reglages.get("proprio"), g: await db.reglages.get("guideVu") }), []);
  if (!r) return { proprio: undefined, guideVu: true };
  return { proprio: (r.p?.valeur as Personne | undefined) ?? null, guideVu: !!r.g?.valeur };
}
export const choisirProprio = (p: Personne) => db.reglages.put({ cle: "proprio", valeur: p });
export const marquerGuide = (vu: boolean) => db.reglages.put({ cle: "guideVu", valeur: vu });

export const nomDe = (noms: Noms, qui: Qui) => (qui === "nous" ? "Nous deux" : noms[qui]);
export const initialeDe = (noms: Noms, qui: "moi" | "elle") => (noms[qui].trim()[0] || "?").toUpperCase();

// L'heure qui avance : on recalcule la journée chaque minute et au retour sur l'app.
export function useMaintenant() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const maj = () => setNow(new Date());
    const id = setInterval(maj, 60_000);
    const vis = () => { if (!document.hidden) maj(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, []);
  return now;
}

// Un réglage simple, gardé sur le téléphone. undefined tant qu'il charge.
export function useReglage<T>(cle: string, defaut: T): T {
  const r = useLiveQuery(() => db.reglages.get(cle), [cle]);
  return (r?.valeur as T | undefined) ?? defaut;
}
export const poserReglage = (cle: string, valeur: unknown) => db.reglages.put({ cle, valeur });
