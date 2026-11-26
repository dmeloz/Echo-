// Les listes de l'atelier : écrans, tailles d'écran, réglages proposés, et les noms simples des éléments de l'app.
export const ECRANS = [
  { id: "aujourdhui", nom: "Aujourd'hui" }, { id: "planning", nom: "Agenda" }, { id: "reglages", nom: "Réglages" },
  { id: "cuisine", nom: "Cuisine" }, { id: "maison", nom: "Maison" }, { id: "budget", nom: "Budget" },
];

export const TAILLES = [
  { nom: "iPhone", l: 393, h: 852 }, { nom: "Petit iPhone", l: 375, h: 667 },
  { nom: "Grand iPhone", l: 440, h: 956 }, { nom: "iPad", l: 820, h: 1180 },
];

export type Prop = { css: string; nom: string; groupe: string; type: "couleur" | "nombre" | "ombre" | "flou"; lit?: string; min?: number; max?: number; pas?: number; unite?: string };
export const GROUPES = ["Couleurs", "Texte", "Espaces", "Forme"];
export const PROPS: Prop[] = [
  { css: "color", nom: "Couleur du texte", groupe: "Couleurs", type: "couleur" },
  { css: "background-color", nom: "Fond", groupe: "Couleurs", type: "couleur" },
  { css: "border-color", nom: "Couleur du bord", groupe: "Couleurs", type: "couleur", lit: "border-top-color" },
  { css: "opacity", nom: "Opacité", groupe: "Couleurs", type: "nombre", min: 0, max: 1, pas: 0.05 },
  { css: "font-size", nom: "Taille", groupe: "Texte", type: "nombre", min: 13, max: 48, pas: 0.5, unite: "px" },
  { css: "font-weight", nom: "Épaisseur", groupe: "Texte", type: "nombre", min: 300, max: 900, pas: 100 },
  { css: "letter-spacing", nom: "Écart des lettres", groupe: "Texte", type: "nombre", min: -2, max: 4, pas: 0.1, unite: "px" },
  { css: "line-height", nom: "Hauteur de ligne", groupe: "Texte", type: "nombre", min: 12, max: 60, pas: 1, unite: "px" },
  { css: "padding-block", nom: "Dedans, haut et bas", groupe: "Espaces", type: "nombre", lit: "padding-top", min: 0, max: 48, pas: 1, unite: "px" },
  { css: "padding-inline", nom: "Dedans, côtés", groupe: "Espaces", type: "nombre", lit: "padding-left", min: 0, max: 48, pas: 1, unite: "px" },
  { css: "gap", nom: "Écart entre les éléments", groupe: "Espaces", type: "nombre", lit: "row-gap", min: 0, max: 48, pas: 1, unite: "px" },
  { css: "margin-block", nom: "Autour, haut et bas", groupe: "Espaces", type: "nombre", lit: "margin-top", min: 0, max: 48, pas: 1, unite: "px" },
  { css: "border-radius", nom: "Arrondi", groupe: "Forme", type: "nombre", lit: "border-top-left-radius", min: 0, max: 60, pas: 1, unite: "px" },
  { css: "border-width", nom: "Épaisseur du bord", groupe: "Forme", type: "nombre", lit: "border-top-width", min: 0, max: 6, pas: 0.5, unite: "px" },
  { css: "box-shadow", nom: "Ombre", groupe: "Forme", type: "ombre" },
  { css: "backdrop-filter", nom: "Flou du verre", groupe: "Forme", type: "flou" },
  { css: "width", nom: "Largeur", groupe: "Forme", type: "nombre", min: 0, max: 440, pas: 1, unite: "px" },
  { css: "height", nom: "Hauteur", groupe: "Forme", type: "nombre", min: 0, max: 440, pas: 1, unite: "px" },
];

export const OMBRES = [
  { nom: "Aucune", css: "none" },
  { nom: "Légère", css: "inset 0 1px 0 #fff, 0 4px 12px rgb(20 70 110 / .07)" },
  { nom: "Douce", css: "inset 0 1px 0 #fff, 0 10px 26px rgb(20 70 110 / .10)" },
  { nom: "Marquée", css: "inset 0 1px 0 #fff, 0 18px 44px rgb(20 70 110 / .20)" },
];

