import Dexie, { type EntityTable } from "dexie";
import type { Noms, Tache } from "../lib/types";

// Les données restent sur l'appareil (IndexedDB). La synchro à deux viendra plus tard (Supabase).
export interface Reglage { cle: string; valeur: unknown }
export interface Photo { id: string; tacheId: string; blob: Blob; cree: number }

export const db = new Dexie("echo") as Dexie & {
  taches: EntityTable<Tache, "id">;
  reglages: EntityTable<Reglage, "cle">;
  photos: EntityTable<Photo, "id">;
};
db.version(1).stores({ taches: "id, jour, faitLe", reglages: "cle" });
db.version(2).stores({ photos: "id, tacheId" });

export const NOMS_DEFAUT: Noms = { moi: "Melo", elle: "Sarah" };
