// Les mises à jour d'Echo, pour la page Réglages → Echo : ce qui a changé, dit simplement, la plus récente d'abord.
// À chaque changement d'Echo mis en ligne, ajouter une entrée EN HAUT de la liste (une date, un titre, une à trois phrases).
export interface Nouveaute { jour: string; titre: string; points: string[] }

export const NOUVEAUTES: Nouveaute[] = [
  {
    jour: "2026-11-27", titre: "Echo regarde une photo",
    points: [
      "Touche l'appareil photo dans la barre d'Echo et montre-lui un courrier, une facture, le frigo ou une liste écrite à la main.",
      "Il te dit ce qu'il y lit et propose quoi en faire. La photo n'est gardée nulle part.",
    ],
  },
  {
    jour: "2026-11-27", titre: "Annuler une action d'Echo pendant 7 jours",
    points: ["Dans « Ce qu'Echo a fait », juste au-dessus, chaque action a son bouton Annuler, sur le téléphone qui l'a demandée."],
  },
  {
    jour: "2026-11-27", titre: "L'heure de départ au travail",
    points: ["Sur l'accueil, le travail du jour affiche « pars à… ». Tes adresses se règlent dans Réglages → Agenda, et restent sur ton téléphone."],
  },
  {
    jour: "2026-11-27", titre: "Echo répond en direct et prend l'initiative",
    points: [
      "Sa réponse s'écrit sous tes yeux.",
      "Il te dit un mot le matin, et te prévient quand l'autre ajoute ou finit quelque chose (un point sur l'étoile). Ça se coupe ici, dans « Echo prend l'initiative ».",
    ],
  },
  {
    jour: "2026-11-27", titre: "Echo connaît la Maison",
    points: ["Il sait noter une corvée faite, une chose à réparer, et ranger un papier (facture, contrat, échéance)."],
  },
  {
    jour: "2026-11-27", titre: "Echo discute, organise et se souvient",
    points: [
      "Tu lui parles comme à quelqu'un : il organise une journée ou une semaine, ajoute aux courses, et te demande avant de changer quoi que ce soit.",
      "Il garde en mémoire ce que tu lui dis de retenir, et tes discussions restent à relire.",
    ],
  },
  {
    jour: "2026-11-26", titre: "Echo comprend tes phrases",
    points: ["Une phrase écrite ou dictée devient une tâche ou un rendez-vous, avec le jour, l'heure et la personne."],
  },
];
