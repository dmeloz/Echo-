import { lazy } from "react";
import { liveQuery } from "dexie";
import { db } from "../../data/db";
import type { Personne } from "../../lib/types";
import type { Module } from "../contrat";
import { ajouterCorvees, cocherCorvees } from "./actions";
import { ditFait, lireCorvee, trouverCorvees, type Corvee } from "./donnees";
import { ReglagesMaison } from "./ReglagesMaison";
import { TuileMaison } from "./Tuile";
import { OUTILS_MAISON } from "./outilsEcho";

// La barre d'Echo lit une phrase sans attendre : on garde sous la main les corvées connues (tenues à jour par la base).
let connues: Corvee[] = [];
liveQuery(() => db.maison_corvees.toArray()).subscribe({ next: (c) => { connues = c; }, error: () => {} });

export const maison: Module = {
  id: "maison",
  libelle: "Maison",
  resume: "Corvées, entretien, papiers",
  etat: "construit",
  prevu: [],
  Page: lazy(() => import("./Page").then((m) => ({ default: m.PageMaison }))), // chargée à la première ouverture
  Tuile: TuileMaison,
  Reglages: ReglagesMaison,
  outils: OUTILS_MAISON,
  // « j'ai passé l'aspirateur » coche la corvée ; « corvée : litière tous les 2 jours » en ajoute une.
  comprendre: (texte) => {
    const nouvelle = /^\s*(?:nouvelle\s+)?corv[ée]e\s*:?\s+(.+)$/i.exec(texte);
    const lu = nouvelle && lireCorvee(nouvelle[1]);
    if (lu) return { titre: lu.nom, ou: "Maison", faire: () => ajouterCorvees([lu]) };
    const faites = ditFait(texte) ? trouverCorvees(texte, connues) : [];
    if (!faites.length) return null;
    return { titre: `${faites.map((c) => c.nom).join(", ")} : fait`, ou: "Maison", faire: async () => {
      const par = ((await db.reglages.get("proprio"))?.valeur as Personne | undefined) ?? "moi";
      await cocherCorvees(faites, par);
    } };
  },
};
