import type { Table } from "dexie";
import { db } from "../data/db";
import { nettoyerJournal } from "../lib/echo/journal";
import { nettoyerAppareil, nettoyerContact, nettoyerCorvee, nettoyerFait, nettoyerReparation } from "../modules/maison/donnees";
import { nettoyerSouvenir } from "../lib/echo/memoire";
import { nettoyerArticle, nettoyerGouts, nettoyerHabitude, nettoyerBatch, nettoyerProduit, nettoyerRecette, nettoyerRepas, nettoyerTicket } from "../modules/cuisine/donnees";

// Les données des modules qui partent au foyer : un « genre » par table, une ligne par clé.
// Pour synchroniser une nouvelle table : l'ajouter ici, et son genre dans la règle de la table « elements » (migration).
// naturelle : la clé a un sens (un produit, un jour, une personne), deux téléphones peuvent donc avoir la même.
export interface Genre { table: Table; cle: string; nettoyer: (x: unknown) => unknown; naturelle?: boolean }
export const GENRES: Record<string, Genre> = {
  course: { table: db.cuisine_courses, cle: "id", nettoyer: nettoyerArticle },
  habitude: { table: db.cuisine_habitudes, cle: "cle", nettoyer: nettoyerHabitude, naturelle: true },
  repas: { table: db.cuisine_repas, cle: "jour", nettoyer: nettoyerRepas, naturelle: true },
  stock: { table: db.cuisine_stock, cle: "id", nettoyer: nettoyerProduit },
  ticket: { table: db.cuisine_tickets, cle: "id", nettoyer: nettoyerTicket },
  batch: { table: db.cuisine_batch, cle: "semaine", nettoyer: nettoyerBatch, naturelle: true },
  recette: { table: db.cuisine_recettes, cle: "cle", nettoyer: nettoyerRecette, naturelle: true },
  gout: { table: db.cuisine_gouts, cle: "qui", nettoyer: nettoyerGouts, naturelle: true },
  corvee: { table: db.maison_corvees, cle: "id", nettoyer: nettoyerCorvee },
  corvee_faite: { table: db.maison_faits, cle: "id", nettoyer: nettoyerFait },
  reparation: { table: db.maison_reparations, cle: "id", nettoyer: nettoyerReparation },
  appareil: { table: db.maison_appareils, cle: "id", nettoyer: nettoyerAppareil },
  contact: { table: db.maison_contacts, cle: "id", nettoyer: nettoyerContact },
  journal: { table: db.echo_journal, cle: "id", nettoyer: nettoyerJournal },
  memoire: { table: db.echo_memoire, cle: "id", nettoyer: nettoyerSouvenir },
};
export const TABLES_MODULES = Object.values(GENRES).map((g) => g.table);
