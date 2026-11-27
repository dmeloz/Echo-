import { lazy } from "react";
import type { Module } from "../contrat";
import { JourneeBudget } from "./Journee";
import { OUTILS_BUDGET } from "./outilsEcho";
import { TuileBudget } from "./Tuile";

// Le budget partagé du foyer  : ce qui reste à chacun, les charges, les comptes.
// Le module Maison lui passe les factures à payer par ajouterAPayer / estPaye (actions.ts).
export const budget: Module = {
  id: "budget",
  libelle: "Budget",
  resume: "Ce qui reste, charges, comptes",
  etat: "construit",
  prevu: [],
  Page: lazy(() => import("./Page").then((m) => ({ default: m.PageBudget }))), // chargée à la première ouverture
  Tuile: TuileBudget,
  Journee: JourneeBudget,
  outils: OUTILS_BUDGET,
};
