import type { Module } from "../contrat";
import { PagePlanning } from "./Page";
import { TuilePlanning } from "./Tuile";

export const planning: Module = {
  id: "planning",
  libelle: "Planning",
  resume: "Ta semaine, jour par jour",
  etat: "construit",
  prevu: [],
  Page: PagePlanning,
  Tuile: TuilePlanning,
};
