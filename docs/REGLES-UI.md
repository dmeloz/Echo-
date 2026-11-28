# Les règles d'interface d'Echo

Reprises du document « Les axes UI/UX de Kora », sans ses couleurs : Echo garde son thème clair **Givre lagon**.
Le **bleu** (`--accent`, #2f6bff) joue le rôle que le laiton joue dans Kora : *la chose de maintenant*.

Ce fichier fait foi pour toute nouvelle page et pour chaque module. Les mesures vivent à un seul endroit : le haut de `src/styles.css` (jetons).

## 1. Sept principes

1. **Une seule chose forte par écran.** Sur l'accueil, c'est la carte « En premier ». Tout le reste est calme (verre clair, texte encre ou gris).
2. **Dire plutôt que compter.** Une phrase (« 3 choses à faire, la prochaine à 19 h. ») plutôt qu'un chiffre seul.
3. **Tout se défait.** Chaque action montre « Annuler » quelques secondes. Ce qui efface demande deux touches.
4. **Calme par défaut.** La couleur arrive avec l'urgence : rouge pour « en retard », bleu pour « maintenant ». Pas de confettis, pas de son.
5. **L'essentiel tient sur le premier écran** sans défiler : la phrase, « En premier », trois lignes de « Ensuite ».
6. **Chaque info n'apparaît qu'une fois** (aujourd'hui, puis demain, puis les modules).
7. **Sous le pouce.** Les actions vivent en bas à droite, dans une seule capsule de verre : le menu en haut, l'étoile Echo en bas. Toucher l'étoile ouvre la barre d'écriture (elle se range après l'envoi, en touchant la page ou avec Échap) ; la maintenir 450 ms lance la dictée. Les messages avec Annuler prennent la place de la barre rangée.

## 2. Les cartes de l'accueil

Pas de système de cartes à la Kora : les **tuiles des modules** en tiennent lieu. Deux règles seulement :

- **Une seule chose mise en avant à la fois** : ce qui est à faire maintenant (« En premier », avec « C'est fait » et « À demain »).
- **Une tuile ouvre la page de son module.** Elle ne fait rien d'autre.
- **Seule la carte « En premier » se retourne** (idée de Kora, validée par Melo) : devant la tâche, au dos ses étapes, sa note et les gestes rapides « À demain », « Pour l'autre », « Modifier ».

Ordre de l'accueil : résumé du matin (jusqu'à midi) → phrase (et « Sarah a fait… ») → En premier → Ensuite (3 lignes, « Voir les autres ») → Demain → Cette semaine (cartes calmes) → modules.

## 3. Mouvement

Courbe de référence : `cubic-bezier(0.32, 0.72, 0, 1)` (`--douce`). Mouvements nommés, durées dans les jetons :

| Nom | Pour quoi | Durée |
| --- | --- | --- |
| ligne | une ligne qui glisse | 350 ms |
| apparition | une carte qui arrive | 300 ms |
| onglet | changer de page | 320 ms |
| feuille | feuille du bas | 420 ms |
| assistant | l'assistant qui répond | 450 ms |
| widget | une tuile qui change | 480 ms |
| barre | une barre de progression | 500 ms |
| chiffre | un chiffre qui roule | 550 ms |

- Les cartes arrivent **en cascade**, 70 ms d'écart.
- **Moins d'animations** (réglage de l'iPhone) : fondu ou rien, et l'action se fait tout de suite.
- **La vibration vient sous le doigt**, au toucher, pas à la fin de l'animation.

### Les quatre gestes

| Geste | Sens | Comment | Durée | Dans Echo |
| --- | --- | --- | --- | --- |
| Elle respire | C'est fait | 1 → 1,035 → 0,99 → 1 et un fin trait se trace dessous, puis la ligne part | 420 ms | fait (lignes et « En premier ») |
| Elle tremble | C'est raté | trois petits allers-retours | 320 ms | fait (barre d'ajout si l'enregistrement rate) |
| Le liseré tourne | Elle travaille | un fil fait le tour de la bulle et se referme à la réponse | 280 ms pour se fermer | **plus tard**, avec l'assistant |
| Le sceau se dessine | Tout est fini | un cercle puis une coche se tracent | 450 ms | fait (« Tout est fait ») |

