import { auJour, iso, plusJours, plusMois, sansAccents } from "../../lib/dates";
import { autre, type Personne } from "../../lib/types";

// Les données du module Maison et tout ce qui se calcule sans toucher à la base.
// Une corvée n'a pas de date fixe : elle revient « tous les N jours » à partir de la dernière fois où elle a été faite.

// Qui s'en occupe : libre (celui qui la fait la coche, l'app retient qui), ou donnée à une personne (choix de Dany, 2026-11-27).
export type QuiCorvee = Personne | "libre";
export type Taille = 1 | 2 | 3;
export const TAILLES: Array<{ id: Taille; nom: string; min: number }> = [
  { id: 1, nom: "Vite fait", min: 5 }, { id: 2, nom: "Moyen", min: 15 }, { id: 3, nom: "Un gros morceau", min: 40 },
];
export const minutesDe = (t: Taille) => TAILLES.find((x) => x.id === t)!.min;
export const RYTHMES: Array<{ jours: number; nom: string }> = [
  { jours: 1, nom: "Chaque jour" }, { jours: 2, nom: "Tous les 2 jours" }, { jours: 7, nom: "Chaque semaine" }, { jours: 14, nom: "Toutes les 2 semaines" },
  { jours: 30, nom: "Chaque mois" }, { jours: 90, nom: "Tous les 3 mois" },
];
// L'entretien d'un appareil revient moins souvent : ses rythmes à lui.
export const RYTHMES_ENTRETIEN: Array<{ jours: number; nom: string }> = [
  { jours: 30, nom: "Chaque mois" }, { jours: 60, nom: "Tous les 2 mois" }, { jours: 90, nom: "Tous les 3 mois" }, { jours: 180, nom: "Tous les 6 mois" }, { jours: 365, nom: "Chaque année" },
];
export const nomRythme = (jours: number) => [...RYTHMES, ...RYTHMES_ENTRETIEN].find((r) => r.jours === jours)?.nom ?? (jours % 7 === 0 ? `Toutes les ${jours / 7} semaines` : `Tous les ${jours} jours`);

// fait : la dernière fois (ms). par : qui l'a faite. report : pas avant ce jour (« Pas cette fois »).
// entretien : un geste d'entretien (« détartrer la machine à café ») : la même chose qu'une corvée, mais rangé dans Entretien. appareil : l'appareil concerné.
export interface Corvee { id: string; nom: string; piece: string; tous: number; taille: Taille; qui: QuiCorvee; fait: number | null; par?: Personne; report?: string; entretien?: boolean; appareil?: string; cree: number }
// Une ligne par corvée faite : sert à l'équilibre entre les deux (gardée 60 jours).
export interface Fait { id: string; corvee: string; nom: string; par: Personne; quand: number; min: number }

/* ---------- La liste de départ ---------- */

export interface Modele { nom: string; piece: string; tous: number; taille: Taille; choisi?: boolean }
export const DEPART: Array<{ titre: string; modeles: Modele[] }> = [
  { titre: "Tous les jours ou presque", modeles: [
    { nom: "Vaisselle", piece: "Cuisine", tous: 1, taille: 2, choisi: true },
    { nom: "Sortir les poubelles", piece: "Cuisine", tous: 2, taille: 1, choisi: true },
    { nom: "Faire le lit", piece: "Chambre", tous: 1, taille: 1 },
    { nom: "Nettoyer le plan de travail", piece: "Cuisine", tous: 1, taille: 1 },
  ] },
  { titre: "Chaque semaine", modeles: [
    { nom: "Passer l'aspirateur", piece: "", tous: 7, taille: 2, choisi: true },
    { nom: "Lancer une lessive", piece: "", tous: 4, taille: 2, choisi: true },
    { nom: "Nettoyer la salle de bain", piece: "Salle de bain", tous: 7, taille: 3, choisi: true },
    { nom: "Laver les sols", piece: "", tous: 7, taille: 3 },
    { nom: "Repassage", piece: "", tous: 7, taille: 3 },
    { nom: "Arroser les plantes", piece: "", tous: 7, taille: 1 },
    { nom: "Faire la poussière", piece: "", tous: 7, taille: 2 },
  ] },
  { titre: "De temps en temps", modeles: [
    { nom: "Changer les draps", piece: "Chambre", tous: 14, taille: 2 },
    { nom: "Nettoyer le frigo", piece: "Cuisine", tous: 30, taille: 2 },
    { nom: "Laver les vitres", piece: "", tous: 90, taille: 3 },
    { nom: "Nettoyer le four", piece: "Cuisine", tous: 90, taille: 3 },
    { nom: "Balcon", piece: "", tous: 30, taille: 2 },
    { nom: "Ranger la cave", piece: "", tous: 180, taille: 3 },
  ] },
];

