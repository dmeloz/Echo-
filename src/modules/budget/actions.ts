import { toast } from "sonner";
import { db } from "../../data/db";
import { auJour, nouvelId, sansAccents } from "../../lib/dates";
import type { Personne } from "../../lib/types";
import {
  CATS_BASE, DEPART, avances, changer, chf, cleCategorie, ecrire, estTicket, somme, moisDe, nettoyerAPayer, proposerVirements, valeurDe,
  type APayer, type Categorie, type Changement, type Compte, type CompteSolde, type Depense, type Payeur, type Poste, type Rythme, type Solde, type Sorte,
} from "./donnees";

// Les gestes du module Budget sur ses propres tables. Tout ce qui change montre « Annuler ».

const annuler = (onClick: () => unknown) => ({ action: { label: "Annuler", onClick } });
const propre = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);
const memeNom = (a: string, b: string) => sansAccents(a).trim() === sansAccents(b).trim();

/* ---------- Le premier jour ---------- */

// Pose les lignes de départ qui manquent (sans montant : chacun les remplit en les touchant). Ne touche à rien de ce qui existe.
export async function commencer(now = new Date()): Promise<number> {
  const des = moisDe(auJour(0, now)), quand = now.getTime();
  return db.transaction("rw", db.budget_postes, async () => {
    const la = new Set(await db.budget_postes.toCollection().primaryKeys());
    const nouveaux: Poste[] = DEPART.filter((m) => !la.has(m.id)).map((m, i) => ({
      id: m.id, nom: m.nom, sorte: m.sorte, ...(m.qui ? { qui: m.qui } : {}), ...(m.compte ? { compte: m.compte } : {}), rythme: "mois", ...(m.cat ? { cat: m.cat } : {}),
      valeurs: [{ des, c: m.c ?? 0, quand }], cree: quand + i,
    }));
    await db.budget_postes.bulkAdd(nouveaux);
    return nouveaux.length;
  });
}

/* ---------- Les postes ---------- */

export interface NouveauPoste { nom: string; sorte: Sorte; qui?: Personne; compte?: Compte; rythme?: Rythme; groupe?: string; c: number; des: string; par?: Personne }
// Ajouter une charge (ou un revenu). Le même nom, au même endroit, n'est pas doublé. Rend le poste, ou null.
export async function ajouterPoste(n: NouveauPoste): Promise<Poste | null> {
  const nom = propre(n.nom, 60);
  if (!nom) return null;
  const tous = await db.budget_postes.toArray();
  if (tous.some((p) => p.sorte === n.sorte && p.qui === n.qui && memeNom(p.nom, nom) && valeurDe(p, n.des) !== null)) { toast("C'est déjà dans la liste"); return null; }
  const quand = Date.now();
  const p: Poste = {
    id: nouvelId(), nom: nom[0].toUpperCase() + nom.slice(1), sorte: n.sorte, ...(n.qui && n.sorte !== "foyer" ? { qui: n.qui } : {}), ...(n.sorte === "foyer" ? { compte: n.compte ?? "commun" } : {}),
    rythme: n.rythme ?? "mois", ...(n.groupe ? { groupe: propre(n.groupe, 40) } : {}), valeurs: [{ des: n.des, c: n.c, quand, ...(n.par ? { par: n.par } : {}) }], cree: quand,
  };
  await db.budget_postes.add(p);
  toast(`${p.nom} : ajouté`, annuler(() => db.budget_postes.delete(p.id)));
  return p;
}

