import { toast } from "sonner";
import { db } from "../../data/db";
import { plusJours } from "../../lib/dates";
import { CODES, type Horaire } from "../../lib/horaires";
import type { Noms } from "../../lib/types";
import { entetesIA } from "../../sync/client";
import { ajouterArticles } from "./actions";
import { besoins, manquants, nettoyerRepas, type Besoin, type Repas, type Travail } from "./donnees";

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
  service: "Echo ne répond pas pour l'instant.",
};
export class ErreurSemaine extends Error {}

export const versTravail = (horaires: Horaire[]): Travail[] =>
  horaires.filter((h) => h.code in CODES).map((h) => ({ qui: h.qui, jour: h.jour, plages: CODES[h.code].plages, fixe: h.code === "FIX" }));

// Ce qu'on envoie à Echo : les jours à prévoir, les goûts, le stock, et ce qu'il ne faut pas reproposer.
export async function preparerDemande(aPrevoir: Besoin[], noms: Noms, semaine: string[], eviter: string[] = []) {
  const [gouts, stock, repas] = await Promise.all([db.cuisine_gouts.toArray(), db.cuisine_stock.toArray(), db.cuisine_repas.toArray()]);
  const demandes = new Set(aPrevoir.map((b) => b.jour));
  const valides = repas.filter((r) => !r.propose || !demandes.has(r.jour));
  const mangeur = aPrevoir.find((b) => b.gamelle)?.gamelle;
  return {
    jours: aPrevoir.map((b) => ({ jour: b.jour, soir: b.soir, gamelle: !!b.gamelle })),
    gamellePour: mangeur ? noms[mangeur] : "",
    gouts: gouts.map((g) => ({ prenom: noms[g.qui], aime: g.aime, evite: g.evite, rechauffe: g.rechauffe })),
    stock: stock.slice(0, 40).map((p) => ({ nom: p.nom, avant: p.avant ?? "" })),
    gardes: valides.filter((r) => semaine.includes(r.jour) && !demandes.has(r.jour)).map((r) => ({ jour: r.jour, plat: r.plat })),
    recents: valides.filter((r) => r.jour >= plusJours(semaine[0], -14) && r.jour < semaine[0]).map((r) => r.plat).slice(-20),
    eviter,
  };
}

async function demander(corps: unknown): Promise<{ repas: Repas[]; reponse: string }> {
  if (!navigator.onLine) throw new ErreurSemaine("Pas de connexion internet. Echo a besoin du réseau pour proposer les repas.");
  const code = String((await db.reglages.get("codeEcho"))?.valeur ?? "").trim();
  let r: Response;
  try {
    r = await fetch(ADRESSE, { method: "POST", headers: await entetesIA(code), body: JSON.stringify(corps), signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new ErreurSemaine("Pas de connexion avec Echo.");
  }
  const lu = await r.json().catch(() => null);
  if (!r.ok || !lu || !Array.isArray(lu.repas)) throw new ErreurSemaine(MESSAGES[lu?.erreur] ?? MESSAGES.service);
  const repas = (lu.repas as unknown[]).map((x) => nettoyerRepas(x)).filter((x): x is Repas => !!x);
  if (!repas.length) throw new ErreurSemaine(MESSAGES.lecture);
  return { repas, reponse: typeof lu.reponse === "string" ? lu.reponse : "" };
}

// « Prévoir ma semaine » : Echo remplit les jours donnés. Ses repas restent une proposition jusqu'à « Valider ».
export async function proposerSemaine(aPrevoir: Besoin[], noms: Noms, semaine: string[]) {
  const { repas, reponse } = await demander(await preparerDemande(aPrevoir, noms, semaine));
  const demandes = new Set(aPrevoir.map((b) => b.jour));
  await db.cuisine_repas.bulkPut(repas.filter((r) => demandes.has(r.jour)).map((r) => ({ ...r, propose: true })));
  return reponse;
}

// « Changer » : un autre plat pour ce jour, sans reproposer celui-ci ni ceux de la semaine.
export async function changerRepas(b: Besoin, actuel: Repas, noms: Noms, semaine: string[]) {
  const autres = (await db.cuisine_repas.where("jour").anyOf(semaine).toArray()).map((r) => r.plat);
  const { repas } = await demander(await preparerDemande([b], noms, semaine, [...new Set([actuel.plat, ...autres])]));
  const nouveau = repas.find((r) => r.jour === b.jour);
  if (!nouveau) throw new ErreurSemaine(MESSAGES.lecture);
  await db.cuisine_repas.put({ ...nouveau, ...(actuel.propose ? { propose: true } : {}) });
  // Un plat déjà validé qui change : ses ingrédients manquants partent aux courses tout de suite.
  if (!actuel.propose) await versCourses([nouveau]);
}

async function versCourses(repas: Repas[]) {
  const aAcheter = manquants(repas, await db.cuisine_stock.toArray());
  return aAcheter.length ? (await ajouterArticles(aAcheter, true)).length : 0;
}

// « Valider » : la proposition devient la semaine, et ce qu'il manque part dans les courses. Annuler remet tout comme avant.
export async function validerSemaine(semaine: string[]) {
  const proposes = (await db.cuisine_repas.where("jour").anyOf(semaine).toArray()).filter((r) => r.propose);
  if (!proposes.length) return;
  const avant = (await db.cuisine_courses.toArray()).map((a) => a.id);
  await db.cuisine_repas.bulkPut(proposes.map(({ propose: _p, ...r }) => r));
  const n = await versCourses(proposes);
  toast(n ? `Semaine validée. ${n} article${n > 1 ? "s" : ""} ajouté${n > 1 ? "s" : ""} aux courses.` : "Semaine validée. Rien à acheter en plus.", {
    duration: 6000,
    action: { label: "Annuler", onClick: () => db.transaction("rw", db.cuisine_repas, db.cuisine_courses, async () => {
      await db.cuisine_repas.bulkPut(proposes);
      const ajoutes = (await db.cuisine_courses.toCollection().primaryKeys()).filter((id) => !avant.includes(id));
      await db.cuisine_courses.bulkDelete(ajoutes);
    }) },
  });
}

// Refuser la proposition : les jours proposés redeviennent vides.
export const refuserProposition = async (semaine: string[]) =>
  db.cuisine_repas.bulkDelete((await db.cuisine_repas.where("jour").anyOf(semaine).toArray()).filter((r) => r.propose).map((r) => r.jour));

export { besoins };
