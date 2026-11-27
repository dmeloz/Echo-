import { db } from "../../data/db";
import { auJour, plusJours } from "../../lib/dates";
import type { Action, ContexteEcho, Executant } from "../../lib/echo/outils";
import type { Personne } from "../../lib/types";
import { ajouterDepense } from "./actions";
import {
  avecTickets, avancee, bilan, chf, cleCategorie, debutBudget, dernierSolde, duA, duMois, enveloppes, jourLong, moisDe, nomMois, periode, plusMoisB, pointDuMois, posteRempli, resteAPayer, toutesCategories,
  type Categorie, type Payeur,
} from "./donnees";

// Ce que l'assistant Echo peut faire dans le Budget (décrit dans supabase/functions/_shared/echo-outils.ts).
// Il lit, et il note une dépense déjà faite. Il ne paie rien, ne coche aucune facture et ne change aucune charge : cela reste aux deux personnes.
const court = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");
const JOUR = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const fr = (c: number) => `${chf(c).replace(/\s/g, " ")} CHF`; // des espaces simples pour le modèle
const PAS_COMMENCE = "Le budget du foyer n'est pas encore commencé : il faut ouvrir Budget et toucher « Commencer », puis remplir les montants.";
const DEUX: Personne[] = ["moi", "elle"];

async function tout() {
  const postes = await db.budget_postes.toArray();
  const depenses = avecTickets(await db.budget_depenses.toArray(), await db.cuisine_tickets.toArray(), debutBudget(postes));
  return { postes, depenses, categories: toutesCategories(await db.budget_categories.toArray() as Categorie[]), apayer: await db.budget_apayer.toArray(), soldes: await db.budget_soldes.toArray() };
}
const parPersonne = (ctx: ContexteEcho, x: Record<Personne, number>) => Object.fromEntries(DEUX.map((q) => [ctx.noms[q], fr(x[q])]));

async function voirBudget(_e: Record<string, unknown>, ctx: ContexteEcho) {
  const { postes, depenses, categories, apayer, soldes } = await tout();
  if (!postes.some(posteRempli)) return { erreur: PAS_COMMENCE };
  const today = auJour(0, ctx.now), mois = moisDe(today), b = bilan(postes, mois), du = duA(depenses);
  const cats = new Map(categories.map((c) => [c.id, c.nom]));
  const solde = (compte: "epargne" | "facture") => { const s = dernierSolde(soldes, compte); return s ? `${fr(s.c)} (noté le ${jourLong(s.jour)})` : "pas noté"; };
  return {
    mois: `${nomMois(mois)} (${periode(mois)})`, joursQuiRestent: avancee(mois, today).restants,
    resteAChacun: parPersonne(ctx, b.reste),
    compteCommun: { verse: fr(b.entree), chargesDuFoyer: fr(b.foyer), reste: fr(b.resteCommun), pourLEpargne: fr(b.epargne), pourLePlaisir: fr(b.plaisir) },
    enveloppes: enveloppes(postes, depenses, mois).filter((e) => e.budget > 0 || e.depense > 0).map((e) => ({ nom: e.nom, budget: fr(e.budget), depense: fr(e.depense), ...(e.reste < 0 ? { depasseDe: fr(-e.reste) } : { reste: fr(e.reste) }) })),
    aPayer: resteAPayer(apayer).slice(0, 30).map((l) => ({ titre: l.titre, montant: fr(l.c), pourLe: l.echeance, ...(l.echeance < today ? { enRetard: true } : {}) })),
    ...(du.moi + du.elle > 0 ? { leCompteCommunDoit: Object.fromEntries(DEUX.filter((q) => du[q] > 0).map((q) => [ctx.noms[q], fr(du[q])])) } : {}),
    comptes: { epargne: solde("epargne"), facture: solde("facture") },
    categories: categories.map((c) => c.nom),
    dernieresDepenses: duMois(depenses, mois).slice(0, 12).map((d) => ({ jour: d.jour, quoi: d.quoi || cats.get(d.cat) || "Dépense", montant: fr(d.c), categorie: cats.get(d.cat) ?? d.cat, payePar: d.qui === "commun" ? "compte commun" : ctx.noms[d.qui] })),
  };
}

