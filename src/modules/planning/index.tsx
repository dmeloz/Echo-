import { lazy } from "react";
import type { Module } from "../contrat";
import { TuilePlanning } from "./Tuile";

export const planning: Module = {
  id: "planning",
  libelle: "Agenda",
  resume: "Ta semaine, jour par jour",
  etat: "construit",
  prevu: [],
  Page: lazy(() => import("./Page").then((m) => ({ default: m.PagePlanning }))), // chargée à la première ouverture
  Tuile: TuilePlanning,
};