const CODES: Record<string, string> = { c1: "C1", c5: "C5", c6: "C6", "c-repos": "Repos", "c-vac": "Vacances", "c-rare": "Codes rares", "c-conge": "Congé" };
export const NOMS_JETONS: { groupe: string; test: (n: string) => boolean; noms: Record<string, string> }[] = [
  { groupe: "Couleurs", test: (n) => /^--(fond|coulisses|reflet|bleu|turquoise|encre|discret|trait|verre|bord|ombre|rouge)/.test(n), noms: {
    "--fond": "Fond de la page", "--coulisses": "Fond derrière le menu", "--reflet-bleu": "Reflet bleu", "--reflet-turquoise": "Reflet turquoise", "--reflet-lavande": "Reflet lavande",
    "--bleu": "Bleu (important, Echo)", "--bleu-pale": "Bleu pâle", "--turquoise": "Turquoise (fait, 2e profil)", "--turquoise-texte": "Turquoise des textes", "--turquoise-pale": "Turquoise pâle",
    "--encre": "Texte", "--discret": "Texte discret", "--trait": "Traits fins", "--verre": "Verre des cartes", "--verre-fort": "Verre épais", "--bord": "Bord des cartes", "--ombre": "Ombre des cartes", "--rouge": "Rouge (en retard)" } },
  { groupe: "Tailles de texte", test: (n) => n.startsWith("--t-"), noms: { "--t-petit": "Petit texte", "--t-corps": "Texte normal", "--t-phrase": "Phrase d'accueil", "--t-carte": "Titre de carte", "--t-titre": "Titre de page" } },
  { groupe: "Espaces et arrondis", test: (n) => /^--[er]\d$/.test(n), noms: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].flatMap((i) => [[`--e${i}`, `Espace ${i}`], [`--r${i}`, `Arrondi ${i}`]])) },
  { groupe: "Couleurs du travail", test: (n) => /^--c\d|^--c-/.test(n), noms: Object.fromEntries(Object.entries(CODES).flatMap(([k, v]) => [[`--${k}`, `${v}, fond`], [`--${k}-t`, `${v}, texte`]])) },
  { groupe: "Vitesse des mouvements", test: (n) => n.startsWith("--m-"), noms: {} },
  { groupe: "Police", test: (n) => n === "--police", noms: { "--police": "Police" } },
];

export const NOMS_CLASSES: Record<string, string> = {
  g: "Carte de verre", focus: "Carte « En premier »", "focus-titre": "Titre « En premier »", "focus-quand": "Heure « En premier »", "focus-pied": "Boutons « En premier »",
  "page-titre": "Titre de la page", date: "Date", lab: "Petit titre", phrase: "Phrase d'accueil", entete: "En-tête", duo: "Profils", avatar: "Rond du profil",
  tache: "Ligne de tâche", glisse: "Fond de la ligne", coche: "Rond à cocher", titre: "Titre de tâche", meta: "Détails de tâche", taches: "Liste de tâches", journee: "Carte « Ensuite »",
  bouton: "Bouton", second: "Bouton calme", petit: "Petit bouton", "bouton-texte": "Bouton texte", capsule: "Capsule menu + Echo", "echo-btn": "Bouton Echo", "zone-echo": "Coin Echo",
  tuile: "Tuile de module", "tuile-icone": "Icône de tuile", "tuile-bientot": "Tuile « bientôt »", trois: "Rangée de tuiles", barre: "Barre de progression", compte: "Compteur",
  interrupteur: "Interrupteur", "module-ligne": "Ligne de réglage", reglages: "Bloc de réglages", "aide-champ": "Texte d'aide", rangee: "Rangée de boutons", champ: "Champ à remplir",
  scene: "Fond de la page", defile: "Page qui défile", cadre: "Colonne de la page", menu: "Menu", ligne: "Ligne du menu", coulisses: "Derrière le menu", pied: "Bas du menu",
  feuille: "Feuille du bas", "barre-bas": "Barre d'écriture", saisie: "Zone d'écriture", "matin-bouton": "Bouton du matin", "travail-accueil": "Pastille du travail",
  resume: "Résumé du matin", demain: "Carte « Demain »", "vue-choix": "Choix Jour / Semaine", "grille-mois": "Grille du mois", "gm-jour": "Jour de la grille", "jour-rang": "Ligne d'un jour",
  "ligne-temps": "Ligne du temps", puce: "Pastille", exemples: "Bandeau des exemples", "note-donnees": "Note du bas", membres: "Membres du foyer", vide: "Écran vide",
};
