import { lazy } from "react";
import { db } from "../../data/db";
import type { Module } from "../contrat";
import { JourneeBudget } from "./Journee";
import { matinBudget } from "./donnees";
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
  // Le résumé du matin : les charges à l'année et les factures qui tombent ce jour-là (celles des Papiers seulement si la Maison est masquée).
  // Maison masquée : elle ne parle pas, le Budget dit alors aussi les factures des Papiers.
  matin: async ({ jour, demain }) => {
    const masques = ((await db.reglages.get("modulesMasques"))?.valeur as string[] | undefined) ?? [];
    return matinBudget(await db.budget_apayer.toArray(), await db.budget_postes.toArray(), jour, demain, masques.includes("maison"));
  },
};
