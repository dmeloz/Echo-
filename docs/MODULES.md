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
| `Reglages` | une ligne à son nom dans le sommaire des Réglages, et sa sous-page |
| `comprendre` | une phrase de la barre d'Echo que le module prend pour lui (« plus de lait » va aux courses, pas dans les tâches) |
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
| Agenda (id planning) | construit : aujourd'hui et les six jours suivants, vue Jour et vue Semaine, idée pour alléger le jour le plus chargé. Il lit les tâches de la base (pas de table à lui). |
| Cuisine | lots 1 (courses) et 2 (semaine proposée par Echo) construits, plus la photo du ticket de caisse : voir « Cuisine » plus bas. Le batch cooking vient ensuite. |
| Maison, Budget | pas encore construits |

## Ajouter un module

1. Créer `src/modules/<id>/index.ts` qui exporte un objet `Module`.
2. L'ajouter à la liste `MODULES` de `src/modules/registre.ts`.
3. Passer `etat` à `"construit"` et fournir `Page` (et `Tuile` si besoin) quand il est prêt.

## Agenda · Mes horaires (2026-11-26)

Troisième vue du Planning. Un code de travail par jour et par personne (table Dexie `horaires`, clé `[qui+jour]`), repris de la fiche du chef de Melo :
C1 coupé 9 h – 14 h et 18 h 30 – 22 h 30, C5 8 h – 16 h 30 (lundi et mardi), C6 12 h – 21 h, Repos, Vacances, Congé (CHR) ; codes rares C2, C3, C4. FOR, EPM et Nyon de la fiche ne sont pas gardés (choix de Melo).
La fiche sépare matin et après-midi : l'app garde un seul code pour la journée (choix de Melo).
On remplit le mois en touchant les jours, ou en écrivant tous les codes d'un coup. Les horaires s'affichent dans les vues Jour et Semaine et dans le résumé du matin.
Les codes et leurs heures sont dans `src/lib/horaires.ts`.

### Lecture de la fiche par photo

« Prendre la fiche en photo » envoie la photo (réduite à 2400 px) à la fonction Supabase `lire-horaires` (projet echo, code dans `supabase/functions/lire-horaires/`), qui la fait lire par Claude et renvoie un code par jour pour le nom donné. L'app montre un aperçu (jours douteux en pointillés), on corrige, puis on enregistre.
Secrets de la fonction (dans Supabase, jamais dans l'app) : `ANTHROPIC_API_KEY` et `ECHO_CODE`. Le téléphone garde le nom sur la fiche et le code Echo (réglages `nomFiche`, `codeEcho`, exclus de la sauvegarde).

## Agenda · Événements et iCloud (2026-11-26)

- Un événement est une tâche avec `evt: true` (et `fin` en option) : pas de case à cocher, absent des listes de l'accueil (seul le prochain du jour est dit dans la phrase), visible dans l'Agenda et le résumé du matin.
- iCloud dans les deux sens par la fonction serveur `icloud` (CalDAV). Secrets à poser dans Supabase : `ICLOUD_IDENTIFIANT` (identifiant Apple) et `ICLOUD_MOT_DE_PASSE` (mot de passe pour app, créé sur account.apple.com). Seuls les foyers de `prive.icloud_foyers` y ont droit.
- Lire (`src/sync/icloud.ts`) : une semaine en arrière, trois mois devant, à l'ouverture de l'app (au plus toutes les 5 min). Écrire : file d'attente sur le téléphone, envoyée 1,5 s après un changement d'événement. Les occurrences d'une série (ou d'un événement sur plusieurs jours) sont en lecture seule.

## Cuisine · lot 1, les courses (2026-11-26)