/* ---------- Quand une corvée revient ---------- */

const jourDe = (ms: number) => iso(new Date(ms));
// Le jour où la corvée est à faire. Jamais faite : à mi-chemin de son rythme, pour que tout n'arrive pas le premier jour.
export function jourDu(c: Corvee): string {
  const du = c.fait ? plusJours(jourDe(c.fait), c.tous) : plusJours(jourDe(c.cree), Math.floor(c.tous / 2));
  return c.report && c.report > du ? c.report : du;
}
const ecart = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00") - Date.parse(a + "T12:00:00")) / 86_400_000);
// Le besoin, en trois crans : 1 = ça peut attendre, 2 = bientôt, 3 = à faire.
export function besoin(c: Corvee, now = new Date()): 1 | 2 | 3 {
  const reste = ecart(auJour(0, now), jourDu(c));
  return reste <= 0 ? 3 : reste <= Math.max(1, Math.round(c.tous / 3)) ? 2 : 1;
}
export const aFaire = (c: Corvee, now = new Date()) => besoin(c, now) === 3;
// Elle attend depuis longtemps (plus de la moitié de son rythme en trop) : son état passe alors à « Attend ».
export const deborde = (c: Corvee, now = new Date()) => ecart(jourDu(c), auJour(0, now)) > Math.max(1, Math.round(c.tous / 2));
// « il y a 8 jours », « jamais notée », « dimanche » : la petite ligne sous le nom.
export function depuis(c: Corvee, now = new Date()): string {
  if (!c.fait) return "";
  const n = ecart(jourDe(c.fait), auJour(0, now));
  return n <= 0 ? "fait aujourd'hui" : n === 1 ? "hier" : `il y a ${n} jours`;
}

/* ---------- Qui, et l'équilibre ---------- */

export type Equilibre = Record<Personne, number>; // minutes de corvées faites, ces 4 dernières semaines
export const QUATRE_SEMAINES = 28 * 86_400_000;
export function equilibre(faits: Fait[], now = Date.now()): Equilibre {
  const e: Equilibre = { moi: 0, elle: 0 };
  for (const f of faits) if (f.quand >= now - QUATRE_SEMAINES) e[f.par] += f.min;
  return e;
}
// Pour qui est la corvée : une personne, ou null si elle est libre (les anciennes « chacun son tour » et « Echo choisit » aussi).
export const pour = (c: Corvee): Personne | null => (c.qui === "moi" || c.qui === "elle" ? c.qui : null);
// Ce que la personne qui tient le téléphone peut faire : ce qui est à elle, et ce qui est libre.
export const pourMoi = (c: Corvee, proprio: Personne) => pour(c) !== autre(proprio);
// La part de chacun, en pour cent (50/50 tant que rien n'est noté).
export function parts(e: Equilibre): Equilibre {
  const total = e.moi + e.elle;
  if (!total) return { moi: 50, elle: 50 };
  const moi = Math.round((e.moi / total) * 100);
  return { moi, elle: 100 - moi };
}

/* ---------- Lire ce qu'on écrit ---------- */

const NOMBRES: Record<string, number> = { deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6 };
const UNITES: Array<[RegExp, number]> = [[/^jours?$/, 1], [/^semaines?$/, 7], [/^mois$/, 30], [/^ans?$|^annees?$/, 365]];
// « Litière du chat tous les 2 jours » → nom + rythme. Sans rythme dit : chaque semaine (ou le rythme donné).
export function lireCorvee(texte: string, defaut = 7): { nom: string; tous: number } | null {
  const t = texte.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!t) return null;
  const m = /\s*[,:]?\s*\b(?:(?:tou(?:s|tes) les|chaque)\s+(?:(\d{1,2}|deux|trois|quatre|cinq|six)\s+)?(jours?|semaines?|mois|ans?|ann[ée]es?)|(?:une|1) fois par (jour|semaine|mois|an))\s*$/i.exec(t);
  let nom = t, tous = defaut;
  if (m) {
    const n = m[1] ? NOMBRES[m[1].toLowerCase()] ?? Number(m[1]) : 1;
    const u = sansAccents(m[2] ?? m[3]);
    tous = Math.min(365, Math.max(1, n * (UNITES.find(([r]) => r.test(u))?.[1] ?? 7)));
    nom = t.slice(0, m.index).trim();
  }
  nom = nom.replace(/[.,;:]+$/, "").trim();
  if (!nom) return null;
  return { nom: nom[0].toUpperCase() + nom.slice(1), tous };
}