// Changer une valeur : une nouvelle ligne datée s'ajoute, les mois d'avant ne bougent pas. « Annuler » remet le poste comme il était.
export async function changerValeur(id: string, x: Changement): Promise<boolean> {
  const avant = await db.budget_postes.get(id);
  if (!avant) return false;
  const apres = changer(avant, x);
  await db.budget_postes.put(apres);
  // On ne remet l'ancien état que si personne n'a rechangé le poste entre-temps.
  toast(`${avant.nom} : ${ecrire(avant, x.c)}`, annuler(async () => {
    const la = await db.budget_postes.get(id);
    if (la && JSON.stringify(la.valeurs) === JSON.stringify(apres.valeurs)) await db.budget_postes.put({ ...la, valeurs: avant.valeurs });
  }));
  return true;
}
// Revenir en arrière : retire la dernière valeur posée (il en reste toujours une).
export async function retirerDerniereValeur(id: string): Promise<boolean> {
  const p = await db.budget_postes.get(id);
  if (!p || p.valeurs.length < 2) return false;
  const derniere = p.valeurs.reduce((a, b) => (b.quand >= a.quand ? b : a));
  const reste = p.valeurs.filter((v) => v !== derniere);
  // Il doit rester une valeur durable, sinon le poste disparaîtrait de tous les mois.
  if (!reste.some((v) => !v.une)) return false;
  await db.budget_postes.put({ ...p, valeurs: reste });
  toast(`${p.nom} : revenu à la valeur d'avant`, annuler(() => db.budget_postes.put(p)));
  return true;
}
// Le virement de chacun, recalculé selon les salaires (même total). Posé comme n'importe quel changement, donc corrigible à la main ensuite.
export async function recalculerVirements(mois: string, par?: Personne): Promise<boolean> {
  const postes = await db.budget_postes.toArray();
  const v = proposerVirements(postes, mois);
  const cibles = (["moi", "elle"] as const).map((q) => postes.find((p) => p.sorte === "virement" && p.qui === q && valeurDe(p, mois) !== null));
  if (!v || !cibles[0] || !cibles[1]) return false;
  const quand = Date.now();
  await db.budget_postes.bulkPut([changer(cibles[0], { c: v.moi, des: mois, par, quand }), changer(cibles[1], { c: v.elle, des: mois, par, quand })]);
  toast("Virements recalculés selon les salaires", annuler(() => db.budget_postes.bulkPut([cibles[0]!, cibles[1]!])));
  return true;
}
export const changerPoste = (id: string, x: Partial<Pick<Poste, "nom" | "compte" | "note" | "echeance" | "groupe">>) => db.budget_postes.update(id, x);
// Arrêter un poste à partir d'un mois : il reste dans les mois d'avant.
export async function arreterPoste(p: Poste, mois: string) {
  await db.budget_postes.update(p.id, { fin: mois });
  toast(`${p.nom} : arrêté`, annuler(() => db.budget_postes.update(p.id, { fin: p.fin })));
}

/* ---------- Les dépenses et les catégories ---------- */

export interface NouvelleDepense { c: number; quoi: string; cat: string; qui: Payeur; jour?: string }
export async function ajouterDepense(n: NouvelleDepense, now = new Date()): Promise<Depense | null> {
  if (!Number.isInteger(n.c) || n.c <= 0) return null;
  const d: Depense = { id: nouvelId(), jour: n.jour ?? auJour(0, now), c: n.c, quoi: propre(n.quoi, 80), cat: n.cat || "divers", qui: n.qui, cree: Date.now() };
  await db.budget_depenses.add(d);
  toast(`${d.quoi || "Dépense"} : ${chf(d.c)} CHF`, annuler(() => db.budget_depenses.delete(d.id)));
  return d;
}
export async function retirerDepense(d: Depense) {
  await db.budget_depenses.delete(d.id);
  toast(`${d.quoi || "Dépense"} : retiré`, annuler(() => db.budget_depenses.put(d)));
}
// Un ticket de caisse est compté pour le compte commun ; dire que c'est l'un des deux qui a payé garde une ligne à part pour ce ticket.
const pareille = (a: Depense | undefined, b: Depense) => !!a && a.qui === b.qui && a.c === b.c && a.rembourse === b.rembourse;
export async function payeurDuTicket(d: Depense, qui: Payeur) {
  if (!estTicket(d) || d.qui === qui) return; // le même payeur : rien ne change (un remboursement déjà noté reste noté)
  const avant = await db.budget_depenses.get(d.id);
  const apres: Depense = { id: d.id, jour: d.jour, c: d.c, quoi: d.quoi, cat: d.cat, qui, cree: d.cree };
  await db.budget_depenses.put(apres);
  // « Annuler » ne remet l'état d'avant que si la ligne n'a pas rechangé entre-temps.
  toast(qui === "commun" ? `${d.quoi} : payé par le compte commun` : `${d.quoi} : noté dans Entre nous`, annuler(async () => {
    if (!pareille(await db.budget_depenses.get(d.id), apres)) return;
    await (avant ? db.budget_depenses.put(avant) : db.budget_depenses.delete(d.id));
  }));
}
// Entre nous : le compte commun a rendu à quelqu'un tout ce qu'il avait avancé. Les lignes venues d'un ticket sont gardées avec leur date de remboursement.
export async function rembourser(qui: Personne, toutes: Depense[], now = new Date()): Promise<number> {
  const dues = avances(toutes, qui), jour = auJour(0, now);
  if (!dues.length) return 0;
  const avant = await db.budget_depenses.bulkGet(dues.map((d) => d.id));
  const rendues = dues.map((d) => ({ ...d, rembourse: jour }));
  await db.budget_depenses.bulkPut(rendues);
  // « Annuler » ne touche qu'aux lignes restées telles que ce geste les a laissées.
  toast(`${chf(somme(dues))} CHF rendus`, annuler(() => db.transaction("rw", db.budget_depenses, async () => {
    for (const [i, d] of rendues.entries()) {
      if (!pareille(await db.budget_depenses.get(d.id), d)) continue;
      if (avant[i]) await db.budget_depenses.put(avant[i]!); else await db.budget_depenses.delete(d.id);
    }
  })));
  return dues.length;
}
// Créer une catégorie : elle est gardée pour le foyer. Une catégorie qui existe déjà est simplement rendue.
export async function ajouterCategorie(nom: string): Promise<Categorie | null> {
  const n = propre(nom, 30), id = cleCategorie(n);
  if (!n || !id) return null;
  const base = CATS_BASE.find((c) => c.id === id);
  if (base) return base;
  const la = await db.budget_categories.get(id);
  if (la) return la;
  const c: Categorie = { id, nom: n[0].toUpperCase() + n.slice(1), cree: Date.now() };
  await db.budget_categories.add(c);
  return c;
}

