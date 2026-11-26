# Les modules

L'app = **une base** + **des modules**.

- **La base** : l'accueil Aujourd'hui (les tâches), le menu glissant, les réglages, et plus tard
  la synchro à deux, les notifications et l'assistant IA.
- **Un module** : une partie de la vie du foyer (Cuisine, Maison, Budget…), construite et testée
  une à la fois. On peut en ajouter d'autres plus tard.

Chaque module se branche de la même façon, par le contrat de `src/modules/contrat.ts` :

| Ce que le module donne | Où ça apparaît |
| --- | --- |
| `libelle` | une entrée dans le menu glissant |
| `Page` | sa page (adresse `#<id>`) |
| `Tuile` (ou `resume`) | sa tuile sur l'accueil |
| `etat: "bientot"` + `prevu` | une page « Pas encore construit » qui dit ce qui viendra |

Chaque module peut être masqué dans **Réglages → Modules**.

Règles :
1. Les modules ne s'appellent pas entre eux. S'ils doivent partager quelque chose (par exemple
   « une tâche pour la Maison »), ça passe par la base.
2. Un module garde ses propres données (tables Dexie préfixées par son id, par exemple `cuisine_courses`).
3. Pas de faux boutons : tant qu'une fonction n'est pas construite, elle est marquée comme telle.

## Les modules aujourd'hui

| Module | État |
| --- | --- |
| Planning | construit : aujourd'hui et les six jours suivants, vue Jour et vue Semaine, idée pour alléger le jour le plus chargé. Il lit les tâches de la base (pas de table à lui). |
| Cuisine, Maison, Budget | pas encore construits |

## Ajouter un module

1. Créer `src/modules/<id>/index.ts` qui exporte un objet `Module`.
2. L'ajouter à la liste `MODULES` de `src/modules/registre.ts`.
3. Passer `etat` à `"construit"` et fournir `Page` (et `Tuile` si besoin) quand il est prêt.

## Planning · Mes horaires (2026-11-26)

Troisième vue du Planning. Un code de travail par jour et par personne (table Dexie `horaires`, clé `[qui+jour]`), repris de la fiche du chef de Melo :
C1 coupé 9 h – 14 h et 18 h 30 – 22 h 30, C5 8 h – 16 h 30 (lundi et mardi), C6 12 h – 21 h, Repos, Vacances ; codes rares C2, C3, C4, FOR, EPM, CHR.
La fiche sépare matin et après-midi : l'app garde un seul code pour la journée (choix de Melo).
On remplit le mois en touchant les jours, ou en écrivant tous les codes d'un coup. Les horaires s'affichent dans les vues Jour et Semaine et dans le résumé du matin.
Les codes et leurs heures sont dans `src/lib/horaires.ts`.
