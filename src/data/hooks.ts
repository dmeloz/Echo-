import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import type { Noms, Personne, Qui, Tache } from "../lib/types";
import { NOMS_DEFAUT, db } from "./db";

export const useTaches = () => useLiveQuery(() => db.taches.toArray(), [], undefined as Tache[] | undefined);

export function useNoms(): Noms {
  const r = useLiveQuery(() => db.reglages.get("noms"), []);
  return { ...NOMS_DEFAUT, ...((r?.valeur as Partial<Noms>) || {}) };
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
