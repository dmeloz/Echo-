import { iso, sansAccents, z } from "../../lib/dates";
import type { Personne } from "../../lib/types";

// Les données du module Budget et tout ce qui se calcule sans toucher à la base.
//
// Deux règles tiennent tout le module :
// 1. Chaque montant est DATÉ : une valeur vaut « à partir de tel mois ». En changer une n'écrit rien sur les mois passés.
// 2. Aucun total n'est saisi : ce qui reste à chacun, le reste du commun, l'épargne… sont toujours recalculés.
//
// Les montants sont en centimes (entiers), pour ne jamais perdre un centime dans un calcul.

/* ---------- Le mois de budget ---------- */

// Le mois de budget commence le 25 (jour des salaires) et porte le nom du mois où il finit :
// « Décembre » va du 25 novembre au 24 décembre. Un mois s'écrit AAAA-MM.
export const DEBUT = 25;
export function moisDe(jour: string): string {
  const [a, m, j] = jour.split("-").map(Number);
  return j >= DEBUT ? plusMoisB(`${a}-${z(m)}`, 1) : `${a}-${z(m)}`;
}
export function plusMoisB(mois: string, n: number): string {
  const [a, m] = mois.split("-").map(Number);
  const d = new Date(a, m - 1 + n, 1, 12);
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}`;
}
// Le premier et le dernier jour du mois de budget.
export function bornes(mois: string): { du: string; au: string } {
  const [a, m] = mois.split("-").map(Number);
  return { du: iso(new Date(a, m - 2, DEBUT, 12)), au: iso(new Date(a, m - 1, DEBUT - 1, 12)) };
}
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const nomMois = (mois: string) => majuscule(new Date(mois + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long" }));
const jourCourt = (jour: string) => new Date(jour + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
export const jourLong = (jour: string) => new Date(jour + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
// « 25 nov. – 24 déc. »
export function periode(mois: string): string { const { du, au } = bornes(mois); return `${jourCourt(du)} – ${jourCourt(au)}`; }
const ecartJours = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00") - Date.parse(a + "T12:00:00")) / 86_400_000);
// Où on en est dans le mois : jours passés (aujourd'hui compris), jours en tout, jours qui restent (aujourd'hui compris).
export function avancee(mois: string, today: string): { passes: number; total: number; restants: number } {
  const { du, au } = bornes(mois), total = ecartJours(du, au) + 1;
  const passes = Math.min(total, Math.max(0, ecartJours(du, today) + 1));
  return { passes, total, restants: today > au ? 0 : today < du ? total : total - passes + 1 };
}

/* ---------- Les postes : tout ce qui a un montant qui revient ---------- */

// revenu : un salaire. perso : une charge que chacun paie de son compte. virement : ce que chacun verse au compte commun.
// foyer : une charge du foyer, payée par le compte commun ou le compte facture. part : la part du reste commun qui va au plaisir (en pour cent).
export type Sorte = "revenu" | "perso" | "virement" | "foyer" | "part";
export type Compte = "commun" | "facture";
export type Rythme = "mois" | "an";
// des : le mois à partir duquel la valeur vaut. une : seulement ce mois-là (« une seule fois »). quand, par : qui l'a posée, pour l'historique.
export interface Valeur { des: string; c: number; une?: boolean; quand: number; par?: Personne }
// rythme « an » : le montant est celui de l'année, le mois en met un douzième de côté. groupe : plusieurs postes montrés ensemble (« Véhicules »).
// cat : la catégorie de dépenses que ce poste finance (une enveloppe : « Courses »). fin : le poste s'arrête à partir de ce mois.
// echeance : pour un poste à l'année, quand la facture tombe (MM-JJ), si on le sait.
export interface Poste {
  id: string; nom: string; sorte: Sorte; qui?: Personne; compte?: Compte; rythme: Rythme;
  groupe?: string; cat?: string; note?: string; echeance?: string; valeurs: Valeur[]; fin?: string; cree: number;
}
export const PART_PLAISIR = "part-plaisir";

// La valeur d'un poste pour un mois : la dernière qui vaut à partir d'un mois passé ou de celui-ci ; une valeur « une seule fois » pour ce mois
// passe devant, sauf si on a reposé depuis une valeur durable pour ce même mois (la dernière décision gagne).
// Rien n'est jamais effacé : les valeurs remplacées restent dans l'historique. null : le poste n'existe pas (encore, ou plus) ce mois-là.
export function valeurDe(p: Poste, mois: string): number | null {
  if (p.fin && mois >= p.fin) return null;
  let une: Valeur | null = null, durable: Valeur | null = null;
  for (const v of p.valeurs) {
    if (v.une) { if (v.des === mois && (!une || v.quand >= une.quand)) une = v; }
    else if (v.des <= mois && (!durable || v.des > durable.des || (v.des === durable.des && v.quand >= durable.quand))) durable = v;
  }
  if (!durable) return null;
  return une && !(durable.des === mois && durable.quand > une.quand) ? une.c : durable.c;
}
// Ce que le poste pèse sur un mois (un douzième pour un poste à l'année).
export function parMois(p: Poste, mois: string): number | null {
  const c = valeurDe(p, mois);
  return c === null ? null : p.rythme === "an" ? Math.round(c / 12) : c;
}
export const vivants = (postes: Poste[], mois: string) => postes.filter((p) => valeurDe(p, mois) !== null);

/* ---------- Le bilan d'un mois : tout est calculé ---------- */

type Deux = Record<Personne, number>;
export interface Bilan {
  mois: string;
  revenu: Deux; perso: Deux; virement: Deux;
  reste: Deux;            // ce qui reste à chacun : salaire − charges perso − virement
  entree: number;         // ce qui arrive au compte commun
  foyer: number;          // les charges du foyer
  parCompte: Record<Compte, number>;
  resteCommun: number;    // entrée − charges du foyer
  pctPlaisir: number;
  plaisir: number; epargne: number; // le reste commun, partagé
}
export function bilan(postes: Poste[], mois: string): Bilan {
  const zero = (): Deux => ({ moi: 0, elle: 0 });
  const b: Bilan = { mois, revenu: zero(), perso: zero(), virement: zero(), reste: zero(), entree: 0, foyer: 0, parCompte: { commun: 0, facture: 0 }, resteCommun: 0, pctPlaisir: 0, plaisir: 0, epargne: 0 };
  for (const p of postes) {
    const c = parMois(p, mois);
    if (c === null) continue;
    if (p.sorte === "part") b.pctPlaisir = Math.min(100, Math.max(0, c));
    else if (p.sorte === "foyer") { b.foyer += c; b.parCompte[p.compte === "facture" ? "facture" : "commun"] += c; }
    else if (p.qui) b[p.sorte][p.qui] += c;
  }
  for (const q of ["moi", "elle"] as const) b.reste[q] = b.revenu[q] - b.perso[q] - b.virement[q];
  b.entree = b.virement.moi + b.virement.elle;
  b.resteCommun = b.entree - b.foyer;
  // Un reste négatif n'est pas partagé : il n'y a rien à mettre de côté.
  b.plaisir = b.resteCommun > 0 ? Math.round((b.resteCommun * b.pctPlaisir) / 100) : 0;
  b.epargne = b.resteCommun > 0 ? b.resteCommun - b.plaisir : 0;
  return b;
}

// Les virements calculés par Echo : le même total qu'aujourd'hui, réparti selon les salaires. null s'il manque un salaire.
export function proposerVirements(postes: Poste[], mois: string): Deux | null {
  const b = bilan(postes, mois), salaires = b.revenu.moi + b.revenu.elle;
  if (b.revenu.moi <= 0 || b.revenu.elle <= 0 || b.entree <= 0) return null;
  const moi = Math.round((b.entree * b.revenu.moi) / salaires / 100) * 100; // au franc près
  return { moi, elle: b.entree - moi };
}

/* ---------- Changer une valeur sans rien casser ---------- */

export interface Changement { c: number; des: string; une?: boolean; par?: Personne; quand?: number }
// Le poste avec sa nouvelle valeur, ajoutée à la suite : la plus récente gagne, les anciennes restent pour l'historique et le retour en arrière.
export function changer(p: Poste, x: Changement): Poste {
  const dernier = p.valeurs.reduce((m, a) => Math.max(m, a.quand), 0);
  const v: Valeur = { des: x.des, c: x.c, ...(x.une ? { une: true } : {}), quand: Math.max(x.quand ?? Date.now(), dernier + 1), ...(x.par ? { par: x.par } : {}) };
  return { ...p, valeurs: [...p.valeurs, v].slice(-200) };
}
// Une ligne de départ que personne n'a encore remplie (zéro n'est pas « à remplir » une fois que quelqu'un l'a choisi).
export const aRemplir = (p: Poste, mois: string) => p.sorte !== "part" && valeurDe(p, mois) === 0 && p.valeurs.every((v) => !v.par);
// Au moment d'entrer dans un foyer : la ligne de ce téléphone est gardée si celle du foyer est encore vide et que celle-ci est remplie.
export const posteRempli = (p: Poste | null | undefined) => !!p && p.valeurs.some((v) => v.c > 0);
// Ce que ça change : une ligne par total qui bouge, avant → après, pour le mois où le changement prend effet.
export interface Effet { quoi: "reste-moi" | "reste-elle" | "commun" | "plaisir" | "epargne"; avant: number; apres: number }
export function effets(postes: Poste[], id: string, x: Changement): Effet[] {
  const avant = bilan(postes, x.des), apres = bilan(postes.map((p) => (p.id === id ? changer(p, x) : p)), x.des);
  const lignes: Effet[] = [
    { quoi: "reste-moi", avant: avant.reste.moi, apres: apres.reste.moi },
    { quoi: "reste-elle", avant: avant.reste.elle, apres: apres.reste.elle },
    { quoi: "commun", avant: avant.resteCommun, apres: apres.resteCommun },
    { quoi: "plaisir", avant: avant.plaisir, apres: apres.plaisir },
    { quoi: "epargne", avant: avant.epargne, apres: apres.epargne },
  ];
  return lignes.filter((l) => l.avant !== l.apres);
}
// L'historique d'un poste, du plus récent au plus ancien.
export const historique = (p: Poste) => [...p.valeurs].sort((a, b) => b.quand - a.quand || b.des.localeCompare(a.des));

/* ---------- Les dépenses du jour, les catégories, les enveloppes ---------- */

export type Payeur = Personne | "commun";
// rembourse : pour une dépense payée par l'un des deux, le jour où le compte commun la lui a rendue (« Entre nous »).
export interface Depense { id: string; jour: string; c: number; quoi: string; cat: string; qui: Payeur; cree: number; rembourse?: string }
export interface Categorie { id: string; nom: string; cree: number }
// Trois catégories pour commencer (choix de Dany) ; les autres se créent à l'usage et sont gardées pour le foyer.
export const CATS_BASE: Categorie[] = [{ id: "courses", nom: "Courses", cree: 0 }, { id: "plaisir", nom: "Plaisir", cree: 0 }, { id: "divers", nom: "Frais divers", cree: 0 }];
export const cleCategorie = (nom: string) => sansAccents(nom).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
export const toutesCategories = (creees: Categorie[]) => [...CATS_BASE, ...creees.filter((c) => !CATS_BASE.some((b) => b.id === c.id)).sort((a, b) => a.cree - b.cree)];

export function duMois(depenses: Depense[], mois: string): Depense[] {
  const { du, au } = bornes(mois);
  return depenses.filter((d) => d.jour >= du && d.jour <= au).sort((a, b) => b.jour.localeCompare(a.jour) || b.cree - a.cree);
}
export const somme = (ds: Depense[]) => ds.reduce((s, d) => s + d.c, 0);

// Une enveloppe : un budget du mois pour une catégorie, et ce qui en a été dépensé.
export interface Enveloppe { cat: string; nom: string; budget: number; depense: number; reste: number }
// Les enveloppes du mois : chaque charge du foyer liée à une catégorie (Courses, Frais divers), et le plaisir (sa part du reste commun).
export function enveloppes(postes: Poste[], depenses: Depense[], mois: string): Enveloppe[] {
  const ds = duMois(depenses, mois), b = bilan(postes, mois);
  const par = (cat: string) => somme(ds.filter((d) => d.cat === cat));
  const liste: Enveloppe[] = [];
  for (const p of postes) {
    const c = p.sorte === "foyer" && p.cat ? parMois(p, mois) : null;
    if (c === null || liste.some((e) => e.cat === p.cat)) continue;
    liste.push({ cat: p.cat!, nom: p.nom, budget: c, depense: par(p.cat!), reste: c - par(p.cat!) });
  }
  if (!liste.some((e) => e.cat === "plaisir")) liste.push({ cat: "plaisir", nom: "Plaisir", budget: b.plaisir, depense: par("plaisir"), reste: b.plaisir - par("plaisir") });
  return liste;
}

/* ---------- Les tickets de caisse de Cuisine comptent dans les Courses ---------- */

// Ce que le Budget lit d'un ticket gardé par Cuisine (table cuisine_tickets) : il ne copie rien, il compte.
export interface TicketLu { id: string; magasin: string; date: string; total: number; monnaie: string; cree: number }
export const ID_TICKET = "ticket:";
export const estTicket = (d: Pick<Depense, "id">) => d.id.startsWith(ID_TICKET);
// Un ticket en francs avec un total devient une dépense « Courses », payée par le compte commun (on peut dire que c'est quelqu'un d'autre).
export function depenseDuTicket(t: TicketLu): Depense | null {
  const c = Math.round(t.total * 100);
  if (t.monnaie !== "CHF" || !Number.isInteger(c) || c <= 0 || c > MAX || !JOUR_ISO.test(t.date)) return null;
  return { id: ID_TICKET + t.id, jour: t.date, c, quoi: t.magasin || "Ticket de caisse", cat: "courses", qui: "commun", cree: t.cree };
}
// Le premier jour du budget du foyer : rien n'est compté avant (les tickets scannés avant que le Budget existe, par exemple).
export function debutBudget(postes: Poste[]): string | null {
  const premier = postes.flatMap((p) => p.valeurs.map((v) => v.des)).sort()[0];
  return premier ? bornes(premier).du : null;
}
// Toutes les dépenses : celles notées à la main, et une par ticket. Un ticket retouché dans le Budget (qui a payé) a sa ligne à lui, qui passe devant ;
// si le ticket est retiré de Cuisine, sa ligne retouchée ne compte plus. Un ticket n'est pas compté s'il date d'avant le budget (depuis),
// ni si la même course a déjà été notée à la main (même jour, même montant, catégorie Courses).
export function avecTickets(depenses: Depense[], tickets: TicketLu[], depuis: string | null = null): Depense[] {
  const la = new Set(tickets.map((t) => ID_TICKET + t.id)), retouches = new Set(depenses.filter(estTicket).map((d) => d.id));
  const main = new Set(depenses.filter((d) => !estTicket(d) && d.cat === "courses").map((d) => `${d.jour}|${d.c}`));
  const lus = tickets.map(depenseDuTicket).filter((d): d is Depense => !!d && !retouches.has(d.id) && (!depuis || d.jour >= depuis) && !main.has(`${d.jour}|${d.c}`));
  return [...depenses.filter((d) => !estTicket(d) || la.has(d.id)), ...lus];
}

/* ---------- Entre nous : ce que chacun a avancé pour le foyer ---------- */

// Une dépense du foyer payée par l'un des deux avec son argent : le compte commun la lui doit, tant qu'elle n'est pas rendue.
export const avances = (depenses: Depense[], qui: Personne) => depenses.filter((d) => d.qui === qui && !d.rembourse).sort((a, b) => b.jour.localeCompare(a.jour) || b.cree - a.cree);
export const duA = (depenses: Depense[]): Record<Personne, number> => ({ moi: somme(avances(depenses, "moi")), elle: somme(avances(depenses, "elle")) });

/* ---------- Les échéances d'un jour, pour la journée et l'Agenda ---------- */

export interface Echeance { cle: string; titre: string; c: number; retard?: boolean }
// Le jour de l'année (MM-JJ) où tombe une date notée : un 29 février tombe le 28 les années qui n'en ont pas.
const tombeLe = (echeance: string, jour: string) => echeance === jour.slice(5) || (echeance === "02-29" && jour.slice(5) === "02-28" && new Date(Number(jour.slice(0, 4)), 1, 29).getMonth() !== 1);
// Ce qui tombe ce jour-là : les factures à payer (celles en retard aussi, si le jour est aujourd'hui) et les charges à l'année dont la date est notée.
// Une charge à l'année dont la facture est déjà suivie dans « À payer » (même jour, même montant, payée ou non) n'est pas dite deux fois.
export function echeancesDu(jour: string, today: string, apayer: APayer[], postes: Poste[]): Echeance[] {
  const factures = resteAPayer(apayer).filter((l) => l.echeance === jour || (jour === today && l.echeance < today))
    .map((l) => ({ cle: l.id, titre: l.titre, c: l.c, ...(l.echeance < today ? { retard: true } : {}) }));
  const suivies = new Set(apayer.filter((l) => l.echeance === jour).map((l) => l.c));
  const annuelles: Echeance[] = [];
  for (const p of postes) {
    if (p.sorte !== "foyer" || p.rythme !== "an" || !p.echeance || !tombeLe(p.echeance, jour)) continue;
    // Le montant du mois de budget où tombe le jour, sinon celui du mois du calendrier (un poste qui s'arrête au mois de budget suivant).
    const c = valeurDe(p, moisDe(jour)) ?? valeurDe(p, jour.slice(0, 7)) ?? 0;
    if (c > 0 && !suivies.has(c)) annuelles.push({ cle: p.id, titre: p.nom, c });
  }
  return [...factures, ...annuelles];
}

// Le résumé du matin : au plus deux phrases, ce qui tombe le jour raconté, puis ce qui traîne d'avant.
// Les factures venues des Papiers (id « papier:… ») sont déjà dites par la Maison dans le même résumé : on ne les redit pas.
// Le soir (demain), ce qui reste d'avant n'est pas dit « en retard » : il est simplement encore là.
export function matinBudget(apayer: APayer[], postes: Poste[], jour: string, demain = false): string[] {
  const dues = echeancesDu(jour, jour, apayer.filter((l) => !l.id.startsWith("papier:")), postes);
  // seul : « à payer aujourd'hui » ; plusieurs : « choses à payer aujourd'hui ».
  const dire = (liste: Echeance[], seul: string, plusieurs: string) => {
    const total = liste.reduce((s, e) => s + e.c, 0);
    return liste.length === 1 ? `${liste[0].titre} (${chf(total)}) : ${seul}.`
      : `${liste.length} ${plusieurs} (${chf(total)}) : ${liste.slice(0, 3).map((e) => e.titre).join(", ")}${liste.length > 3 ? "…" : ""}.`;
  };
  const duJour = dues.filter((e) => !e.retard), avant = dues.filter((e) => e.retard);
  return [
    duJour.length ? dire(duJour, `à payer ${demain ? "demain" : "aujourd'hui"}`, `choses à payer ${demain ? "demain" : "aujourd'hui"}`) : "",
    avant.length ? dire(avant, demain ? "pas encore payé" : "en retard", demain ? "choses pas encore payées" : "choses en retard") : "",
  ].filter(Boolean);
}

/* ---------- Les comptes : les vrais soldes, notés à la main ---------- */

export type CompteSolde = "epargne" | "facture";
export interface Solde { id: string; compte: CompteSolde; c: number; jour: string; cree: number }
export function dernierSolde(soldes: Solde[], compte: CompteSolde): Solde | null {
  return soldes.filter((s) => s.compte === compte).sort((a, b) => b.jour.localeCompare(a.jour) || b.cree - a.cree)[0] ?? null;
}

/* ---------- À payer : les factures que le module Maison (Papiers) passe au Budget ---------- */

export type Repete = "" | "mois" | "trimestre" | "an";
export const DOSSIERS = ["impots", "logement", "assurances", "sante", "vehicule", "abonnements", "autre"] as const;
export type Dossier = (typeof DOSSIERS)[number];
// papier : l'id du papier côté Maison. paye : false, ou le jour du paiement. compte : qui paie (c'est le Budget qui le fixe).
export interface APayer {
  id: string; titre: string; emetteur: string; c: number; echeance: string; repete: Repete; dossier: Dossier;
  papier?: string; paye: false | string; compte?: Compte | Personne; cree: number;
}
export const resteAPayer = (lignes: APayer[]) => lignes.filter((l) => !l.paye).sort((a, b) => a.echeance.localeCompare(b.echeance));

/* ---------- Le point du mois : ce qui a été dépensé, ce qui reste, ce qui a changé ---------- */

// Tout est recalculé à chaque fois, comme le reste : rien n'est gardé. avant : la même chose le mois d'avant (null : le budget n'existait pas encore).
export interface Point {
  mois: string; fini: boolean; restants: number;
  depense: number; avant: number | null;
  cats: Array<{ cat: string; c: number; avant: number }>; // la plus grosse en tête ; celles du mois d'avant aussi, même à zéro ce mois
  enveloppes: Enveloppe[];
  reste: Deux; resteCommun: number; epargne: number; plaisir: number;
  aPayer: { nombre: number; c: number; retard: number }; // ce qui reste à payer jusqu'à la fin de ce mois (les retards compris)
  payees: number; // les factures payées pendant ce mois
  // Les lignes qui ne sont plus celles du mois d'avant. avant null : une nouvelle ligne ; apres null : une ligne arrêtée.
  changements: Array<{ id: string; nom: string; sorte: Sorte; qui?: Personne; avant: number | null; apres: number | null }>;
  aRendre: Deux;
}
export function pointDuMois(postes: Poste[], depenses: Depense[], apayer: APayer[], mois: string, today: string): Point {
  const { du, au } = bornes(mois), b = bilan(postes, mois), precedent = plusMoisB(mois, -1);
  const debut = debutBudget(postes), existait = !!debut && debut <= bornes(precedent).du;
  const ds = duMois(depenses, mois), dsAvant = existait ? duMois(depenses, precedent) : [];
  const parCat = (liste: Depense[]) => { const m = new Map<string, number>(); for (const d of liste) m.set(d.cat, (m.get(d.cat) ?? 0) + d.c); return m; };
  const ici = parCat(ds), la = parCat(dsAvant);
  const dus = resteAPayer(apayer).filter((l) => l.echeance <= au);
  const changements: Point["changements"] = [];
  for (const p of postes) {
    if (!existait) break; // le premier mois : rien à comparer
    const avant = valeurDe(p, precedent), apres = valeurDe(p, mois);
    // Une ligne posée à zéro (pas encore remplie) n'est pas une nouveauté, et une ligne à zéro qu'on arrête non plus.
    if (avant !== apres && (avant || apres)) changements.push({ id: p.id, nom: p.nom, sorte: p.sorte, ...(p.qui ? { qui: p.qui } : {}), avant, apres });
  }
  return {
    mois, fini: today > au, restants: avancee(mois, today).restants,
    depense: somme(ds), avant: existait ? somme(dsAvant) : null,
    cats: [...new Set([...ici.keys(), ...la.keys()])].map((cat) => ({ cat, c: ici.get(cat) ?? 0, avant: la.get(cat) ?? 0 })).sort((x, y) => y.c - x.c || y.avant - x.avant),
    enveloppes: enveloppes(postes, depenses, mois).filter((e) => e.budget > 0 || e.depense > 0),
    reste: b.reste, resteCommun: b.resteCommun, epargne: b.epargne, plaisir: b.plaisir,
    aPayer: { nombre: dus.length, c: dus.reduce((s, l) => s + l.c, 0), retard: dus.filter((l) => l.echeance < today).length },
    payees: apayer.filter((l) => l.paye && l.paye >= du && l.paye <= au).length,
    changements, aRendre: duA(depenses),
  };
}

/* ---------- Écrire et lire un montant ---------- */

const MAX = 100_000_000; // un million de francs : au-delà, ce n'est pas un montant de foyer
// Un poste « part » garde un pour cent, pas des centimes.
export const ecrire = (p: Pick<Poste, "sorte">, c: number) => (p.sorte === "part" ? `${c} %` : chf(c));

// 200000 → « 2 000 », 983 → « 9.83 » (les centimes seulement quand il y en a).
export function chf(c: number): string {
  const n = Math.abs(Math.round(c)), francs = Math.floor(n / 100), cts = n % 100;
  const milliers = String(francs).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return (c < 0 ? "−" : "") + milliers + (cts ? "." + z(cts) : "");
}
// « 32.50 », « 32,5 », « 1'870 », « 2 000 » → des centimes. null si ce n'est pas un montant.
export function lireMontant(texte: string): number | null {
  const t = texte.replace(/[\s'’  ]/g, "").replace(",", ".").replace(/(chf|fr\.?|francs?)$/i, "");
  if (!/^\d{1,7}(\.\d{0,2})?$/.test(t)) return null;
  const c = Math.round(Number(t) * 100);
  return c <= MAX ? c : null; // le même plafond que pour ce qui arrive du foyer
}

/* ---------- Le premier jour : les lignes de départ, sans montant ---------- */

// Les ids sont fixes : les deux téléphones créent les mêmes lignes, sans doublon.
export interface Modele { id: string; nom: string; sorte: Sorte; qui?: Personne; compte?: Compte; cat?: string; c?: number }
export const DEPART: Modele[] = [
  { id: "revenu-moi", nom: "Salaire", sorte: "revenu", qui: "moi" },
  { id: "revenu-elle", nom: "Salaire", sorte: "revenu", qui: "elle" },
  { id: "virement-moi", nom: "Virement au compte commun", sorte: "virement", qui: "moi" },
  { id: "virement-elle", nom: "Virement au compte commun", sorte: "virement", qui: "elle" },
  { id: "loyer", nom: "Loyer", sorte: "foyer", compte: "commun" },
  { id: "courses", nom: "Courses", sorte: "foyer", compte: "commun", cat: "courses" },
  { id: "divers", nom: "Frais divers", sorte: "foyer", compte: "commun", cat: "divers" },
  { id: PART_PLAISIR, nom: "Part du plaisir", sorte: "part", c: 25 },
];

/* ---------- Ce qui arrive du foyer : on ne garde que les formes attendues ---------- */

const obj = (x: unknown) => (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
const txt = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
const nb = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const personne = (x: unknown): x is Personne => x === "moi" || x === "elle";
const JOUR_ISO = /^\d{4}-\d{2}-\d{2}$/, MOIS_ISO = /^\d{4}-(0[1-9]|1[0-2])$/;
const centimes = (x: unknown) => { const n = nb(x); return n !== null && Number.isInteger(n) && n >= 0 && n <= MAX ? n : null; };
const SORTES: Sorte[] = ["revenu", "perso", "virement", "foyer", "part"];

export function nettoyerPoste(x: unknown): Poste | null {
  const o = obj(x), id = txt(o.id, 80), nom = txt(o.nom, 60).trim(), sorte = SORTES.find((s) => s === o.sorte);
  if (!id || !nom || !sorte || !Array.isArray(o.valeurs)) return null;
  const qui = personne(o.qui) ? o.qui : undefined;
  if ((sorte === "revenu" || sorte === "perso" || sorte === "virement") && !qui) return null;
  const valeurs: Valeur[] = [];
  for (const brut of o.valeurs.slice(-200)) {
    const v = obj(brut), des = txt(v.des, 7), c = centimes(v.c);
    if (!MOIS_ISO.test(des) || c === null) continue;
    valeurs.push({ des, c, ...(v.une === true ? { une: true } : {}), quand: nb(v.quand) ?? 0, ...(personne(v.par) ? { par: v.par } : {}) });
  }
  if (!valeurs.length) return null;
  const fin = txt(o.fin, 7), echeance = txt(o.echeance, 5);
  return {
    id, nom, sorte, ...(qui && sorte !== "foyer" && sorte !== "part" ? { qui } : {}), ...(sorte === "foyer" ? { compte: o.compte === "facture" ? "facture" : "commun" } : {}),
    rythme: o.rythme === "an" ? "an" : "mois", ...(txt(o.groupe, 40).trim() ? { groupe: txt(o.groupe, 40).trim() } : {}), ...(txt(o.cat, 40) ? { cat: txt(o.cat, 40) } : {}),
    ...(txt(o.note, 200) ? { note: txt(o.note, 200) } : {}), ...(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(echeance) ? { echeance } : {}),
    valeurs, ...(MOIS_ISO.test(fin) ? { fin } : {}), cree: nb(o.cree) ?? Date.now(),
  };
}
export function nettoyerDepense(x: unknown): Depense | null {
  const o = obj(x), id = txt(o.id, 80), jour = txt(o.jour, 10), c = centimes(o.c);
  if (!id || !JOUR_ISO.test(jour) || c === null || c === 0) return null;
  const rembourse = txt(o.rembourse, 10);
  return { id, jour, c, quoi: txt(o.quoi, 80).trim(), cat: txt(o.cat, 40) || "divers", qui: personne(o.qui) ? o.qui : "commun", cree: nb(o.cree) ?? Date.now(), ...(personne(o.qui) && JOUR_ISO.test(rembourse) ? { rembourse } : {}) };
}
export function nettoyerCategorie(x: unknown): Categorie | null {
  const o = obj(x), nom = txt(o.nom, 30).trim(), id = txt(o.id, 40);
  if (!nom || !id || id !== cleCategorie(nom)) return null;
  return { id, nom, cree: nb(o.cree) ?? Date.now() };
}
export function nettoyerSolde(x: unknown): Solde | null {
  const o = obj(x), id = txt(o.id, 80), jour = txt(o.jour, 10), c = centimes(o.c);
  if (!id || !JOUR_ISO.test(jour) || c === null || (o.compte !== "epargne" && o.compte !== "facture")) return null;
  return { id, compte: o.compte, c, jour, cree: nb(o.cree) ?? Date.now() };
}
export function nettoyerAPayer(x: unknown): APayer | null {
  const o = obj(x), id = txt(o.id, 80), titre = txt(o.titre, 80).trim(), echeance = txt(o.echeance, 10), c = centimes(o.c), paye = txt(o.paye, 10);
  if (!id || !titre || !JOUR_ISO.test(echeance) || c === null) return null;
  const repete = (["mois", "trimestre", "an"] as const).find((r) => r === o.repete) ?? "";
  const compte = o.compte === "commun" || o.compte === "facture" || personne(o.compte) ? o.compte : undefined;
  return {
    id, titre, emetteur: txt(o.emetteur, 60).trim(), c, echeance, repete, dossier: DOSSIERS.find((d) => d === o.dossier) ?? "autre",
    ...(txt(o.papier, 80) ? { papier: txt(o.papier, 80) } : {}), paye: JOUR_ISO.test(paye) ? paye : false, ...(compte ? { compte } : {}), cree: nb(o.cree) ?? Date.now(),
  };
}
