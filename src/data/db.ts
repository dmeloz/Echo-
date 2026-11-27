import Dexie, { type EntityTable } from "dexie";
import type { Noms, Tache } from "../lib/types";
import type { Horaire } from "../lib/horaires";
import type { Article, Gouts, Habitude, Batch, Produit, Recette, Repas, Ticket, CodeConnu } from "../modules/cuisine/donnees";
import type { APayer, Categorie, Depense, Poste, Solde } from "../modules/budget/donnees";
import type { Appareil, Contact, Corvee, Fait, Papier, Reparation } from "../modules/maison/donnees";
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
  // Le module Maison : les corvées, et une ligne par corvée faite (pour l'équilibre entre les deux).
  maison_corvees: EntityTable<Corvee, "id">;
  maison_faits: EntityTable<Fait, "id">;
  maison_reparations: EntityTable<Reparation, "id">;
  maison_appareils: EntityTable<Appareil, "id">;
  maison_contacts: EntityTable<Contact, "id">;
  // Le module Budget : les postes (montants datés), les dépenses du jour, les catégories créées, les soldes notés, ce que Maison donne à payer.
  budget_postes: EntityTable<Poste, "id">;
  budget_depenses: EntityTable<Depense, "id">;
  budget_categories: EntityTable<Categorie, "id">;
  budget_soldes: EntityTable<Solde, "id">;
  budget_apayer: EntityTable<APayer, "id">;
  maison_papiers: EntityTable<Papier, "id">;
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
db.version(11).stores({ maison_corvees: "id", maison_faits: "id, quand" }); // les corvées, et une ligne par corvée faite
db.version(12).stores({ maison_reparations: "id", maison_appareils: "id", maison_contacts: "id" }); // l'entretien : ce qui est cassé, les appareils, les contacts

db.version(13).stores({ maison_papiers: "id" }); // l'administration du foyer : les papiers et leurs échéances
db.version(14).stores({ budget_postes: "id", budget_depenses: "id, jour", budget_categories: "id", budget_soldes: "id", budget_apayer: "id" }); // le budget partagé

export const NOMS_DEFAUT: Noms = { moi: "Dany", elle: "Sarah" };

// Si une autre fenêtre d'Echo installe une version plus récente de la base, celle-ci se recharge.
db.on("versionchange", () => { db.close(); location.reload(); });

// Demander à l'iPhone de ne pas effacer les données quand il manque de place.
export const garderLesDonnees = () => navigator.storage?.persist?.().catch(() => false);

// La base s'ouvre-t-elle ? (navigation privée, stockage bloqué ou plein)
export const baseOuverte = () => db.open().then(() => true, () => false);
