import type { ComponentType } from "react";
import type { Noms, Personne, Tache } from "../lib/types";
import type { Executant } from "../lib/echo/outils";

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
  jour?: string;         // le jour regardé dans l'Agenda, pour la ligne « Journee » (absent : aujourd'hui)
  creer?: (pre: { jour: string; heure?: string }) => void; // ouvre la feuille d'une nouvelle tâche, déjà réglée sur ce jour (et cette heure)
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
  // Une petite ligne dans la journée (accueil, sous « Ensuite », et vue Jour de l'Agenda, pour le jour regardé : ctx.jour). Rien à dire : elle ne rend rien.
  Journee?: ComponentType<ContexteModule>;
  // Ce que le module a à dire dans le résumé du matin : de courtes phrases, sans mise en forme. Le résumé en montre 2 au plus par module.
  // jour : la journée racontée (demain, pour le résumé du soir : demain vaut alors true). Rien à dire : une liste vide.
  matin?: (c: { jour: string; demain: boolean }) => Promise<string[]>;
  // Ce que le module sait faire d'une phrase écrite dans la barre d'Echo. null : ce n'est pas pour lui.
  comprendre?: (texte: string) => PourModule | null;
  // Ce que l'assistant Echo peut faire dans ce module : nom de l'outil → ce que fait l'app.
  // Chaque nom doit aussi être décrit (avec son genre lire / petit / gros) dans supabase/functions/_shared/echo-outils.ts,
  // la liste fermée que le serveur donne à Claude. Voir docs/MODULES.md, « Echo qui agit ».
  outils?: Record<string, Executant>;
  // Ses tables de données (préfixe <id>_) sont déclarées dans src/data/db.ts, et dans src/sync/genres.ts si elles partent au foyer.
  // Plus tard : notifications.
}
