import Dexie, { type EntityTable } from "dexie";
import type { Noms, Tache } from "../lib/types";
import type { Horaire } from "../lib/horaires";
import type { Article, Gouts, Habitude, Batch, Produit, Recette, Repas, Ticket, CodeConnu } from "../modules/cuisine/donnees";
import type { LigneJournal } from "../lib/echo/journal";
import type { Souvenir } from "../lib/echo/memoire";

// Les données restent sur l'appareil (IndexedDB). La synchro à deux viendra plus tard (Supabase).
export interface Reglage { cle: string; valeur: unknown }
export interface Photo { id: string; tacheId: string; blob: Blob; cree: number }
// La corbeille : une tâche effacée reste 30 jours sur ce téléphone, avec qui l'a effacée et quand.
export interface Efface { id: string; tache: Tache; par: string; quand: number }

export const db = new Dexie("echo") as Dexie & {
  taches: EntityTable<Tache, "id">;
  reglages: EntityTable<Reglage, "cle">;
  photos: EntityTable<Photo, "id">;
  horaires: Dexie.Table<Horaire, [string, string]>;
  corbeille: EntityTable<Efface, "id">;
  // Le module Cuisine (tables préfixées par son id).
  cuisine_courses: EntityTable<Article, "id">;
  cuisine_habitudes: EntityTable<Habitude, "cle">;
  cuisine_repas: EntityTable<Repas, "jour">;
  cuisine_stock: EntityTable<Produit, "id">;
  cuisine_gouts: EntityTable<Gouts, "qui">;
  cuisine_tickets: EntityTable<Ticket, "id">;
  cuisine_batch: EntityTable<Batch, "semaine">;
  cuisine_recettes: EntityTable<Recette, "cle">;
  cuisine_codes: EntityTable<CodeConnu, "code">;
  // Le journal d'Echo : ce que l'assistant a fait, partagé au foyer.
  echo_journal: EntityTable<LigneJournal, "id">;
  echo_memoire: EntityTable<Souvenir, "id">;
};
db.version(1).stores({ taches: "id, jour, faitLe", reglages: "cle" });
db.version(2).stores({ photos: "id, tacheId" });
db.version(3).stores({ horaires: "[qui+jour], jour" }); // un code de travail par personne et par jour
db.version(4).stores({ corbeille: "id, quand" });
db.version(5).stores({ cuisine_courses: "id", cuisine_habitudes: "cle", cuisine_repas: "jour", cuisine_stock: "id", cuisine_gouts: "qui" });
db.version(6).stores({ cuisine_tickets: "id" }); // les tickets de caisse lus par photo
db.version(7).stores({ echo_journal: "id, quand" });
db.version(8).stores({ echo_memoire: "id, quand" }); // la mémoire d'Echo
db.version(9).stores({ cuisine_batch: "semaine", cuisine_recettes: "cle" }); // le plan du batch par semaine, le livre de recettes
db.version(10).stores({ cuisine_codes: "code" }); // les codes-barres déjà scannés (gardés sur ce téléphone)

export const NOMS_DEFAUT: Noms = { moi: "Dany", elle: "Sarah" };

// Si une autre fenêtre d'Echo installe une version plus récente de la base, celle-ci se recharge.
db.on("versionchange", () => { db.close(); location.reload(); });

// Demander à l'iPhone de ne pas effacer les données quand il manque de place.
export const garderLesDonnees = () => navigator.storage?.persist?.().catch(() => false);

// La base s'ouvre-t-elle ? (navigation privée, stockage bloqué ou plein)
export const baseOuverte = () => db.open().then(() => true, () => false);
