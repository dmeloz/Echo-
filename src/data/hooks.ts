import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import type { Noms, Qui, Tache } from "../lib/types";
import { NOMS_DEFAUT, db } from "./db";

export const useTaches = () => useLiveQuery(() => db.taches.toArray(), [], undefined as Tache[] | undefined);

export function useNoms(): Noms {
  const r = useLiveQuery(() => db.reglages.get("noms"), []);
  return { ...NOMS_DEFAUT, ...((r?.valeur as Partial<Noms>) || {}) };
}
export const enregistrerNoms = (n: Noms) => db.reglages.put({ cle: "noms", valeur: n });

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
