import { toast } from "sonner";
import { db } from "../../data/db";
import { auJour, nouvelId, plusJours } from "../../lib/dates";
import { preparerPhoto } from "../../lib/lecture";
import type { Personne } from "../../lib/types";
import { entetesIA } from "../../sync/client";
import { cleDe, nettoyerLecture, type Article, type LectureTicket, type LigneTicket, type Produit, type Ticket } from "./donnees";

// Le ticket de caisse en photo : la photo part vers la fonction « lire-ticket » du projet Supabase, qui la fait lire
// par Claude (la photo n'est pas gardée). On vérifie la lecture à l'écran, puis « Ranger » remplit le stock,
// coche les courses achetées et garde le ticket (magasin, total, prix).

const ADRESSE = "https://ewqvgayhptfwbpkxsaij.supabase.co/functions/v1/lire-ticket";
const MESSAGES: Record<string, string> = {
  code: "Echo ne te reconnaît pas. Relie ce téléphone au foyer dans Réglages → Foyer.",
  limite: "Beaucoup de photos lues cette dernière heure. Réessaie un peu plus tard.",
  cle: "La lecture par photo n'est pas encore branchée : la clé de l'IA manque côté serveur.",
  image: "La photo n'a pas pu être lue. Reprends-la bien à plat, avec tout le ticket.",
  refus: "La photo n'a pas pu être lue. Essaie avec une autre photo.",
  occupe: "Le service est très demandé. Réessaie dans une minute.",
  lecture: "La lecture n'a pas abouti. Réessaie avec une photo plus nette.",
  long: "La lecture prend trop de temps. Réessaie, ou prends le ticket en deux photos.",
  service: "Le service de lecture ne répond pas. Réessaie dans un moment.",
};
export class ErreurTicket extends Error {}

export async function lireTicket(fichier: File): Promise<LectureTicket> {
  if (!navigator.onLine) throw new ErreurTicket("Pas de connexion internet. La lecture du ticket a besoin du réseau.");
  let photo: { data: string; type: string };
  try { photo = await preparerPhoto(fichier); } catch { throw new ErreurTicket("La photo n'a pas pu être préparée. Réessaie."); }
  const courses = (await db.cuisine_courses.toArray()).filter((a) => !a.fait).map((a) => a.nom.replace(/\s+/g, " ").trim()).slice(0, 80);
  const code = String((await db.reglages.get("codeEcho"))?.valeur ?? "").trim();
  let r: Response;
  try {
    r = await fetch(ADRESSE, { method: "POST", headers: await entetesIA(code), body: JSON.stringify({ image: photo.data, type: photo.type, courses }), signal: AbortSignal.timeout(150_000) });
  } catch (e) {
    throw new ErreurTicket(e instanceof DOMException && e.name === "TimeoutError" ? MESSAGES.long : "Pas de connexion avec Echo. Réessaie.");
  }
  const corps = await r.json().catch(() => null);
  if (!r.ok || !corps) throw new ErreurTicket(MESSAGES[corps?.erreur] ?? MESSAGES.service);
  const lu = nettoyerLecture(corps, courses);
  if (!lu.lisible) throw new ErreurTicket(lu.remarque || "Je n'ai pas réussi à lire ce ticket. Reprends la photo bien à plat, avec tout le ticket.");
  return lu;
}

// Le jour du ticket : celui qui est écrit dessus s'il est plausible (pas dans le futur, pas plus vieux qu'un mois).
export const jourDuTicket = (lu: LectureTicket, now = new Date()) =>
  (lu.date && lu.date <= auJour(0, now) && lu.date >= auJour(-31, now) ? lu.date : auJour(0, now));

// Le total gardé : celui du ticket, ou la somme des lignes s'il était illisible.
const somme = (lignes: Array<{ prix: number }>) => Math.round(lignes.reduce((s, l) => s + l.prix, 0) * 100) / 100;