Page à trois parties : Semaine, Courses, Stock (elle s'ouvre sur Courses le vendredi et le samedi).

- **Courses** : on écrit plusieurs articles d'un coup (« 2 citrons, du lait »), ou on dicte. Chaque article est rangé dans son rayon par des mots connus (`donnees.ts`) ; un rayon corrigé à la main est retenu. Un carrousel montre une carte par rayon ; un rayon terminé sort du carrousel. Toucher la case coche, toucher le nom ouvre quantité, rayon et « Retirer » (pas de glisser sur une ligne : le glisser sert au carrousel). Le carrousel et les pilules des rayons sont exclus du geste qui ouvre le menu (`MenuGlissant.tsx`).
- **Au magasin** (bouton dans l'en-tête, par `#entete-module`) : gros articles, un rayon à la fois, écran qui reste allumé. « Courses finies » range ce qui est coché.
- **Achats habituels** : ce qui est coché quitte la liste au bout de 12 h (ou avec « Courses finies ») et l'achat est retenu (`cuisine_habitudes`). À partir de trois achats réguliers, Echo remet l'article tout seul (pastille E). Le retirer = il attend un tour de plus, et arrête au troisième refus. Réglage dans Réglages → Cuisine.
- **Barre d'Echo** : « plus de lait », « des œufs aux courses », « courses : pain, riz » vont à la liste sans passer par l'assistant.
- **Goûts** : questionnaire en popup à la première ouverture, par personne (`cuisine_gouts`), modifiable dans Réglages → Cuisine. Pas de porc pour le foyer.
- **Semaine** et **Stock** : formes simples, à la main, en attendant les lots suivants.
- **Synchro** : les tables `cuisine_*` partent au foyer par `src/sync/genres.ts` (genres `course`, `habitude`, `repas`, `stock`, `gout` de la table `elements`). La migration `20261127090000_cuisine.sql` doit être appliquée au projet « echo » avant la mise en ligne.
- Pas encore construits (donc absents de l'écran) : code-barres, plusieurs magasins, batch cooking, livre de recettes.

## Cuisine · lot 2, la semaine proposée par Echo (2026-11-27)

- **Semaine** : « Cette semaine » ou « La prochaine » (ouverte du vendredi au dimanche). Un jour = une ligne ; toucher un jour montre les portions du soir, la gamelle, les ingrédients, et « Changer », « Écrire », « Retirer ».
- **« Prévoir ma semaine »** : l'app calcule les besoins (`besoins` dans `donnees.ts`) à partir des horaires : 2 portions le soir, 1 quand quelqu'un travaille après 20 h, et une gamelle le midi pour la personne aux horaires fixes. Elle envoie à la fonction serveur `cuisine` les jours à prévoir (lundi à vendredi, pas encore passés, sans repas), les goûts, le stock, les plats récents. Samedi et dimanche restent libres.
- La fonction `cuisine` (`supabase/functions/cuisine/`, Claude Haiku 5.5, mêmes droits et compteur que `echo`) renvoie un plat par jour, ses ingrédients, s'il vient du congélateur (jeudi, vendredi) et la gamelle. Jamais de porc : c'est dans la consigne et vérifié à la sortie.
- Les repas reçus sont une **proposition** (`propose: true`, barre « Proposition d'Echo ») jusqu'à **Valider**. Valider ajoute aux courses les ingrédients qui ne sont pas au stock (`manquants`), avec « Annuler ». « Changer » redemande un seul jour.
- Secret nécessaire : `ANTHROPIC_API_KEY` (le même que pour `echo`). Sans lui, l'app le dit et on peut toujours écrire les repas à la main.

## Cuisine · la photo du ticket de caisse (2026-11-27)

- Où : bouton « Prendre le ticket en photo » en haut du Stock, et lien « Cocher avec le ticket de caisse » sous les courses.
- Chemin : la photo est réduite sur le téléphone (`lib/lecture.ts`), part vers la fonction Supabase `lire-ticket` avec les articles encore à prendre, et n'est gardée nulle part. La fonction rend le magasin, le jour, le total et une ligne par produit : nom en clair, quantité, prix, endroit (frigo, congélateur, placard, maison ou « pas au stock »), jours de conservation estimés pour le frais, et l'article de la liste qui correspond.
- Rien n'est écrit avant « Ranger » : l'écran « Ton ticket » permet de décocher une ligne fausse et de changer l'endroit d'un toucher.
- « Ranger » (`ticket.ts`) : ajoute au stock (un produit déjà au même endroit n'est pas doublé, sa date est rafraîchie), coche les articles de la liste, garde le ticket dans `cuisine_tickets` (genre `ticket`, synchronisé : magasin, jour, total, prix par ligne, pour le budget plus tard). Le message propose « Annuler », qui remet tout.
- La réponse du serveur est nettoyée deux fois (fonction, puis `nettoyerLecture`) : tailles bornées, lieux connus, un article de la liste coché une seule fois et seulement s'il a été envoyé.
- Mise en service : migration `20261127150000_cuisine_ticket.sql` (genre `ticket`), fonction `lire-ticket` à déployer, secret `ANTHROPIC_API_KEY` posé.

## Cuisine · ce qu'il reste d'un produit, et Echo qui part du stock (2026-11-27)

- Dans un endroit du Stock, toucher un produit ouvre « Il en reste » : Plein, À moitié, Presque fini, Fini. Une petite jauge à trois traits le montre sur la ligne.
- « Presque fini » remet le produit aux courses ; « Fini » le sort du stock et le remet aux courses (`noterReste` dans `actions.ts`, avec « Annuler »). « Retirer sans racheter » l'enlève seulement.
- Un produit presque fini ne compte plus comme « au stock » pour la semaine d'Echo. Racheté par un ticket, il redevient plein.
- La semaine d'Echo part du stock : l'app envoie ce qui se mange (frigo d'abord, ce qui presse en tête, puis congélateur et placard), la date du jour et le jour où l'on cuisine. La fonction `cuisine` construit les plats autour de ces produits et dit pour chaque plat ce qu'il prend au stock (`duStock`, affiché « Avec ton stock : … »).
