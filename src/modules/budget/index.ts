import { lazy } from "react";
import type { Module } from "../contrat";
import { TuileBudget } from "./Tuile";

// Le budget partagé du foyer (lot 1, sans Echo) : ce qui reste à chacun, les charges, les comptes.
// Le module Maison lui passe les factures à payer par ajouterAPayer / estPaye (actions.ts).
export const budget: Module = {
  id: "budget",
  libelle: "Budget",
  resume: "Ce qui reste, charges, comptes",
  etat: "construit",
  prevu: [],
  Page: lazy(() => import("./Page").then((m) => ({ default: m.PageBudget }))), // chargée à la première ouverture
  Tuile: TuileBudget,
};
