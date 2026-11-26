import type { Table } from "dexie";
import { db } from "../data/db";
import { nettoyerArticle, nettoyerGouts, nettoyerHabitude, nettoyerProduit, nettoyerRepas } from "../modules/cuisine/donnees";

// Les données des modules qui partent au foyer : un « genre » par table, une ligne par clé.
// Pour synchroniser une nouvelle table : l'ajouter ici, et son genre dans la règle de la table « elements » (migration).
export interface Genre { table: Table; cle: string; nettoyer: (x: unknown) => unknown }
export const GENRES: Record<string, Genre> = {
  course: { table: db.cuisine_courses, cle: "id", nettoyer: nettoyerArticle },
  habitude: { table: db.cuisine_habitudes, cle: "cle", nettoyer: nettoyerHabitude },
  repas: { table: db.cuisine_repas, cle: "jour", nettoyer: nettoyerRepas },
  stock: { table: db.cuisine_stock, cle: "id", nettoyer: nettoyerProduit },
  gout: { table: db.cuisine_gouts, cle: "qui", nettoyer: nettoyerGouts },
};
export const TABLES_MODULES = Object.values(GENRES).map((g) => g.table);
