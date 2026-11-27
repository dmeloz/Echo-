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
| Cuisine | lot 1 construit (courses) : voir « Cuisine » plus bas. Les repas proposés par Echo, le batch cooking et le stock par ticket viennent ensuite. |
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
- Pas encore construits (donc absents de l'écran) : code-barres, photo du ticket, plusieurs magasins, repas proposés par Echo, batch cooking.

## Echo qui agit (lot 1 du moteur, 2026-11-27)

L'assistant Echo n'est plus seulement un lecteur de phrases : il travaille en boucle (au plus 6 tours) avec une **liste fermée d'outils**.

- La liste : `supabase/functions/_shared/echo-outils.ts` (nom, description, schéma, genre `lire` / `petit` / `gros`, la consigne, et `demandeTour`, la demande envoyée à Claude). Lue par le serveur et par l'app.
- Le serveur (`supabase/functions/echo`, mode `agent`) : garde la clé, vérifie le foyer, compte la dépense du jour (`prive.depenses_echo`, plafond `ECHO_BUDGET_JOUR`, 0,50 $ sinon) et passe la conversation à Claude Haiku 5.5. Il ne touche à aucune donnée du foyer.
- L'app (`src/lib/echo/`) : `boucle.ts` fait les tours, `outils.ts` exécute les outils de la base (tâches, agenda, horaires). Un outil qui change quelque chose prépare une action, montrée à la fin avec « Oui / Non ». Réglage « Petites choses sans demander » (`echoSeul`, éteint par défaut) : les actions `petit` sont faites tout de suite, avec Annuler. Effacer, et toucher aux choses de l'autre, restent toujours demandés.
- Le journal (`echo_journal`, genre de synchro `journal`) : une ligne par action faite, visible dans Réglages → Echo.

Donner des outils à un module :
1. Décrire l'outil dans `OUTILS_ECHO` (supabase/functions/_shared/echo-outils.ts), avec son genre.
2. Fournir son exécutant dans le champ `outils` du module (`lire` ou `preparer`, voir `Executant` dans src/lib/echo/outils.ts).
3. Ajouter un cas aux phrases d'essai (`essais/echo.essais.ts`) et lancer `ANTHROPIC_API_KEY=… npm run essais` avant la mise en ligne.
