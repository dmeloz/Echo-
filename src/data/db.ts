import Dexie, { type EntityTable } from "dexie";
import type { Noms, Tache } from "../lib/types";
import type { Horaire } from "../lib/horaires";

// Les données restent sur l'appareil (IndexedDB). La synchro à deux viendra plus tard (Supabase).
export interface Reglage { cle: string; valeur: unknown }
export interface Photo { id: string; tacheId: string; blob: Blob; cree: number }

export const db = new Dexie("echo") as Dexie & {
  taches: EntityTable<Tache, "id">;
  reglages: EntityTable<Reglage, "cle">;
  photos: EntityTable<Photo, "id">;
  horaires: Dexie.Table<Horaire, [string, string]>;
};
db.version(1).stores({ taches: "id, jour, faitLe", reglages: "cle" });
db.version(2).stores({ photos: "id, tacheId" });
db.version(3).stores({ horaires: "[qui+jour], jour" }); // un code de travail par personne et par jour

export const NOMS_DEFAUT: Noms = { moi: "Dany", elle: "Sarah" };

// Si une autre fenêtre d'Echo installe une version plus récente de la base, celle-ci se recharge.
db.on("versionchange", () => { db.close(); location.reload(); });

// Demander à l'iPhone de ne pas effacer les données quand il manque de place.
export const garderLesDonnees = () => navigator.storage?.persist?.().catch(() => false);

// La base s'ouvre-t-elle ? (navigation privée, stockage bloqué ou plein)
export const baseOuverte = () => db.open().then(() => true, () => false);