// Le même ticket déjà rangé ? (même magasin, même jour, même total)
export async function dejaRange(lu: LectureTicket, now = new Date()) {
  const jour = jourDuTicket(lu, now), total = lu.total || somme(lu.lignes);
  if (!total) return false;
  return (await db.cuisine_tickets.toArray()).some((t) => t.date === jour && t.total === total && cleDe(t.magasin) === cleDe(lu.magasin));
}

export interface Bilan { stock: number; coches: number }

// « Ranger » : les lignes gardées vont au stock (sauf « pas au stock »), leurs articles de la liste sont cochés,
// et le ticket est gardé. Un produit déjà au même endroit n'est pas doublé : sa date est rafraîchie. Annuler remet tout.
export async function rangerTicket(lu: LectureTicket, gardees: LigneTicket[], now = new Date()): Promise<Bilan> {
  const jour = jourDuTicket(lu, now), quand = now.getTime();
  const neufs: Produit[] = [], anciens: Produit[] = [], coches: Article[] = [];
  let ticket: Ticket | undefined;
  await db.transaction("rw", db.cuisine_stock, db.cuisine_courses, db.cuisine_tickets, db.reglages, async () => {
    const par = ((await db.reglages.get("proprio"))?.valeur as Personne | undefined) ?? "moi";
    const stock = await db.cuisine_stock.toArray();
    for (const [i, l] of gardees.entries()) {
      if (l.lieu === "aucun") continue;
      // La date estimée ne vaut que pour le frigo : rangé ailleurs d'un toucher, le produit n'en a plus.
      const avant = l.jours && l.lieu === "frigo" ? plusJours(jour, l.jours) : undefined;
      const present = [...stock, ...neufs].find((p) => p.lieu === l.lieu && cleDe(p.nom) === cleDe(l.nom));
      if (!present) neufs.push({ id: nouvelId(), nom: l.nom, lieu: l.lieu, ...(avant ? { avant } : {}), cree: quand + i });
      // Déjà là : c'est du neuf, l'ancienne date ne vaut plus (remplacée par l'estimation, ou retirée).
      else if (!neufs.includes(present) && present.avant !== avant) { anciens.push({ ...present }); await db.cuisine_stock.update(present.id, { avant }); }
    }
    await db.cuisine_stock.bulkAdd(neufs);
    const noms = new Set(gardees.map((l) => l.course).filter(Boolean));
    for (const a of await db.cuisine_courses.toArray()) {
      if (a.fait || !noms.delete(a.nom.replace(/\s+/g, " ").trim())) continue;
      coches.push(a);
      await db.cuisine_courses.update(a.id, { fait: quand, faitPar: par });
    }
    ticket = { id: nouvelId(), magasin: lu.magasin, date: jour, total: lu.total || somme(lu.lignes), monnaie: lu.monnaie,
      lignes: gardees.map(({ nom, qte, prix }) => ({ nom, qte, prix })), par, cree: quand };
    await db.cuisine_tickets.add(ticket);
  });
  const t = ticket!;
  const bouts = [neufs.length ? `${neufs.length} produit${neufs.length > 1 ? "s" : ""} au stock` : "", coches.length ? `${coches.length} article${coches.length > 1 ? "s" : ""} coché${coches.length > 1 ? "s" : ""}` : ""].filter(Boolean);
  toast(bouts.length ? `Ticket rangé : ${bouts.join(", ")}.` : "Ticket gardé.", { duration: 8000, action: { label: "Annuler", onClick: () => db.transaction("rw", db.cuisine_stock, db.cuisine_courses, db.cuisine_tickets, async () => {
    await db.cuisine_tickets.delete(t.id);
    await db.cuisine_stock.bulkDelete(neufs.map((p) => p.id));
    for (const p of anciens) if (await db.cuisine_stock.get(p.id)) await db.cuisine_stock.put(p);
    // On ne décoche que ce que le ticket avait coché, et seulement si l'article est encore dans la liste.
    for (const a of coches) if ((await db.cuisine_courses.get(a.id))?.fait === quand) await db.cuisine_courses.update(a.id, { fait: null, faitPar: undefined });
  }) } });
  return { stock: neufs.length, coches: coches.length };
}