/* ---------- Les soldes notés ---------- */

export async function noterSolde(compte: CompteSolde, c: number, now = new Date()): Promise<Solde> {
  const s: Solde = { id: nouvelId(), compte, c, jour: auJour(0, now), cree: Date.now() };
  await db.budget_soldes.add(s);
  toast(`Solde noté : ${chf(c)} CHF`, annuler(() => db.budget_soldes.delete(s.id)));
  return s;
}

/* ---------- À payer : la porte d'entrée pour le module Maison (Papiers) ---------- */

// Maison garde le papier ; dès qu'il y a un montant à payer, il le passe ici. Le même id deux fois ne crée pas de doublon :
// la ligne est mise à jour, sans défaire un paiement déjà noté. Rend la ligne gardée, ou null si elle n'a pas la bonne forme.
// Le montant s'appelle « montant » dans la forme convenue avec Maison (des centimes entiers) ; « c » est accepté aussi.
export type LigneAPayer = Omit<APayer, "cree" | "paye" | "c"> & { c?: number; montant?: number; paye?: false | string };
export async function ajouterAPayer(ligne: LigneAPayer): Promise<APayer | null> {
  const propreLigne = nettoyerAPayer({ ...ligne, c: ligne.c ?? ligne.montant, paye: ligne.paye ?? false, cree: Date.now() });
  if (!propreLigne) return null;
  return db.transaction("rw", db.budget_apayer, async () => {
    const la = await db.budget_apayer.get(propreLigne.id);
    const garde: APayer = la ? { ...propreLigne, paye: la.paye || propreLigne.paye, compte: propreLigne.compte ?? la.compte, cree: la.cree } : propreLigne;
    await db.budget_apayer.put(garde);
    return garde;
  });
}
// Cocher une facture depuis l'écran : payée aujourd'hui, avec « Annuler ».
export async function payer(l: APayer, now = new Date()) {
  await marquerPaye(l.id, auJour(0, now));
  toast(`${l.titre} : payé`, annuler(() => marquerPaye(l.id, false)));
}
// Payé (avec son jour), ou plus payé.
export const marquerPaye = (id: string, jour: string | false = auJour(0)) => db.budget_apayer.update(id, { paye: jour });
// Pour arrêter un rappel côté Maison : false, ou le jour du paiement. Une ligne inconnue n'est pas payée.
export const estPaye = async (id: string): Promise<false | string> => (await db.budget_apayer.get(id))?.paye || false;
export const retirerAPayer = (id: string) => db.budget_apayer.delete(id);