// Les mots qui comptent d'un nom de corvée (« Passer l'aspirateur » → aspirateur ; « aspi » le trouve aussi).
const VIDES = new Set(["les", "des", "une", "aux", "the", "passer", "faire", "lancer", "nettoyer", "laver", "sortir", "changer", "ranger", "mettre", "est", "fait", "faite", "ete", "ai", "j", "l", "d", "le", "la", "de", "du", "un", "a", "et", "en", "on"]);
const mots = (s: string) => sansAccents(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((m) => m.length > 1 && !VIDES.has(m));
const proche = (a: string, b: string) => a === b || (a.length >= 4 && b.startsWith(a)) || (b.length >= 4 && a.startsWith(b));
// Les corvées dont parle une phrase (« j'ai passé l'aspi et sorti les poubelles »).
export function trouverCorvees(texte: string, corvees: Corvee[]): Corvee[] {
  const dits = mots(texte);
  return corvees.filter((c) => { const m = mots(c.nom); return m.length > 0 && m.every((x) => dits.some((d) => proche(d, x))); });
}
// Une phrase qui dit qu'une chose est faite : « j'ai… », « … c'est fait », « on a… ».
export const ditFait = (texte: string) => !/\b(demain|faut|dois|doit|devoir|a faire|pas encore|pas fait)\b/.test(sansAccents(texte)) && /^\s*(j['’ ]?ai\b|on a\b|c['’]est fait|fait\s*:)|\b(c['’]est fait|est faite?s?|sont faite?s?)\s*[.!]?\s*$/i.test(texte);

/* ---------- Entretien : ce qui est cassé, les appareils, les contacts ---------- */

// etat : 1 à faire, 2 en cours (quelqu'un est prévenu), 3 réparé. fini : quand (ms). appareil : l'appareil concerné.
export type EtatReparation = 1 | 2 | 3;
export const ETATS_REPARATION: Array<{ id: EtatReparation; nom: string }> = [{ id: 1, nom: "À faire" }, { id: 2, nom: "En cours" }, { id: 3, nom: "Réparé" }];
export interface Reparation { id: string; nom: string; etat: EtatReparation; note: string; appareil?: string; cree: number; fini?: number }
// achat : le jour d'achat. garantie : en mois (0 : pas de garantie connue).
export interface Appareil { id: string; nom: string; piece: string; achat?: string; garantie: number; cree: number }
export interface Contact { id: string; nom: string; role: string; tel: string; cree: number }
export const GARANTIES: Array<{ mois: number; nom: string }> = [{ mois: 0, nom: "Aucune" }, { mois: 12, nom: "1 an" }, { mois: 24, nom: "2 ans" }, { mois: 36, nom: "3 ans" }, { mois: 60, nom: "5 ans" }];

const jourFr = (jour: string) => new Date(jour + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
export const finGarantie = (a: Appareil) => (a.achat && a.garantie ? plusMois(a.achat, a.garantie) : null);
// « Sous garantie jusqu'au 12 mars 2027 », « Garantie finie le 12 mars 2026 », ou rien si on ne sait pas.
export function texteGarantie(a: Appareil, now = new Date()): string {
  const fin = finGarantie(a);
  return !fin ? "" : fin >= auJour(0, now) ? `Sous garantie jusqu'au ${jourFr(fin)}` : `Garantie finie le ${jourFr(fin)}`;
}

// Les gestes d'entretien habituels d'un appareil, proposés quand on l'ajoute (rien n'est ajouté sans qu'on le touche).
type Geste = { nom: string; tous: number; taille: Taille };
const GESTES: Array<[RegExp, Geste[]]> = [
  [/lave.?linge|machine a laver/, [{ nom: "Lavage à vide à 90°", tous: 30, taille: 1 }, { nom: "Nettoyer le filtre du lave-linge", tous: 90, taille: 2 }]],
  [/lave.?vaisselle/, [{ nom: "Nettoyer le filtre du lave-vaisselle", tous: 30, taille: 1 }, { nom: "Remettre du sel au lave-vaisselle", tous: 60, taille: 1 }]],
  [/seche.?linge/, [{ nom: "Nettoyer le condenseur du sèche-linge", tous: 90, taille: 2 }]],
  [/hotte/, [{ nom: "Nettoyer le filtre de la hotte", tous: 60, taille: 2 }]],
  [/cafe|nespresso|expresso/, [{ nom: "Détartrer la machine à café", tous: 60, taille: 2 }]],
  [/bouilloire/, [{ nom: "Détartrer la bouilloire", tous: 60, taille: 1 }]],
  [/frigo|refrigerateur/, [{ nom: "Nettoyer le frigo", tous: 30, taille: 2 }]],
  [/congelateur/, [{ nom: "Dégivrer le congélateur", tous: 180, taille: 3 }]],
  [/\bfour\b/, [{ nom: "Nettoyer le four", tous: 90, taille: 3 }]],
  [/aspirateur/, [{ nom: "Nettoyer le filtre de l'aspirateur", tous: 30, taille: 1 }]],
  [/detecteur|fumee/, [{ nom: "Tester le détecteur de fumée", tous: 180, taille: 1 }]],
  [/chaudiere|chauffage/, [{ nom: "Faire contrôler la chaudière", tous: 365, taille: 2 }]],
  [/ventilation|vmc|aeration/, [{ nom: "Nettoyer les bouches d'aération", tous: 180, taille: 2 }]],
];
export const gestesPour = (nomAppareil: string): Geste[] => GESTES.filter(([r]) => r.test(sansAccents(nomAppareil))).flatMap(([, g]) => g);

// « Plombier Martin 079 123 45 67 » → nom, rôle (si le premier mot en est un), téléphone.
const ROLES = ["regie", "gerance", "plombier", "electricien", "concierge", "serrurier", "chauffagiste", "proprietaire", "assurance", "medecin", "garage", "voisin", "voisine"];
export function lireContact(texte: string): { nom: string; role: string; tel: string } | null {
  let t = texte.replace(/\s+/g, " ").trim().slice(0, 80);
  const m = /[,:]?\s*(\+?\d[\d ./]{6,}\d)\s*$/.exec(t);
  const tel = m ? m[1].replace(/[^\d+ ]/g, " ").replace(/ +/g, " ").trim() : "";
  if (m) t = t.slice(0, m.index).trim();
  t = t.replace(/[.,;:]+$/, "").trim();
  if (!t) return null;
  const premier = sansAccents(t.split(" ")[0]);
  const role = ROLES.includes(premier) ? t.split(" ")[0] : "";
  return { nom: t[0].toUpperCase() + t.slice(1), role: role ? role[0].toUpperCase() + role.slice(1) : "", tel };
}

/* ---------- Papiers : l'administration du foyer ---------- */

// Les dossiers. Aucune hypothèse locataire ou propriétaire : « Logement » couvre le bail, la régie, l'hypothèque.
export type Dossier = "impots" | "logement" | "assurances" | "sante" | "vehicule" | "abonnements" | "identite" | "garanties" | "autre";
export const DOSSIERS: Array<{ id: Dossier; nom: string; mots: RegExp }> = [
  { id: "impots", nom: "Impôts", mots: /impot|fisc|acompte|declaration|taxation/ },
  { id: "logement", nom: "Logement", mots: /loyer|bail|regie|gerance|hypothe|charges|proprietaire|serafe|electricite|romande energie|\bsig\b/ },
  { id: "assurances", nom: "Assurances", mots: /assurance|menage|\brc\b|responsabilite civile|mobiliere|axa|zurich|allianz|helvetia|baloise|generali/ },
  { id: "sante", nom: "Santé", mots: /caisse maladie|lamal|maladie|medecin|dentiste|hopital|pharmacie|css|helsana|swica|assura|groupe mutuel|visana|sanitas|concordia/ },
  { id: "vehicule", nom: "Véhicule", mots: /voiture|plaque|permis de conduire|vignette|garage|leasing|expertise|\bsan\b|vehicule|moto/ },
  { id: "abonnements", nom: "Abonnements", mots: /abonnement|swisscom|salt|sunrise|netflix|spotify|disney|internet|mobile|\bcff\b|demi-tarif|\bga\b|salle de sport|fitness/ },
  { id: "identite", nom: "Identité", mots: /passeport|carte d.identite|permis de sejour|permis [bcl]\b|\bavs\b|acte de|livret de famille|etat civil/ },
  { id: "garanties", nom: "Garanties", mots: /garantie|ticket d.achat|bon de garantie|mode d.emploi/ },
  { id: "autre", nom: "Autre", mots: /$^/ },
];
export const nomDossier = (d: Dossier) => DOSSIERS.find((x) => x.id === d)!.nom;
export const devinerDossier = (texte: string): Dossier => DOSSIERS.find((d) => d.mots.test(sansAccents(texte)))?.id ?? "autre";

// Ce qu'il y a à faire d'un papier, et quand. fait : le jour où c'est fait (payé, renvoyé…).
export type QuoiPapier = "" | "payer" | "renouveler" | "resilier" | "repondre";
export const QUOIS: Array<{ id: QuoiPapier; nom: string; fait: string }> = [
  { id: "", nom: "Rien à faire", fait: "" }, { id: "payer", nom: "À payer", fait: "Payé" }, { id: "renouveler", nom: "À renouveler", fait: "Renouvelé" },
  { id: "resilier", nom: "À résilier", fait: "Résilié" }, { id: "repondre", nom: "À répondre", fait: "Répondu" },
];
export type RepetePapier = "" | "mois" | "trimestre" | "an";
export const REPETES: Array<{ id: RepetePapier; nom: string; mois: number }> = [
  { id: "", nom: "Une fois", mois: 0 }, { id: "mois", nom: "Chaque mois", mois: 1 }, { id: "trimestre", nom: "Chaque trimestre", mois: 3 }, { id: "an", nom: "Chaque année", mois: 12 },
];
// jour : le jour du mois d'origine d'une échéance qui revient (29, 30 ou 31), pour qu'un loyer du 31 ne glisse pas au 28.
// montant : en centimes de franc (entier). Sur le téléphone, les photos sont dans la table photos (clé « papier:<id> »).
// photos : les noms des photos (« <id>.jpg »), gardées sur le serveur du foyer et sur chaque téléphone qui les a vues.
export interface Papier { id: string; titre: string; dossier: Dossier; emetteur: string; note: string; quoi: QuoiPapier; echeance?: string; montant?: number; repete: RepetePapier; fait?: string; jour?: number; photos: string[]; cree: number }
export const clePhotos = (p: Pick<Papier, "id">) => `papier:${p.id}`;

// « 89.90 », « 89,90 CHF », « 1'250.- » → centimes. Rien de lisible : undefined.
export function lireMontant(texte: string): number | undefined {
  const m = /(\d{1,3}(?:['’ ]\d{3})+|\d+)(?:[.,](\d{1,2}))?\s*(?:\.-|chf|fr\.?|francs?)?/i.exec(texte.replace(/chf\s*/i, ""));
  if (!m) return undefined;
  const francs = Number(m[1].replace(/['’ ]/g, "")), cts = m[2] ? Number(m[2].padEnd(2, "0")) : 0;
  const v = francs * 100 + cts;
  return v > 0 && v < 100_000_000 ? v : undefined;
}
export const texteMontant = (c: number) => `${Math.floor(c / 100).toLocaleString("fr-CH")}.${String(c % 100).padStart(2, "0")} CHF`;

// Une ligne écrite : « Facture Swisscom 89.90 le 15.12 » → titre, dossier deviné, montant, échéance.
const MOIS_FR = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
export function lirePapier(texte: string, now = new Date()): Pick<Papier, "titre" | "dossier" | "quoi"> & { echeance?: string; montant?: number } | null {
  let t = texte.replace(/\s+/g, " ").trim().slice(0, 100);
  if (!t) return null;
  let echeance: string | undefined;
  const annee = (j: number, m: number, a?: string) => {
    let y = a ? Number(a.length === 2 ? "20" + a : a) : now.getFullYear();
    if (!a && iso(new Date(y, m - 1, j)) < auJour(0, now)) y++;
    if (m < 1 || m > 12 || j < 1 || j > 31) return undefined;
    const d = new Date(y, m - 1, j, 12);
    return d.getMonth() === m - 1 ? iso(d) : undefined;
  };
  // Les montants écrits : avec des centimes ou une monnaie (« 89.90 », « 450.- », « CHF 20 »), ou un nombre seul en fin de ligne qui n'est pas une année.
  const sommesDe = (x: string) => [...x.matchAll(/(?<![\w.,'’/])(chf\s*)?(\d{1,3}(?:['’]\d{3})+|\d+)(?:[.,](\d{1,2}))?(\s*(?:\.-|chf\b|fr\b\.?|francs?\b))?(?![\w]|[.,/]\d)/gi)]
    .filter((m) => m[1] || m[3] || m[4] || (m.index + m[0].length === x.length && !/^(?:19|20)\d\d$/.test(m[2])));
  const sans = (x: string, m: RegExpMatchArray) => (x.slice(0, m.index) + " " + x.slice(m.index! + m[0].length)).replace(/\s+/g, " ").trim();
  // Les dates écrites : « le 15.12 », « 15.12.2026 », « 3 mars ». Le petit mot devant (le, au, avant le…) est un mot entier, jamais la fin d'un autre.
  const PRE = "(?:(?<=^|\\s)(le|au|avant le|pour le|d'ici le)\\s+)?(?<![\\w.,'’/])";
  const dates = [
    ...[...t.matchAll(new RegExp(PRE + "(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?(?![\\w]|[.,/]\\d|\\s*(?:chf|fr\\b|francs?|\\.-))", "gi"))]
      // « Parking 12.05 » tout seul est un prix : sans « le », sans année, il faut un autre montant dans la ligne pour y voir une date.
      .map((m) => ({ m, e: annee(Number(m[2]), Number(m[3]), m[4]), sur: !!m[1] || !!m[4] || m[0].includes("/") || sommesDe(sans(t, m)).length > 0 })),
    ...[...t.matchAll(new RegExp(PRE + "(\\d{1,2})(?:er)?\\s+([a-zéèûô]+)(?:\\s+(\\d{4}))?(?![\\wéèûô])", "gi"))]
      .map((m) => ({ m, e: annee(Number(m[2]), MOIS_FR.indexOf(sansAccents(m[3].toLowerCase())) + 1, m[4]), sur: true })),
  ].filter((d) => d.e && d.sur);
  // Celle qui suit « le » passe devant ; sinon la dernière (« 29.05 le 15.12 » : 29.05 est le prix).
  const date = dates.find((d) => d.m[1]) ?? dates.at(-1);
  if (date) { echeance = date.e; t = sans(t, date.m); }
  const somme = sommesDe(t).at(-1);
  const montant = somme ? lireMontant(somme[0]) : undefined;
  if (montant !== undefined && somme) t = sans(t, somme);
  t = t.replace(/\s+(?:expire|[àa] payer|[àa] renouveler)$/i, "").replace(/[.,;:–-]+$/, "").trim();
  if (!t) return null;
  const s = sansAccents(texte);
  const quoi: QuoiPapier = montant !== undefined || /factur|payer|acompte|prime|rappel/.test(s) ? "payer" : /resili/.test(s) ? "resilier" : /renouvel|expire|echeance/.test(s) ? "renouveler" : /repondre|courrier|lettre/.test(s) && echeance ? "repondre" : "";
  return { titre: t[0].toUpperCase() + t.slice(1), dossier: devinerDossier(t), quoi, ...(echeance ? { echeance } : {}), ...(montant !== undefined ? { montant } : {}) };
}

// Ce qui reste à faire, et pour quand : en haut de Papiers ce qui arrive dans les 30 jours (ou est passé).
export const aFairePapier = (p: Papier) => !!p.quoi && !!p.echeance && !p.fait;
export const joursAvant = (p: Papier, now = new Date()) => (p.echeance ? ecart(auJour(0, now), p.echeance) : Infinity);
export const bientot = (p: Papier, now = new Date(), jours = 30) => aFairePapier(p) && joursAvant(p, now) <= jours;
export function quandPapier(p: Papier, now = new Date()): string {
  const n = joursAvant(p, now);
  if (!Number.isFinite(n)) return "";
  return n < 0 ? (n === -1 ? "c'était hier" : `c'était il y a ${-n} jours`) : n === 0 ? "aujourd'hui" : n === 1 ? "demain" : n <= 30 ? `dans ${n} jours` : `le ${new Date(p.echeance + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`;
}
// Les papiers à régler un jour donné, pour la ligne de la journée : ceux qui tombent ce jour-là, et aujourd'hui aussi ceux en retard.
// auBudget : les lignes « à payer » que le Budget annonce déjà lui-même (module allumé, ligne présente) : on ne les redit pas.
export const papiersDu = (papiers: Papier[], jour: string, aujourdhui: string, auBudget: ReadonlySet<string> = new Set()) =>
  papiers.filter((p) => aFairePapier(p) && !auBudget.has(idAPayer(p)) && (p.echeance === jour || (jour === aujourdhui && p.echeance! < aujourdhui)))
    .sort((a, b) => a.echeance!.localeCompare(b.echeance!));
// Le résumé du matin : au plus deux phrases, ce qui tombe le jour raconté, puis ce qui traîne d'avant.
// Le soir (demain), ce qui reste d'avant n'est pas dit « en retard » : il est simplement encore là.
export function matinPapiers(papiers: Papier[], jour: string, demain = false): string[] {
  const ouverts = papiers.filter((p) => aFairePapier(p) && p.echeance! <= jour).sort((a, b) => a.echeance!.localeCompare(b.echeance!));
  const quoi = (p: Papier) => QUOIS.find((q) => q.id === p.quoi)?.nom.toLowerCase() ?? "à régler";
  const dire = (liste: Papier[], seul: string, plusieurs: string) =>
    liste.length === 1 ? `${liste[0].titre} : ${quoi(liste[0])}${seul}${liste[0].quoi === "payer" && liste[0].montant ? ` (${texteMontant(liste[0].montant)})` : ""}.`
      : `${liste.length} papiers ${plusieurs} : ${liste.slice(0, 3).map((p) => p.titre).join(", ")}${liste.length > 3 ? "…" : ""}.`;
  const duJour = ouverts.filter((p) => p.echeance === jour), avant = ouverts.filter((p) => p.echeance! < jour);
  return [
    duJour.length ? dire(duJour, demain ? " demain" : " aujourd'hui", `à régler ${demain ? "demain" : "aujourd'hui"}`) : "",
    avant.length ? dire(avant, demain ? ", pas encore fait" : ", en retard", demain ? "pas encore réglés" : "en retard") : "",
  ].filter(Boolean);
}
// C'est fait : une chose qui revient repart à la prochaine échéance ; sinon, elle garde le jour où c'est fait.
export function apresFait(p: Papier, now = new Date()): Papier {
  const mois = REPETES.find((r) => r.id === p.repete)?.mois ?? 0;
  if (mois && p.echeance) {
    const j = p.jour ?? Number(p.echeance.slice(8));
    // Le mois suivant, au jour d'origine s'il existe (le 31 → 28 février → 31 mars).
    const suivant = (e: string) => { const n = plusMois(e.slice(0, 8) + "01", mois), [y, m] = n.split("-").map(Number); return `${n.slice(0, 8)}${String(Math.min(j, new Date(y, m, 0).getDate())).padStart(2, "0")}`; };
    let e = suivant(p.echeance);
    while (e < auJour(0, now)) e = suivant(e);
    return { ...p, echeance: e, fait: undefined, jour: j > 28 ? j : undefined };
  }
  return { ...p, fait: auJour(0, now) };
}

// La ligne « à payer » que le module Budget reprendra (forme convenue avec le fil Budget, 2026-11-27).
export interface APayer { id: string; titre: string; emetteur: string; montant: number; echeance: string; repete: RepetePapier; dossier: Dossier; papier: string; paye: false | string }
// L'id de la ligne au Budget : un par échéance pour ce qui revient (sinon le mois suivant sortirait déjà payé).
export const idAPayer = (p: Pick<Papier, "id" | "repete" | "echeance">) => (p.repete && p.echeance ? `papier:${p.id}:${p.echeance}` : `papier:${p.id}`);
export const aPayer = (p: Papier): APayer | null =>
  p.quoi === "payer" && p.montant && p.echeance ? { id: idAPayer(p), titre: p.titre.slice(0, 80), emetteur: p.emetteur, montant: p.montant, echeance: p.echeance, repete: p.repete, dossier: p.dossier, papier: p.id, paye: p.fait ?? false } : null;

/* ---------- Ce qui arrive du foyer : on ne garde que les formes attendues ---------- */

const obj = (x: unknown) => (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
const txt = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
const nb = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const personne = (x: unknown): x is Personne => x === "moi" || x === "elle";
const JOUR_ISO = /^\d{4}-\d{2}-\d{2}$/;

export function nettoyerCorvee(x: unknown): Corvee | null {
  const o = obj(x), id = txt(o.id, 80), nom = txt(o.nom, 80).trim(), tous = nb(o.tous), report = txt(o.report, 10);
  if (!id || !nom || tous === null || !Number.isInteger(tous) || tous < 1 || tous > 365) return null;
  const taille = ([1, 2, 3] as const).find((t) => t === o.taille) ?? 2;
  const qui = o.qui === "moi" || o.qui === "elle" ? o.qui : "libre";
  const fait = nb(o.fait);
  return { id, nom, piece: txt(o.piece, 30).trim(), tous, taille, qui, fait: fait && fait > 0 ? fait : null,
    ...(personne(o.par) ? { par: o.par } : {}), ...(JOUR_ISO.test(report) ? { report } : {}),
    ...(o.entretien === true ? { entretien: true } : {}), ...(txt(o.appareil, 80) ? { appareil: txt(o.appareil, 80) } : {}), cree: nb(o.cree) ?? Date.now() };
}
export function nettoyerFait(x: unknown): Fait | null {
  const o = obj(x), id = txt(o.id, 80), quand = nb(o.quand), min = nb(o.min);
  if (!id || !personne(o.par) || quand === null || min === null || min < 0 || min > 240) return null;
  return { id, corvee: txt(o.corvee, 80), nom: txt(o.nom, 80), par: o.par, quand, min };
}
export function nettoyerReparation(x: unknown): Reparation | null {
  const o = obj(x), id = txt(o.id, 80), nom = txt(o.nom, 80).trim(), fini = nb(o.fini);
  if (!id || !nom) return null;
  const etat = ([1, 2, 3] as const).find((e) => e === o.etat) ?? 1;
  return { id, nom, etat, note: txt(o.note, 200), ...(txt(o.appareil, 80) ? { appareil: txt(o.appareil, 80) } : {}), cree: nb(o.cree) ?? Date.now(), ...(etat === 3 && fini ? { fini } : {}) };
}
export function nettoyerAppareil(x: unknown): Appareil | null {
  const o = obj(x), id = txt(o.id, 80), nom = txt(o.nom, 60).trim(), achat = txt(o.achat, 10), garantie = nb(o.garantie);
  if (!id || !nom) return null;
  return { id, nom, piece: txt(o.piece, 30).trim(), ...(JOUR_ISO.test(achat) ? { achat } : {}), garantie: garantie !== null && Number.isInteger(garantie) && garantie >= 0 && garantie <= 240 ? garantie : 0, cree: nb(o.cree) ?? Date.now() };
}
export function nettoyerContact(x: unknown): Contact | null {
  const o = obj(x), id = txt(o.id, 80), nom = txt(o.nom, 80).trim();
  if (!id || !nom) return null;
  return { id, nom, role: txt(o.role, 30).trim(), tel: txt(o.tel, 20).replace(/[^\d+ ]/g, ""), cree: nb(o.cree) ?? Date.now() };
}
// Un jour qui existe vraiment (« 2026-02-31 » n'en est pas un).
export const vraiJour = (s: string) => JOUR_ISO.test(s) && iso(new Date(s + "T12:00:00")) === s;
export function nettoyerPapier(x: unknown): Papier | null {
  const o = obj(x), id = txt(o.id, 80), titre = txt(o.titre, 100).trim(), echeance = txt(o.echeance, 10), fait = txt(o.fait, 10), montant = nb(o.montant);
  if (!id || !titre) return null;
  const dossier = DOSSIERS.find((d) => d.id === o.dossier)?.id ?? "autre";
  const quoi = QUOIS.find((q) => q.id === o.quoi)?.id ?? "";
  const repete = REPETES.find((r) => r.id === o.repete)?.id ?? "";
  return { id, titre, dossier, emetteur: txt(o.emetteur, 60).trim(), note: txt(o.note, 300), quoi, ...(vraiJour(echeance) ? { echeance } : {}),
    ...(montant !== null && Number.isInteger(montant) && montant > 0 && montant < 100_000_000 ? { montant } : {}), repete, ...(vraiJour(fait) ? { fait } : {}), ...(repete && [29, 30, 31].includes(o.jour as number) ? { jour: o.jour as number } : {}),
    photos: (Array.isArray(o.photos) ? o.photos : []).filter((n): n is string => typeof n === "string" && /^[a-z0-9]{4,40}\.jpg$/.test(n)).slice(0, 12), cree: nb(o.cree) ?? Date.now() };
}
