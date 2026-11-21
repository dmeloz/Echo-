import Dexie, { type EntityTable } from "dexie";
import type { Noms, Tache } from "../lib/types";

// Les données restent sur l'appareil (IndexedDB). La synchro à deux viendra plus tard (Supabase).
export interface Reglage { cle: string; valeur: unknown }

export const db = new Dexie("echo") as Dexie & {
  taches: EntityTable<Tache, "id">;
  reglages: EntityTable<Reglage, "cle">;
};
db.version(1).stores({ taches: "id, jour, faitLe", reglages: "cle" });

export const NOMS_DEFAUT: Noms = { moi: "Melo", elle: "Sarah" };