Un doublon ne tremble pas : « déjà là » n'est pas une erreur.

## 4. Gestes du doigt (choix d'Echo)

Echo **garde** ses gestes : glisser → = plus important, glisser ← = plus tard ; toucher le rond = fait ; rester appuyé 450 ms puis monter ou descendre = changer l'ordre (au-dessus de la liste = « En premier »). (Kora fait → = fait, ← = supprimer : pas repris.)
Echo **garde** la barre d'ajout « + » (rangée derrière l'étoile Echo), le résumé du matin (voulu par Melo), et la capsule menu + Echo en bas **à droite**. Les interrupteurs sont « liquides » (la couleur se verse) ; la loupe de l'en-tête cherche dans les tâches (titre, note, étapes).

## 5. États

| État | Ce qu'on montre |
| --- | --- |
| Vide | un pictogramme au trait, un titre, une phrase qui dit comment commencer. Jamais « Aucun élément ». |
| Rien aujourd'hui | « Rien de prévu, rien ne presse » |
| Chargement | la silhouette de la page (squelette), pas une roue |
| Page qui plante | écran de secours : « Réessayer » et « Retour à l'accueil » |
| Enregistrement raté | un message qui dit quoi faire, et l'élément tremble |
| Hors ligne | « Pas de réseau. Tout marche quand même : c'est gardé sur ce téléphone. » |
| Données pas assez sûres | l'élément ne prétend pas savoir, et dit comment l'aider |

## 6. Comment l'app parle

