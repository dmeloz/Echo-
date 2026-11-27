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
| Cuisine | lots 1 (courses) et 2 (semaine proposée par Echo) construits, plus la photo du ticket de caisse : voir « Cuisine » plus bas. Batch du dimanche, stock décompté et livre de recettes construits (2026-11-27). |
| Budget | lot 1 construit (2026-11-27) : voir « Budget » plus bas. Entre nous, liens Cuisine et Agenda, Echo : lots suivants. |
| Maison | corvées, entretien et papiers construits : voir « Maison » plus bas. |

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
- Un produit qui se compte a un compteur (`nb`, et `qte` = la taille d'une unité) : « 6 x 25 cl » lu sur le ticket, « 6 crèmes » écrit à la main, ou « J'en ai plusieurs ». Moins un à chaque fois (`compterProduit`) : au dernier il est remis aux courses, à zéro il sort du stock. Un rachat s'ajoute à ce qu'il reste.
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

## Cuisine · batch du dimanche, stock à jour tout seul, livre de recettes (2026-11-27)

- **Batch du dimanche** (`Batch.tsx`, table `cuisine_batch`, clé = le lundi de la semaine) : dès que deux repas validés restent à manger, la Semaine montre la ligne « Batch du dimanche ». La page calcule les boîtes (`boites()` : portions du soir, plus une si le lendemain il y a une gamelle) et demande le plan de cuisson à la fonction `cuisine` (`mode: "batch"`) : des étapes à cocher, l'écran reste allumé.
- **Stock à jour tout seul** : « Batch terminé » (`finirBatch`) range une boîte par plat au stock (id `boite-<jour>`, champ `repas`) et décompte ce qui a servi (`utilises()`), selon ce qu'on confirme : fini, il en reste, pas touché. Une boîte sort du stock le surlendemain de son repas (`rangerBoites`). Les boîtes ne sont pas envoyées à Echo comme ingrédients.
- **Livre de recettes** (`Livre.tsx`, table `cuisine_recettes`, clé = nom simplifié du plat) : pouce en haut ou en bas dans le détail d'un jour passé ou d'aujourd'hui. Les plats aimés partent dans `aimes`, les refusés dans `eviter` de la demande de semaine. « Prévoir » pose la recette au premier soir libre et met aux courses ce qu'il manque.
- **Accueil** : à partir de 17 h, la tuile dit « À sortir du congélateur » si le plat de demain en vient.
- Avant la mise en ligne : migration `20261127200000_cuisine_batch_recettes.sql` (genres `batch` et `recette`), puis redéployer la fonction `cuisine`.


## Cuisine · entrée « Ce soir », code-barres, plusieurs magasins (2026-11-27)

- **Entrée de Cuisine** (`Page.tsx`, `Accueil`) : plus de barre d'onglets. La page s'ouvre sur la carte « Ce soir » (le repas, la boîte à sortir du congélateur pour demain, ce qu'il faut manger vite), puis trois lignes : Stock, Courses, Semaine. Chaque partie a son retour « Cuisine » (bouton, glisser vers la droite, ou rechoisir Cuisine dans le menu).
- **Code-barres** (`Scanner.tsx`, `codeBarres.ts`) : Stock → « Scanner un code-barres ». La caméra lit le code (lecteur du téléphone s'il existe, sinon la bibliothèque `barcode-detector`, chargée seulement ici, avec son fichier `.wasm` servi par l'app). Le nom vient d'Open Food Facts : seul le numéro du code part sur internet. Un code inconnu se nomme à la main et reste dans `cuisine_codes` (table gardée sur le téléphone, pas envoyée au foyer). Le même produit scanné deux fois compte pour deux.
- **Plusieurs magasins** : en rangeant un ticket, Echo note l'enseigne de chaque produit dans son habitude (`Habitude.ou`, `nomMagasin()` = premier mot du magasin). Dès que deux enseignes sont connues, le mode « Au magasin » propose de dire où l'on est : ce qui s'achète d'habitude ailleurs passe en bas, sous « D'habitude ailleurs ».
- Rien à changer côté serveur pour ce lot.
## Maison · lot 1, les corvées (2026-11-27)

Plan et maquette : voir le fil « Construire le module Maison ». Trois parties prévues (Corvées, Entretien, Papiers) ; seules les corvées sont construites, donc seules à l'écran.

- **Une corvée** (`maison_corvees`) revient « tous les N jours » à partir de la dernière fois où elle a été faite (`jourDu` dans `donnees.ts`), pas à date fixe. Jamais faite : elle arrive à mi-chemin de son rythme, pour que tout ne tombe pas le premier jour.
- **L'état d'une corvée** s'écrit en un mot à droite de la ligne (`besoin`, `deborde`) : rien tant qu'elle peut attendre, « Bientôt », « À faire », puis « Attend » en orange quand elle attend depuis plus de la moitié de son rythme. Pas de jauge ici (dans le Stock de Cuisine, une jauge pleine veut dire « il en reste ») et pas de liste « en retard ».
- **Qui** (choix de Dany, 2026-11-27) : « Libre » par défaut, celui qui la fait la coche et l'app retient qui (`par`, et une ligne dans `maison_faits`) ; ou donnée à une personne. `pour()` rend la personne ou `null`, `pourMoi()` = libre ou à moi. Les anciennes valeurs « tour » et « echo » se lisent comme libres. La page montre « À faire » (libres et miennes) et « Pour l'autre ».
- **L'équilibre** : chaque corvée faite laisse une ligne dans `maison_faits` (qui, quand, minutes selon la taille : 5, 15 ou 40), gardée 60 jours. La barre montre la part de chacun sur 4 semaines. Pas de points ni de classement (choix du plan). Réglage « Montrer l'équilibre » dans Réglages → Maison.
- **La page** : « Pour toi », « Pour l'autre », puis « N autres peuvent attendre ». Toucher le rond = c'est fait (avec Annuler) ; toucher le nom ouvre le rythme, la taille, qui, « l'autre l'a fait », « Pas cette fois » (repousse d'un quart du rythme, sans compter pour personne) et « Retirer ».
- **Le premier jour** : une liste toute prête à toucher (`DEPART`). Ensuite on ajoute en une phrase : « litière tous les 2 jours » (`lireCorvee`).
- **Barre d'Echo** : « j'ai passé l'aspi » coche la corvée sans passer par l'assistant (`ditFait` + `trouverCorvees`) ; « corvée : … » en ajoute une.
- **Outils d'Echo** : `voir_maison` (lire), `corvee_faite` et `ajouter_corvee` (petites choses ; cocher pour l'autre est toujours demandé).
- **Synchro** : genres `corvee` et `corvee_faite`. Avant la mise en ligne : migration `20261127220000_maison_corvees.sql`, puis redéployer la fonction `echo` (sa liste d'outils a grandi).
- **Entretien** (lot 2, `Entretien.tsx`) : deuxième partie de la page (réglage `maisonPartie`). « À réparer » = `maison_reparations` (à faire, en cours, réparé ; une réparation finie quitte la liste et reste un an dans l'histoire de son appareil). « À entretenir » = des corvées marquées `entretien: true` (même jauge, même rond, même équilibre), rangées hors de la liste des corvées. « Appareils et contacts » = `maison_appareils` (pièce, date d'achat, garantie en mois, gestes habituels proposés par `gestesPour`, sans IA) et `maison_contacts` (une ligne écrite : « plombier Martin 079… »).
- Outil d'Echo en plus : `noter_reparation` ; `voir_maison` rend aussi `aReparer`. Synchro : genres `reparation`, `appareil`, `contact` (migration `20261127230000_maison_entretien.sql`, puis redéployer `echo`).

## Budget · lot 1, le budget partagé sans Echo (2026-11-27)

Page à trois parties (les mêmes onglets que l'Agenda) : Mois, Charges, Comptes. Le bouton « Dépense » est dans l'en-tête.

Deux règles tiennent le module (`donnees.ts`) :
1. **Chaque montant est daté.** Un poste (`budget_postes`) garde une liste de valeurs « à partir de tel mois » (ou « seulement ce mois »). Changer une valeur ajoute une ligne ; les mois d'avant ne bougent pas.
2. **Aucun total n'est saisi.** `bilan(postes, mois)` recalcule tout : ce qui reste à chacun (salaire − charges perso − virement), ce qui arrive au compte commun, les charges du foyer, le reste commun et son partage plaisir / épargne.

- **Le mois de budget** commence le 25 et porte le nom du mois où il finit (« Décembre » = 25 novembre – 24 décembre). Montants en centimes entiers.
- **Sortes de postes** : `revenu`, `perso` (payé par chacun), `virement` (vers le compte commun), `foyer` (compte `commun` ou `facture`), `part` (le pour cent du reste commun qui va au plaisir). Un poste `rythme: "an"` met un douzième de côté par mois ; `groupe` réunit plusieurs postes dans une bulle (« Véhicules »).
- **Mois** : deux tuiles (ce qui reste à chacun, toucher = le détail de la personne), le reste du commun partagé, les enveloppes (une charge du foyer liée à une catégorie : Courses, Frais divers ; Plaisir = sa part du reste), les factures à payer, les dépenses du mois.
- **Charges** : le total, puis une mosaïque de bulles dont la taille suit le poids. Toucher une bulle ouvre « Changer une valeur » : nouveau montant, à partir de quand, **ce que ça change** (calculé avant de valider par `effets`), l'historique, « Revenir à la valeur d'avant ».
- **Virements** : posés à la main ; la feuille montre le calcul d'Echo (même total, réparti selon les salaires, `proposerVirements`) et « Prendre ce calcul ». Une correction à la main est une valeur comme une autre : elle devient la base.
- **Comptes** : les vrais soldes de l'épargne et du compte facture, notés à la main (`budget_soldes`), et les provisions à l'année.
- **Dépenses** (`budget_depenses`) : montant, quoi, catégorie, qui a payé. Trois catégories de base ; les nouvelles (`budget_categories`, clé = nom simplifié) sont gardées pour le foyer.
- **Premier jour** : « Commencer » pose les lignes de départ sans montant (ids fixes, donc pas de doublon entre deux téléphones). Aucun chiffre du foyer n'est dans le code.
- **Pour le module Maison (Papiers)** : `ajouterAPayer(ligne)` (le même id deux fois ne double rien et ne défait pas un paiement), `marquerPaye`, `estPaye(id)` dans `actions.ts`, table `budget_apayer`.
- **Synchro** : genres `budget_poste`, `budget_depense`, `budget_categorie`, `budget_solde`, `budget_apayer`. La migration `20261128090000_budget.sql` doit être appliquée au projet « echo » avant la mise en ligne.
- Pas encore construits (donc absents de l'écran) : outils d'Echo et point du mois, relevé bancaire.

## Budget · lot 2, les liens (2026-11-27)

- **Tickets de caisse** : le Budget lit la table `cuisine_tickets` (il ne copie rien et n'appelle pas le code de Cuisine). Un ticket en francs avec un total devient une dépense « Courses » payée par le compte commun (`depenseDuTicket`, id `ticket:<id>`). Toucher la ligne permet de dire que l'un des deux a payé : une ligne `budget_depenses` du même id est alors gardée et passe devant (`avecTickets`). Un ticket retiré de Cuisine ne compte plus.
- **Entre nous** (le rond à droite des onglets, avec un point quand quelque chose est à rendre) : une dépense du foyer payée par l'un des deux avec son argent est due par le compte commun (`avances`, `duA`). « C'est rendu » pose `rembourse: <jour>` sur ses dépenses (avec Annuler). Rendue ou non, la dépense reste comptée dans son enveloppe.
- **Agenda et accueil** : `JourneeBudget` (champ `Journee` du contrat) montre ce qui est à payer le jour regardé : factures de `budget_apayer` (celles en retard aussi, aujourd'hui) et charges à l'année dont la date est notée (`echeancesDu`). Le contrat passe maintenant le jour regardé (`ctx.jour`) : la vue Jour de l'Agenda montre les lignes des modules pour n'importe quel jour ; celle de Maison ne vaut que pour aujourd'hui.
- **Papiers** (lot 3, `Papiers.tsx`, 2026-11-27) : l'administration du foyer. Un papier (`maison_papiers`) a un dossier (Impôts, Logement, Assurances, Santé, Véhicule, Abonnements, Identité, Garanties, Autre ; deviné depuis le titre par `devinerDossier`, sans IA), parfois une chose à faire (`quoi` : payer, renouveler, résilier, répondre) avec une échéance, un montant en centimes de franc et une répétition (mois, trimestre, an). La page montre « Bientôt » (30 jours, et ce qui est passé) puis les dossiers ; la barre du haut ajoute (« facture Swisscom 89.90 le 15.12 », lu par `lirePapier`) ou cherche, et son bouton photo crée un papier depuis une photo. Cocher = fait ; une chose qui revient repart à la prochaine échéance (`apresFait`).
- **Photos des papiers** (`photosPapiers.ts`) : gardées sur le téléphone (table `photos`, clé `papier:<id>`) et sur le serveur du foyer, seau privé `papiers`, dossier `<id du foyer>/` (choix de Dany : sur le serveur, à sécuriser ou migrer plus tard). Seuls les membres du foyer y ont accès (règles dans la migration). Le papier ne porte que les noms des photos.
- **Lien avec Budget** : Maison garde le papier, Budget s'occupera de l'argent. `aPayer(papier)` rend la ligne convenue avec le fil Budget (id `papier:<id>`, titre, émetteur, montant, échéance, répétition, dossier, payé). Le lien est dans `lienBudget.ts` : à chaque geste sur un papier à payer (ajouter, changer, cocher, retirer), Maison appelle `ajouterAPayer` / `marquerPaye` / `retirerAPayer` du Budget, jamais en réaction à la synchro. Une chose qui revient a une ligne par échéance (`papier:<id>:<AAAA-MM-JJ>`). Dans l'autre sens, `suivreBudget` regarde `budget_apayer` : une ligne payée dans le Budget coche le papier, et l'annulation le remet.
- Outils d'Echo en plus : `voir_papiers` (lire), `ranger_papier` (petite chose). Phrase directe : « facture : … », « papier : … », « à payer : … ». Synchro : genre `papier`. Avant la mise en ligne : migration `20261127240000_maison_papiers.sql` (genre + seau de photos), puis redéployer `echo`.

## Budget · lot 3, Echo et le point du mois (2026-11-27)

- **Le point du mois** (`pointDuMois` dans `donnees.ts`, écran `PointDuMois` ouvert par la ligne « Le point de … » au bas de Mois) : dépensé en tout et par catégorie, comparé au mois d'avant (rien à comparer le premier mois du budget), les enveloppes tenues ou dépassées, ce qui reste à chacun et ce qui part à l'épargne, les factures encore à payer jusqu'à la fin du mois, les montants qui ne sont plus ceux du mois d'avant. Rien n'est gardé : tout est recalculé, comme le reste.
- **Outils d'Echo** (`outilsEcho.ts`, décrits dans `supabase/functions/_shared/echo-outils.ts`) : `voir_budget` (lire), `point_du_mois` (lire, ce mois ou le mois d'avant) et `ajouter_depense` (petite chose : une dépense déjà faite, dans une catégorie qui existe, annulable). Echo reçoit des prénoms et des montants écrits (« 1 200 CHF »), jamais les places ni des centimes.
- **Ce qu'Echo ne fait pas** (décidé pour la bêta 1) : il ne paie rien, ne coche aucune facture comme payée, ne change ni salaire, ni charge, ni virement, et ne crée pas de catégorie. Il dit où le faire dans Budget.
- Avant la mise en ligne d'un changement de ces outils : redéployer la fonction `echo` depuis `base-app-aujourdhui` (voir la partie Echo).
