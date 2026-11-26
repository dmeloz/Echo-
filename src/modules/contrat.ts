import type { ComponentType } from "react";
import type { Noms, Personne, Tache } from "../lib/types";

// Le contrat d'un module. La base (accueil Aujourd'hui, menu, réglages, assistant plus tard)
// ne connaît les modules que par ce contrat. Les modules ne se parlent pas entre eux.
//
// Pour ajouter un module : créer src/modules/<id>/index.ts qui exporte un objet Module,
// puis l'ajouter à la liste de src/modules/registre.ts. Voir docs/MODULES.md.

export interface ContexteModule {
  noms: Noms;
  proprio: Personne;     // le téléphone de qui
  now: Date;
  aller: (id: string) => void;
  ouvrir: (t: Tache) => void; // ouvre la feuille d'une tâche (la feuille appartient à la base)
}

// Une phrase prise par un module : ce qu'on montre avant d'envoyer, et ce qui se passe à l'envoi.
export interface PourModule { titre: string; ou: string; faire: () => Promise<unknown> }

export interface Module {
  id: string;            // aussi l'adresse de la page : #cuisine
  libelle: string;       // le nom dans le menu
  resume: string;        // une ligne sous le nom, sur la tuile de l'accueil
  etat: "construit" | "bientot";
  prevu: string[];       // ce que le module fera (montré tant qu'il n'est pas construit)
  Page?: ComponentType<ContexteModule>;   // la page du module
  Tuile?: ComponentType<ContexteModule>;  // sa tuile sur l'accueil (sinon une tuile simple)
  Reglages?: ComponentType<ContexteModule>; // sa sous-page dans les Réglages (une ligne du sommaire à son nom)
  // Ce que le module sait faire d'une phrase écrite dans la barre d'Echo. null : ce n'est pas pour lui.
  comprendre?: (texte: string) => PourModule | null;
  // Ses tables de données (préfixe <id>_) sont déclarées dans src/data/db.ts, et dans src/sync/genres.ts si elles partent au foyer.
  // Plus tard : actions pour l'assistant IA, notifications.
}
