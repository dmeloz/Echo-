import type { Module } from "../contrat";
import { ajouterArticles } from "./actions";
import { lireDemande } from "./donnees";
import { PageCuisine } from "./Page";
import { ReglagesCuisine } from "./ReglagesCuisine";
import { TuileCuisine } from "./Tuile";

export const cuisine: Module = {
  id: "cuisine",
  libelle: "Cuisine",
  resume: "Courses, repas de la semaine, stock",
  etat: "construit",
  prevu: [],
  Page: PageCuisine,
  Tuile: TuileCuisine,
  Reglages: ReglagesCuisine,
  // « plus de lait », « des œufs aux courses » : la phrase va à la liste de courses, pas dans les tâches.
  comprendre: (texte) => {
    const lus = lireDemande(texte);
    if (!lus) return null;
    return { titre: lus.map((l) => (l.qte ? `${l.nom} (${l.qte})` : l.nom)).join(", "), ou: "Courses", faire: () => ajouterArticles(lus) };
  },
};
