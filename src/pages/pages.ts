export interface Page { id: string; libelle: string; bientot?: boolean }

export const PAGES: Page[] = [
  { id: "aujourdhui", libelle: "Aujourd'hui" },
  { id: "cuisine", libelle: "Cuisine", bientot: true },
  { id: "maison", libelle: "Maison", bientot: true },
  { id: "budget", libelle: "Budget", bientot: true },
];
export const TOUTES: Page[] = [...PAGES, { id: "reglages", libelle: "Réglages" }];

export const TUILES: Record<string, string> = {
  cuisine: "Courses, repas, frigo",
  maison: "Corvées, entretien, papiers",
  budget: "Factures, abonnements",
};

export const PREVU: Record<string, string[]> = {
  cuisine: ["Liste de courses partagée, classée par rayon, à cocher à deux", "Articles qui reviennent ajoutés tout seuls", "Repas de la semaine, reliés aux courses", "Stock du frigo, du congélateur et des placards, avec alertes de péremption", "Photo du ticket de caisse pour remplir le stock"],
  maison: ["Corvées qui reviennent, réparties entre vous deux", "Entretien et réparations à suivre", "Documents importants rangés au même endroit"],
  budget: ["Factures et abonnements, avec rappel avant l'échéance", "Ton fichier de finances, quand tu l'auras envoyé"],
};