- Tutoiement, phrases courtes, mots de tous les jours.
- Dates en clair : « demain », « jeudi », jamais 2026-11-26.
- Une action dit ce qu'elle fait : « C'est fait », « À demain », « Plus tard », « Annuler ». Pas « OK » ni « Valider ».
- Une erreur dit le geste qui débloque, et rassure (« Rien n'est perdu »).
- Sur son propre téléphone : « Tu as fait… », pas « Melo a fait… ».
- Les mêmes noms partout (menu, titres, messages, assistant).
- Pas d'emoji dans l'interface : la joie passe par le geste (le sceau).

## 7. L'assistant (pour plus tard)

- **Trois niveaux d'autonomie**, choisis par chacun : *Il observe* / *Il propose* (défaut) / *Il agit, puis te dit*.
  Avec la règle de Melo : **toujours demander dès que ça coûte de l'argent**, et ce qui efface attend toujours un oui.
- **Journal du jour** : tout ce qu'il a fait, chaque ligne avec « Annuler » ; oublié au bout de 7 jours.
- **Heures calmes** 22 h – 7 h : ce qui arrive la nuit attend le matin (sauf urgence).
- Il ne répète pas ce qu'une carte montre déjà, ne dérange pas pendant qu'on touche ou écrit.
- Les cartes qu'il vient de toucher **respirent** l'une après l'autre (110 ms, trois au plus).
- Différence avec Kora : Echo **garde le résumé du matin** (voulu par Melo).
- Ce qu'il ne sait pas faire devient une idée notée, pas un échec muet.

## 8. Accessibilité et les 9 détails de finition

- [x] Zone de toucher de 44 points (coche, croix, petits boutons)
- [ ] Les zones ne se marchent pas dessus : à vérifier page par page
- [x] Contour bleu au clavier seulement (`:focus-visible`)
- [ ] Le même trait pour toutes les icônes (1,5) : appliqué aux nouvelles icônes, les anciennes à reprendre
- [ ] Arrondis concentriques : jetons posés (4 / 12 / 22 / 28), à appliquer partout
- [x] Chiffres tabulaires (heures, compteurs)
- [x] Titres de carte équilibrés (`text-wrap: balance`)
- [x] Pas de mot seul en fin de phrase (`text-wrap: pretty`)
- [x] Chaque « rien ici » est une vraie page vide

Aussi : rien sous 13 px (sauf une initiale dans une pastille, marquée « exception »), contraste AA, feuilles qui gardent le focus (Vaul), suivre « Réduire les animations ».

## 9. Méthode

1. **Un seul fichier de jetons** : le haut de `src/styles.css`. On n'écrit pas une couleur ou une durée ailleurs.
2. **Ce fichier de règles** est relu avant chaque nouveau module.
3. **Vérification automatique avant chaque version** : `npm run verifier` (rien sous 13 px, pas d'emoji), lancée par la mise en ligne avec les tests.
4. **Corbeille de 30 jours** (Réglages → Données et app) : ce qu'on efface reste récupérable, avec qui l'a effacé et quand, sur chaque téléphone.
5. **Le guide** ne se remontre que si l'allure de l'app change vraiment.
6. **Chaque module** suit `docs/MODULES.md` et ces règles.

## L'atelier de design

Outil de travail de Melo, **hors de l'app** : une page du projet Claude qui montre la vraie app dans un cadre et permet de régler couleurs, tailles et espaces sans code. `npm run atelier` construit `dist-atelier/` (l'app en `app.html`, la page en `page.html`) ; Claude publie ce dossier. « Envoyer à Claude » range le design dans la base de la page (`atelier/design`) ; Claude le relit et l'écrit dans `src/styles.css`. À republier quand l'app change.

## 8. Finitions 2027 (les détails, tenus dans `src/finitions.css`)

- **44 px sous le doigt.** Tout ce qui se touche a une zone d'au moins 44 px. La forme visible peut rester plus petite : la zone déborde (`::after`).
- **Un seul bouton retour.** Une pastille de verre en haut à gauche de la sous-page, avec le nom de l'endroit où l'on revient (`.retour`). Glisser vers la droite fait la même chose.
- **Rien ne passe sous la capsule.** Un givre (`.halo-capsule`) efface ce qui défile près d'elle, comme l'effet de bord d'iOS 26.
- **Le bouton qui enregistre reste sous le pouce** : collé en bas de la feuille, jamais au bout d'un long défilement.
- **Pas de bande grise** pour choisir entre deux ou trois vues : les mots sont posés sur la page, une goutte de verre glisse dessous.
- **Rien sous 13 px**, y compris dans le raccourci `font:` (vérifié par `npm run verifier`).
- **Vibration** : `vibrer()` vibre sur Android ; sur iPhone elle fait le « tic » d'iOS quand le système le permet (17.4 à 26.4), sinon rien. Ne jamais compter dessus pour dire quelque chose.
- **Ce qui arrive vient du côté où l'on va** (`src/lib/mouvement.ts`). Une sous-page vient de la droite, le retour revient de la gauche, un onglet ou un jour plus à droite vient de la droite. Rien à écrire dans un module, sauf trois gestes : une sous-page montre `.retour` (ou `.retour-agenda`, même pastille) et se ferme elle-même quand « echo-retour » arrive (le sens et la hauteur, eux, sont gérés pour toute l'app) ; des flèches « d'avant / d'après » portent `data-va="avant"` / `data-va="apres"` ; ce qui change (le jour, le mois, la semaine) a une `key`, pour se redessiner.
- **Le retour ramène là où l'on était** : à la même hauteur dans la page d'avant. Ne pas remettre soi-même la page en haut au retour.
- **Tout répond sous le doigt** : un bouton se tasse un peu (règle commune sans poids : un appui écrit pour un bouton garde la main), une ligne de liste s'éclaire.

## 10. Vitesse (lot 3 des finitions)

- **Le verre là où il sert** : sur ce qui flotte (capsule, barre, feuilles, messages, résumé). Pas de flou sur les cartes de la page : sur le fond lisse il ne se voit pas, et il coûte à chaque image du défilement.
- **Écrire `-webkit-backdrop-filter` avant `backdrop-filter`.** Le build (lightningcss) ne garde que la dernière des deux : dans l'autre ordre, le verre disparaît partout sauf sur iPhone.
- **Rien ne tourne pour rien** : pas d'animation sans fin sur un écran au repos (un point qui appelle pulse 3 fois, puis se tait ; les lueurs des coulisses dorment quand la page les couvre).
- **`will-change` seulement pendant un geste**, jamais posé d'avance sur chaque ligne d'une liste.

