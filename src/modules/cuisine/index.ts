import type { Module } from "../contrat";

export const cuisine: Module = {
  id: "cuisine",
  libelle: "Cuisine",
  resume: "Courses, repas, frigo",
  etat: "bientot",
  prevu: [
    "Liste de courses partagée, classée par rayon, à cocher à deux",
    "Articles qui reviennent ajoutés tout seuls",
    "Repas de la semaine, reliés aux courses",
    "Stock du frigo, du congélateur et des placards, avec alertes de péremption",
    "Photo du ticket de caisse pour remplir le stock",
  ],
};