async function point(e: Record<string, unknown>, ctx: ContexteEcho) {
  const { postes, depenses, categories, apayer } = await tout();
  if (!postes.some(posteRempli)) return { erreur: PAS_COMMENCE };
  const today = auJour(0, ctx.now), mois = plusMoisB(moisDe(today), e.mois === "mois_precedent" ? -1 : 0);
  const debut = debutBudget(postes);
  if (debut && moisDe(debut) > mois) return { erreur: `Le budget du foyer commence en ${nomMois(moisDe(debut)).toLowerCase()} : il n'y a rien avant.` };
  const p = pointDuMois(postes, depenses, apayer, mois, today), cats = new Map(categories.map((c) => [c.id, c.nom]));
  const unite = (sorte: string, c: number) => (sorte === "part" ? `${c} %` : fr(c));
  return {
    mois: `${nomMois(mois)} (${periode(mois)})`, ...(p.fini ? { termine: true } : { joursQuiRestent: p.restants }),
    depenseEnTout: fr(p.depense), ...(p.avant !== null ? { leMoisDAvant: fr(p.avant) } : {}),
    parCategorie: p.cats.map((c) => ({ categorie: cats.get(c.cat) ?? c.cat, depense: fr(c.c), ...(p.avant !== null ? { leMoisDAvant: fr(c.avant) } : {}) })),
    enveloppes: p.enveloppes.map((x) => ({ nom: x.nom, budget: fr(x.budget), depense: fr(x.depense), ...(x.reste < 0 ? { depasseDe: fr(-x.reste) } : { reste: fr(x.reste) }) })),
    resteAChacun: parPersonne(ctx, p.reste),
    resteDuCommun: fr(p.resteCommun), pourLEpargne: fr(p.epargne), pourLePlaisir: fr(p.plaisir),
    facturesEncoreAPayer: p.aPayer.nombre ? { nombre: p.aPayer.nombre, total: fr(p.aPayer.c), ...(p.aPayer.retard ? { enRetard: p.aPayer.retard } : {}) } : "aucune",
    facturesPayeesCeMois: p.payees,
    ...(p.changements.length ? { montantsChanges: p.changements.map((c) => ({ ligne: c.nom, avant: unite(c.sorte, c.avant), maintenant: unite(c.sorte, c.apres) })) } : {}),
    ...(p.aRendre.moi + p.aRendre.elle > 0 ? { leCompteCommunDoit: Object.fromEntries(DEUX.filter((q) => p.aRendre[q] > 0).map((q) => [ctx.noms[q], fr(p.aRendre[q])])) } : {}),
  };
}

async function noterDepense(e: Record<string, unknown>, ctx: ContexteEcho): Promise<Action | string> {
  const { postes, depenses, categories } = await tout();
  if (!postes.length) return PAS_COMMENCE;
  const francs = Number(e.montantFrancs), c = Math.round(francs * 100);
  if (!Number.isFinite(francs) || c <= 0 || c > 10_000_000) return "Donne le montant en francs (montantFrancs), plus grand que zéro.";
  const quoi = court(e.quoi, 80);
  const dite = court(e.categorie, 40), cat = categories.find((x) => x.id === cleCategorie(dite));
  if (!cat) return `Pas de catégorie « ${dite} ». Celles du foyer : ${categories.map((x) => x.nom).join(", ")}. Une nouvelle catégorie se crée dans Budget, avec le bouton « Dépense ».`;
  const qui: Payeur = e.payePar === "moi" || e.payePar === "elle" ? e.payePar : "commun";
  const today = auJour(0, ctx.now), jour = String(e.jour || today);
  if (!JOUR.test(jour) || jour > today || jour < plusJours(today, -62)) return "jour : une date AAAA-MM-JJ, aujourd'hui ou dans les deux derniers mois (\"\" pour aujourd'hui).";
  // La même dépense déjà notée (à la main, ou par un ticket de caisse de Cuisine) n'est pas comptée deux fois.
  if (depenses.some((d) => d.jour === jour && d.c === c && d.cat === cat.id)) return `Une dépense de ${fr(c)} en ${cat.nom} est déjà notée pour le ${jourLong(jour)} (peut-être par un ticket de caisse). Demande avant de la noter une deuxième fois.`;
  return {
    outil: "ajouter_depense", genre: "petit", libelle: `Dépense : ${quoi || cat.nom}, ${fr(c)}`,
    details: [cat.nom, qui === "commun" ? "compte commun" : `payé par ${ctx.noms[qui]}`, ...(jour !== today ? [jourLong(jour)] : [])],
    faire: async () => {
      const d = await ajouterDepense({ c, quoi, cat: cat.id, qui, jour }, ctx.now, true);
      if (!d) throw new Error("Dépense refusée");
      return () => db.budget_depenses.delete(d.id);
    },
  };
}

export const OUTILS_BUDGET: Record<string, Executant> = {
  voir_budget: { lire: voirBudget },
  point_du_mois: { lire: point },
  ajouter_depense: { preparer: noterDepense },
};
