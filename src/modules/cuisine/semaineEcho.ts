import { toast } from "sonner";
import { db } from "../../data/db";
import { auJour, plusJours } from "../../lib/dates";
import { CODES, type Horaire } from "../../lib/horaires";
import type { Noms, Personne } from "../../lib/types";
import { entetesIA } from "../../sync/client";
import { retirerCoursesDe } from "./actions";
import { besoins, boites, cleDe, manquants, nettoyerBatch, nettoyerRepas, nouvelArticle, type Article, type Batch, type Besoin, type Recette, type Repas, type Travail } from "./donnees";

// La semaine proposée par Echo : la demande part vers la fonction « cuisine » du projet Supabase (Claude Haiku 5.5).
// Echo propose, on change un plat ou on valide : rien ne va aux courses avant « Valider ».

const ADRESSE = "https://ewqvgayhptfwbpkxsaij.supabase.co/functions/v1/cuisine";
const MESSAGES: Record<string, string> = {
  code: "Echo ne te reconnaît pas. Relie ce téléphone au foyer dans Réglages → Foyer.",
  limite: "Echo a beaucoup servi cette dernière heure. Réessaie un peu plus tard.",
  cle: "Echo n'est pas encore branché : la clé de l'IA manque côté serveur.",
  refus: "Echo n'a pas pu préparer cette semaine.",
  occupe: "Echo est très demandé. Réessaie dans une minute.",
  lecture: "Echo s'est emmêlé. Réessaie.",
  requete: "Rien à prévoir pour ce jour : personne ne mange à la maison.",
  service: "Echo ne répond pas pour l'instant.",
};
export class ErreurSemaine extends Error {}

export const versTravail = (horaires: Horaire[]): Travail[] =>
  horaires.filter((h) => h.code in CODES).map((h) => ({ qui: h.qui, jour: h.jour, plages: CODES[h.code].plages, fixe: h.code === "FIX" }));

