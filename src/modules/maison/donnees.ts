import { auJour, iso, plusJours, plusMois, sansAccents } from "../../lib/dates";
import { autre, type Personne } from "../../lib/types";

// Les données du module Maison et tout ce qui se calcule sans toucher à la base.
// Une corvée n'a pas de date fixe : elle revient « tous les N jours » à partir de la dernière fois où elle a été faite.

// Qui s'en occupe : une personne, chacun son tour, ou Echo choisit (celui qui en a le moins fait ces 4 semaines).
export type QuiCorvee = Personne | "tour" | "echo";
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
    { nom: "Nettoyer le plan de travail", piece: "Cuisine", tous: 1, taille: 1, choisi: true },
  ] },
  { titre: "Chaque semaine", modeles: [
    { nom: "Passer l'aspirateur", piece: "", tous: 7, taille: 2, choisi: true },
    { nom: "Lancer une lessive", piece: "", tous: 4, taille: 2, choisi: true },
    { nom: "Nettoyer la salle de bain", piece: "Salle de bain", tous: 7, taille: 3, choisi: true },
    { nom: "Laver les sols", piece: "", tous: 7, taille: 3, choisi: true },
    { nom: "Repassage", piece: "", tous: 7, taille: 3 },
    { nom: "Arroser les plantes", piece: "", tous: 7, taille: 1, choisi: true },
    { nom: "Faire la poussière", piece: "", tous: 7, taille: 2 },
  ] },
  { titre: "De temps en temps", modeles: [
    { nom: "Changer les draps", piece: "Chambre", tous: 14, taille: 2, choisi: true },
    { nom: "Nettoyer le frigo", piece: "Cuisine", tous: 30, taille: 2 },
    { nom: "Laver les vitres", piece: "", tous: 90, taille: 3, choisi: true },
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
// Elle attend depuis longtemps (plus de la moitié de son rythme en trop) : le seul moment où la jauge passe au rouge.
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
// Pour qui est la corvée aujourd'hui. Chacun son tour : l'autre que la dernière fois. Echo choisit : celui qui en a le moins fait.
export function pour(c: Corvee, e: Equilibre): Personne {
  if (c.qui === "moi" || c.qui === "elle") return c.qui;
  if (c.qui === "echo" && e.moi !== e.elle) return e.moi < e.elle ? "moi" : "elle";
  return c.par ? autre(c.par) : "moi";
}
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
  const qui = (["moi", "elle", "tour", "echo"] as const).find((q) => q === o.qui) ?? "tour";
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
