import { db } from "../../data/db";
import { auJour, iso, plusJours } from "../../lib/dates";
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
// Les prénoms pour Echo. Deux prénoms pareils ou un prénom vide : on les distingue, sinon un montant écraserait l'autre.
function prenoms(ctx: ContexteEcho): Record<Personne, string> {
  const n = { moi: ctx.noms.moi.trim(), elle: ctx.noms.elle.trim() };
  if (n.moi && n.elle && n.moi.toLowerCase() !== n.elle.toLowerCase()) return n;
  const dit = (q: Personne) => `${n[q] || "Personne"} (${q === ctx.proprio ? "qui écrit" : "l'autre"})`;
  return { moi: dit("moi"), elle: dit("elle") };
}
const parPersonne = (ctx: ContexteEcho, x: Record<Personne, number>, seulementDu = false) => Object.fromEntries(DEUX.filter((q) => !seulementDu || x[q] > 0).map((q) => [prenoms(ctx)[q], fr(x[q])]));

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
    ...(du.moi + du.elle > 0 ? { leCompteCommunDoit: parPersonne(ctx, du, true) } : {}),
    comptes: { epargne: solde("epargne"), facture: solde("facture") },
    categories: categories.map((c) => c.nom),
    dernieresDepenses: duMois(depenses, mois).slice(0, 12).map((d) => ({ jour: d.jour, quoi: d.quoi || cats.get(d.cat) || "Dépense", montant: fr(d.c), categorie: cats.get(d.cat) ?? d.cat, payePar: d.qui === "commun" ? "compte commun" : prenoms(ctx)[d.qui] })),
  };
}

async function point(e: Record<string, unknown>, ctx: ContexteEcho) {
  const { postes, depenses, categories, apayer } = await tout();
  if (!postes.some(posteRempli)) return { erreur: PAS_COMMENCE };
  const today = auJour(0, ctx.now), mois = plusMoisB(moisDe(today), e.mois === "mois_precedent" ? -1 : 0);
  const debut = debutBudget(postes);
  if (debut && moisDe(debut) > mois) return { erreur: `Le budget du foyer commence en ${nomMois(moisDe(debut)).toLowerCase()} : il n'y a rien avant.` };
  const p = pointDuMois(postes, depenses, apayer, mois, today), cats = new Map(categories.map((c) => [c.id, c.nom]));
  const unite = (sorte: string, c: number | null) => (c === null ? "rien" : sorte === "part" ? `${c} %` : fr(c));
  // Tant que le mois n'est pas fini, le mois d'avant est un mois entier : on le dit, pour qu'Echo ne compare pas l'un à l'autre.
  const avant = p.fini ? "leMoisDAvant" : "leMoisDAvantEnEntier";
  return {
    mois: `${nomMois(mois)} (${periode(mois)})`, ...(p.fini ? { termine: true } : { joursQuiRestent: p.restants }),
    [p.fini ? "depenseEnTout" : "depenseJusquIci"]: fr(p.depense), ...(p.avant !== null ? { [avant]: fr(p.avant) } : {}),
    parCategorie: p.cats.map((c) => ({ categorie: cats.get(c.cat) ?? c.cat, depense: fr(c.c), ...(p.avant !== null ? { [avant]: fr(c.avant) } : {}) })),
    enveloppes: p.enveloppes.map((x) => ({ nom: x.nom, budget: fr(x.budget), depense: fr(x.depense), ...(x.reste < 0 ? { depasseDe: fr(-x.reste) } : { reste: fr(x.reste) }) })),
    resteAChacun: parPersonne(ctx, p.reste),
    resteDuCommun: fr(p.resteCommun), pourLEpargne: fr(p.epargne), pourLePlaisir: fr(p.plaisir),
    facturesEncoreAPayer: p.aPayer.nombre ? { nombre: p.aPayer.nombre, total: fr(p.aPayer.c), ...(p.aPayer.retard ? { enRetard: p.aPayer.retard } : {}) } : "aucune",
    facturesPayeesCeMois: p.payees,
    ...(p.changements.length ? { lignesChangees: p.changements.map((c) => ({ ligne: c.nom, ...(c.qui ? { deQui: prenoms(ctx)[c.qui] } : {}), ...(c.avant === null ? { nouvelle: true } : { avant: unite(c.sorte, c.avant) }), ...(c.apres === null ? { arretee: true } : { maintenant: unite(c.sorte, c.apres) }) })) } : {}),
    ...(p.aRendre.moi + p.aRendre.elle > 0 ? { leCompteCommunDoit: parPersonne(ctx, p.aRendre, true) } : {}),
  };
}

async function noterDepense(e: Record<string, unknown>, ctx: ContexteEcho): Promise<Action | string> {
  const { postes, depenses, categories } = await tout();
  if (!postes.length) return PAS_COMMENCE;
  const francs = Number(e.montantFrancs), c = Math.round(francs * 100);
  if (!Number.isFinite(francs) || c <= 0) return "Donne le montant en francs (montantFrancs), plus grand que zéro.";
  if (c > 10_000_000) return "Montant trop grand pour une dépense du jour (100 000 francs au plus). Vérifie qu'il est bien en francs, pas en centimes.";
  const quoi = court(e.quoi, 80);
  const dite = court(e.categorie, 40), cle = cleCategorie(dite), cat = categories.find((x) => x.id === cle || cleCategorie(x.nom) === cle);
  if (!cat) return `Pas de catégorie « ${dite} ». Celles du foyer : ${categories.map((x) => x.nom).join(", ")}. Une nouvelle catégorie se crée dans Budget, avec le bouton « Dépense ».`;
  const qui: Payeur = e.payePar === "moi" || e.payePar === "elle" ? e.payePar : "commun";
  const today = auJour(0, ctx.now), jour = String(e.jour || today);
  if (!JOUR.test(jour) || iso(new Date(jour + "T12:00:00")) !== jour || jour > today || jour < plusJours(today, -62)) return "jour : une date AAAA-MM-JJ, aujourd'hui ou dans les deux derniers mois (\"\" pour aujourd'hui).";
  // La même dépense déjà notée (à la main, ou par un ticket de caisse de Cuisine) n'est pas comptée deux fois.
  if (e.memeSiDejaNotee !== true && depenses.some((d) => d.jour === jour && d.c === c && d.cat === cat.id)) return `Une dépense de ${fr(c)} en ${cat.nom} est déjà notée pour le ${jourLong(jour)} (peut-être par un ticket de caisse). Demande à la personne ; si elle confirme que c'est une autre dépense, rappelle l'outil avec memeSiDejaNotee true.`;
  return {
    outil: "ajouter_depense", genre: "petit", libelle: `Dépense : ${quoi || cat.nom}, ${fr(c)}`,
    details: [cat.nom, qui === "commun" ? "compte commun" : `payé par ${prenoms(ctx)[qui]}`, ...(jour !== today ? [jourLong(jour)] : [])],
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
