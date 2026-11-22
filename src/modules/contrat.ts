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

export interface Module {
  id: string;            // aussi l'adresse de la page : #cuisine
  libelle: string;       // le nom dans le menu
  resume: string;        // une ligne sous le nom, sur la tuile de l'accueil
  etat: "construit" | "bientot";
  prevu: string[];       // ce que le module fera (montré tant qu'il n'est pas construit)
  Page?: ComponentType<ContexteModule>;   // la page du module
  Tuile?: ComponentType<ContexteModule>;  // sa tuile sur l'accueil (sinon une tuile simple)
  // Plus tard, quand la base les aura : tables de données propres (préfixe <id>_),
  // actions pour l'assistant IA, notifications, réglages propres au module.
}