// Ce qu'on envoie à Echo : les jours à prévoir, les goûts, le stock, et ce qu'il ne faut pas reproposer.
const ORDRE = ["frigo", "congelateur", "placard"];
export async function preparerDemande(aPrevoir: Besoin[], noms: Noms, semaine: string[], eviter: string[] = [], now = new Date()) {
  const [gouts, stock, repas, livre] = await Promise.all([db.cuisine_gouts.toArray(), db.cuisine_stock.toArray(), db.cuisine_repas.toArray(), db.cuisine_recettes.toArray()]);
  const demandes = new Set(aPrevoir.map((b) => b.jour));
  const valides = repas.filter((r) => !r.propose || !demandes.has(r.jour));
  const mangeur = aPrevoir.find((b) => b.gamelle)?.gamelle;
  return {
    jours: aPrevoir.map((b) => ({ jour: b.jour, soir: b.soir, gamelle: !!b.gamelle })),
    gamellePour: mangeur ? noms[mangeur] : "",
    gouts: gouts.map((g) => ({ prenom: noms[g.qui], aime: g.aime, evite: g.evite, rechauffe: g.rechauffe })),
    // Ce qu'il y a à manger à la maison, le frigo d'abord (ce qui presse en tête) : Echo part de là.
    stock: stock.filter((p) => p.lieu !== "maison" && p.reste !== "peu" && !p.repas)
      .sort((a, b) => ORDRE.indexOf(a.lieu) - ORDRE.indexOf(b.lieu) || (a.avant ?? "9").localeCompare(b.avant ?? "9"))
      .slice(0, 60).map((p) => ({ nom: p.nom.replace(/\s+/g, " ").trim(), avant: p.avant ?? "", lieu: p.lieu, moitie: p.reste === "moitie" })),
    aujourdhui: auJour(0, now),
    // On cuisine le dimanche d'avant la semaine ; si ce dimanche est passé, aujourd'hui.
    cuisine: plusJours(semaine[0], -1) > auJour(0, now) ? plusJours(semaine[0], -1) : auJour(0, now),
    gardes: valides.filter((r) => semaine.includes(r.jour) && !demandes.has(r.jour)).map((r) => ({ jour: r.jour, plat: r.plat })),
    recents: valides.filter((r) => r.jour >= plusJours(semaine[0], -14) && r.jour < semaine[0]).map((r) => r.plat).slice(-20),
    // Le livre de recettes : ce qu'on a aimé (les plus récents d'abord), et ce qu'on ne veut plus voir.
    aimes: livre.filter((x) => x.avis === 1).sort((a, b) => b.maj - a.maj).slice(0, 20).map((x) => x.plat),
    eviter: [...new Set([...eviter, ...livre.filter((x) => x.avis === -1).sort((a, b) => b.maj - a.maj).map((x) => x.plat)])].slice(0, 20),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function appeler(corps: unknown): Promise<any> {
  if (!navigator.onLine) throw new ErreurSemaine("Pas de connexion internet. Echo a besoin du réseau.");
  const code = String((await db.reglages.get("codeEcho"))?.valeur ?? "").trim();
  let r: Response;
  try {
    r = await fetch(ADRESSE, { method: "POST", headers: await entetesIA(code), body: JSON.stringify(corps), signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new ErreurSemaine("Pas de connexion avec Echo.");
  }
  const lu = await r.json().catch(() => null);
  if (!r.ok || !lu) throw new ErreurSemaine(MESSAGES[lu?.erreur] ?? MESSAGES.service);
  return lu;
}
async function demander(corps: unknown): Promise<{ repas: Repas[]; reponse: string }> {
  const lu = await appeler(corps);
  if (!Array.isArray(lu.repas)) throw new ErreurSemaine(MESSAGES.service);
  const repas = (lu.repas as unknown[]).map((x) => nettoyerRepas(x)).filter((x): x is Repas => !!x);
  if (!repas.length) throw new ErreurSemaine(MESSAGES.lecture);
  return { repas, reponse: typeof lu.reponse === "string" ? lu.reponse : "" };
}

// « Prévoir ma semaine » : Echo remplit les jours donnés. Ses repas restent une proposition jusqu'à « Valider ».
// La réponse peut mettre une minute : on n'écrit que les jours restés vides entre-temps.
export async function proposerSemaine(aPrevoir: Besoin[], noms: Noms, semaine: string[]) {
  const { repas, reponse } = await demander(await preparerDemande(aPrevoir, noms, semaine));
  const demandes = new Set(aPrevoir.map((b) => b.jour));
  await db.transaction("rw", db.cuisine_repas, async () => {
    for (const r of repas) if (demandes.has(r.jour) && !(await db.cuisine_repas.get(r.jour))) await db.cuisine_repas.put({ ...r, propose: true });
  });
  return reponse;
}

// Mettre aux courses ce qu'il manque pour des repas. Un produit déjà dans la liste n'est pas touché (ni sa quantité, ni sa case).
// Renvoie les articles créés, pour pouvoir annuler exactement ceux-là.
export async function versCourses(repas: Repas[]): Promise<Article[]> {
  let crees: Article[] = [];
  await db.transaction("rw", db.cuisine_courses, db.cuisine_habitudes, db.cuisine_stock, db.reglages, async () => {
    const par = ((await db.reglages.get("proprio"))?.valeur as Personne | undefined) ?? "moi";
    const habitudes = await db.cuisine_habitudes.toArray();
    const presents = new Set((await db.cuisine_courses.toArray()).map((a) => cleDe(a.nom)));
    crees = manquants(repas, (await db.cuisine_stock.toArray()).filter((p) => p.reste !== "peu")).filter((m) => !presents.has(cleDe(m.nom)))
      .map((m, i) => ({ ...nouvelArticle(m, par, habitudes, i), pour: m.jours }));
    await db.cuisine_courses.bulkAdd(crees);
  });
  return crees;
}
const dire = (n: number) => `${n} article${n > 1 ? "s" : ""} ajouté${n > 1 ? "s" : ""} aux courses`;

// « Changer » : un autre plat pour ce jour, sans reproposer celui-ci ni ceux de la semaine.
// Si le jour a changé pendant l'attente (écrit à la main, retiré), la réponse d'Echo est laissée de côté.
export async function changerRepas(b: Besoin, actuel: Repas, noms: Noms, semaine: string[]) {
  const autres = (await db.cuisine_repas.where("jour").anyOf(semaine).toArray()).map((r) => r.plat);
  const { repas } = await demander(await preparerDemande([b], noms, semaine, [...new Set([actuel.plat, ...autres])]));
  const nouveau = repas.find((r) => r.jour === b.jour);
  if (!nouveau) throw new ErreurSemaine(MESSAGES.lecture);
  let anciens: Article[] = [], ecrit = false;
  await db.transaction("rw", db.cuisine_repas, db.cuisine_courses, async () => {
    const la = await db.cuisine_repas.get(b.jour);
    if (!la || la.plat !== actuel.plat || !!la.propose !== !!actuel.propose) return;
    await db.cuisine_repas.put({ ...nouveau, ...(actuel.propose ? { propose: true } : {}) });
    if (!actuel.propose) anciens = await retirerCoursesDe(b.jour);
    ecrit = true;
  });
  if (!ecrit || actuel.propose) return;
  // Un plat déjà validé qui change : ses courses suivent, et on le dit.
  const crees = await versCourses([nouveau]);
  toast(crees.length ? `Plat changé. ${dire(crees.length)}.` : "Plat changé, courses mises à jour.", { duration: 6000, action: { label: "Annuler", onClick: () => db.transaction("rw", db.cuisine_repas, db.cuisine_courses, async () => {
    await db.cuisine_repas.put(actuel);
    await db.cuisine_courses.bulkDelete(crees.map((a) => a.id));
    await db.cuisine_courses.bulkPut(anciens);
  }) } });
}

// « Valider » : la proposition devient la semaine, et ce qu'il manque part dans les courses. Annuler remet tout comme avant.
export async function validerSemaine(semaine: string[]) {
  const proposes = (await db.cuisine_repas.where("jour").anyOf(semaine).toArray()).filter((r) => r.propose);
  if (!proposes.length) return;
  await db.cuisine_repas.bulkPut(proposes.map(({ propose: _p, ...r }) => r));
  const crees = await versCourses(proposes);
  toast(crees.length ? `Semaine validée. ${dire(crees.length)}.` : "Semaine validée. Rien à acheter en plus.", {
    duration: 6000,
    action: { label: "Annuler", onClick: () => db.transaction("rw", db.cuisine_repas, db.cuisine_courses, async () => {
      await db.cuisine_repas.bulkPut(proposes);
      await db.cuisine_courses.bulkDelete(crees.map((a) => a.id));
    }) },
  });
}

// Refuser la proposition : les jours proposés redeviennent vides (avec Annuler).
export async function refuserProposition(semaine: string[]) {
  const proposes = (await db.cuisine_repas.where("jour").anyOf(semaine).toArray()).filter((r) => r.propose);
  if (!proposes.length) return;
  await db.cuisine_repas.bulkDelete(proposes.map((r) => r.jour));
  toast("Proposition retirée", { action: { label: "Annuler", onClick: () => db.cuisine_repas.bulkPut(proposes) } });
}

/* ---------- Le batch du dimanche ---------- */

// Les repas d'une semaine qui se cuisinent d'avance : validés, et pas encore passés.
export const repasDuBatch = (repas: Repas[], today: string) => repas.filter((r) => !r.propose && r.jour >= today);

// « Faire le plan de cuisson » : Echo met les plats de la semaine dans l'ordre d'une mise en place. Refaire le plan remet les cases à zéro.
export async function preparerBatch(semaine: string, repas: Repas[], tous: Besoin[]): Promise<Batch> {
  const portions = new Map(boites(repas, tous).map((b) => [b.jour, b.portions]));
  const plats = repas.filter((r) => portions.has(r.jour)).map((r) => ({ jour: r.jour, plat: r.plat, portions: portions.get(r.jour), congele: !!r.congele, ingredients: r.ingredients ?? [] }));
  if (!plats.length) throw new ErreurSemaine("Rien à cuisiner cette semaine.");
  const lu = await appeler({ mode: "batch", repas: plats });
  const batch = nettoyerBatch({ semaine, etapes: lu.etapes, duree: lu.duree, astuce: lu.astuce, cree: Date.now() });
  if (!batch?.etapes.length) throw new ErreurSemaine(MESSAGES.lecture);
  // La réponse peut mettre une minute : si le batch a été rangé entre-temps, il reste rangé.
  await db.transaction("rw", db.cuisine_batch, async () => {
    const fini = (await db.cuisine_batch.get(semaine))?.fini;
    await db.cuisine_batch.put({ ...batch, ...(fini ? { fini } : {}) });
  });
  return batch;
}

/* ---------- Le livre de recettes ---------- */

// « Prévoir » une recette du livre : elle prend le premier soir libre où quelqu'un mange à la maison (d'aujourd'hui, avant 19 h,
// à dans deux semaines), et ce qu'il manque part aux courses.
export async function prevoirRecette(x: Recette, now = new Date()) {
  const today = auJour(0, now), jours = Array.from({ length: 14 }, (_, i) => plusJours(today, i));
  const pris = new Set((await db.cuisine_repas.where("jour").between(today, jours[13], true, true).toArray()).map((r) => r.jour));
  const jour = besoins(jours, versTravail(await db.horaires.toArray())).find((b) => !pris.has(b.jour) && b.soir > 0 && (b.jour !== today || now.getHours() < 19))?.jour;
  if (!jour) { toast("Pas de soir libre dans les deux semaines qui viennent."); return; }
  const repas: Repas = { jour, plat: x.plat, ...(x.ingredients ? { ingredients: x.ingredients } : {}), ...(x.congele ? { congele: true } : {}) };
  await db.cuisine_repas.put(repas);
  const crees = await versCourses([repas]);
  const quand = new Date(jour + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long" });
  toast(`${x.plat} prévu ${jour === today ? "ce soir" : quand}${crees.length ? `. ${dire(crees.length)}.` : ""}`, { duration: 6000, action: { label: "Annuler", onClick: () => db.transaction("rw", db.cuisine_repas, db.cuisine_courses, async () => {
    if ((await db.cuisine_repas.get(jour))?.plat === x.plat) await db.cuisine_repas.delete(jour);
    await db.cuisine_courses.bulkDelete(crees.map((a) => a.id));
  }) } });
}

export { besoins };
