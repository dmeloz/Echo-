import { db } from "../../data/db";
import { marquerFait, mettreCorbeille, remettre, decocher, type Brouillon } from "../../data/actions";
import { auJour, heureFr, libelleJour, nouvelId, plusJours, sansAccents } from "../dates";
import { completer } from "../fixes";
import { CODES, phraseDe } from "../horaires";
import { autre, type Noms, type Personne, type Qui, type Repete, type Tache } from "../types";
import { genreDe, type GenreOutil } from "../../../supabase/functions/_shared/echo-outils";

// Ce que fait l'app quand Echo demande un outil (la liste fermée est dans supabase/functions/_shared/echo-outils.ts).
// Un outil « lire » répond tout de suite. Un outil qui change quelque chose prépare une Action :
// rien ne change tant que la personne n'a pas dit oui (ou que le réglage « Petites choses sans demander » le permet).

export interface ContexteEcho { noms: Noms; proprio: Personne; now: Date }

export interface Action {
  outil: string;
  genre: Exclude<GenreOutil, "lire">;
  cible?: string; // l'id de la tâche visée : une 2e action sur la même tâche remplace la 1re
  libelle: string; // « Ajouter : Dentiste »
  details: string[]; // « jeudi », « 15 h », « Sarah »
  brouillon?: Brouillon; // pour « Modifier » avant d'ajouter
  // Fait l'action, et rend de quoi l'annuler.
  faire: () => Promise<() => Promise<unknown>>;
}

export interface Executant {
  lire?: (entree: Record<string, unknown>, ctx: ContexteEcho) => Promise<unknown>;
  // Une phrase (string) : la demande ne tient pas debout, on le dit à Echo, qui peut corriger.
  preparer?: (entree: Record<string, unknown>, ctx: ContexteEcho) => Promise<Action | string>;
}

const JOUR = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
const REPETES: Repete[] = ["", "jour", "semaine", "2semaines", "mois", "an"];
const QUIS: Qui[] = ["moi", "elle", "nous"];
const court = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");
const nomDe = (noms: Noms, q: Qui) => (q === "nous" ? "vous deux" : noms[q]);
const quand = (jour: string, heure: string, now: Date) => [libelleJour(jour, now).toLowerCase(), heure ? heureFr(heure) : ""].filter(Boolean).join(" ");

// Une tâche telle qu'Echo la voit : sans photos ni notes longues.
const vue = (t: Tache) => ({
  id: t.id, titre: t.titre, jour: t.jour, heure: t.heure || undefined, fin: t.fin || undefined, qui: t.qui,
  ...(t.evt ? { rendezVous: true } : {}), ...(t.fait ? { fait: true } : {}), ...(t.repete ? { repete: t.repete } : {}),
  ...(t.niveau === 2 ? { important: true } : {}), ...(t.etapes?.length ? { etapes: t.etapes.length } : {}),
});

async function voirJours(e: Record<string, unknown>, ctx: ContexteEcho) {
  const du = String(e.du ?? ""), au = String(e.au ?? "");
  if (!JOUR.test(du) || !JOUR.test(au) || au < du) return { erreur: "Dates attendues : du et au en AAAA-MM-JJ, au après du." };
  const fin = au > plusJours(du, 13) ? plusJours(du, 13) : au;
  const taches = (await db.taches.where("jour").between(du, fin, true, true).toArray()).filter((t) => !t.ex);
  const poses = (await db.horaires.where("jour").between(du, fin, true, true).toArray()).filter((h) => h.code in CODES && !CODES[h.code].auto);
  const horaires = completer(poses, ctx.noms, du, fin);
  const jours = [];
  for (let j = du; j <= fin; j = plusJours(j, 1)) {
    const travail: Record<string, string> = {};
    for (const p of ["moi", "elle"] as Personne[]) {
      const h = horaires.find((x) => x.qui === p && x.jour === j);
      travail[ctx.noms[p]] = h ? phraseDe(h.code) : "pas d'horaire noté";
    }
    const semaine = new Date(j + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long" });
    jours.push({ jour: j, semaine, travail, taches: taches.filter((t) => t.jour === j).sort((a, b) => (a.heure || "99").localeCompare(b.heure || "99")).map(vue) });
  }
  return { jours, ...(fin < au ? { note: `Coupé au ${fin} (14 jours au plus).` } : {}) };
}

async function chercherTaches(e: Record<string, unknown>, ctx: ContexteEcho) {
  const mots = sansAccents(court(e.texte, 80)).split(/\s+/).filter((m) => m.length > 1);
  if (!mots.length) return { erreur: "Donne au moins un mot du titre." };
  const depuis = plusJours(auJour(0, ctx.now), -31);
  const trouvees = (await db.taches.where("jour").aboveOrEqual(depuis).toArray())
    .filter((t) => !t.ex && mots.some((m) => sansAccents(t.titre).includes(m)))
    .sort((a, b) => (a.jour + a.heure).localeCompare(b.jour + b.heure))
    .slice(0, 20);
  return { taches: trouvees.map(vue) };
}

function ajouterTache(e: Record<string, unknown>, ctx: ContexteEcho): Action | string {
  const titre = court(e.titre, 120);
  const jour = String(e.jour ?? "");
  if (!titre) return "Il manque le titre.";
  if (!JOUR.test(jour)) return "jour doit être AAAA-MM-JJ.";
  const heure = HEURE.test(String(e.heure ?? "")) ? String(e.heure) : "";
  const qui = QUIS.includes(e.qui as Qui) ? (e.qui as Qui) : ctx.proprio;
  const repete = REPETES.includes(e.repete as Repete) ? (e.repete as Repete) : "";
  const fin = heure && HEURE.test(String(e.fin ?? "")) && String(e.fin) > heure ? String(e.fin) : "";
  const evt = e.evenement === true && !!heure;
  const etapes = (Array.isArray(e.etapes) ? e.etapes : []).map((x) => court(x, 120)).filter(Boolean).slice(0, 12);
  const b: Brouillon = { titre, qui, jour, heure, repete, niveau: e.important === true ? 2 : null, note: "" };
  if (etapes.length) b.etapes = etapes.map((texte, i) => ({ id: nouvelId() + i, texte, fait: false }));
  if (evt) { b.evt = true; if (fin) b.fin = fin; }
  return {
    outil: "ajouter_tache", genre: "petit", libelle: `${evt ? "Rendez-vous" : "Ajouter"} : ${titre}`,
    details: [libelleJour(jour, ctx.now), heure ? heureFr(heure) + (fin ? ` – ${heureFr(fin)}` : "") : "", nomDe(ctx.noms, qui),
      repete ? "revient" : "", b.niveau === 2 ? "important" : "", etapes.length ? `${etapes.length} étape${etapes.length > 1 ? "s" : ""}` : ""].filter(Boolean),
    brouillon: b,
    faire: async () => {
      const id = nouvelId();
      await db.taches.add({ id, ...b, fait: null, faitLe: null, cree: Date.now() });
      return () => db.taches.delete(id);
    },
  };
}

// La tâche visée doit exister, et ne pas être une occurrence d'une série iCloud (lecture seule).
async function cible(e: Record<string, unknown>): Promise<Tache | string> {
  const id = court(e.id, 80);
  const t = id ? await db.taches.get(id) : undefined;
  if (!t || t.ex) return "Aucune tâche avec cet id. Cherche-la d'abord (chercher_taches ou voir_jours).";
  if (t.ical?.serie) return "Ce rendez-vous fait partie d'une série du calendrier iCloud : il se change dans le calendrier, pas ici.";
  return t;
}
// Toucher à ce qui est à l'autre : toujours demandé.
const genrePour = (t: Tache, ctx: ContexteEcho) => (t.qui === autre(ctx.proprio) ? "gros" : "petit");

async function modifierTache(e: Record<string, unknown>, ctx: ContexteEcho): Promise<Action | string> {
  const t = await cible(e);
  if (typeof t === "string") return t;
  const maj: Partial<Tache> = {};
  const titre = court(e.titre, 120);
  if (titre && titre !== t.titre) maj.titre = titre;
  const jour = String(e.jour ?? "");
  if (jour) { if (!JOUR.test(jour)) return "jour doit être AAAA-MM-JJ ou \"\"."; if (jour !== t.jour) maj.jour = jour; }
  const heure = String(e.heure ?? "");
  if (heure === "aucune") { if (t.heure) { maj.heure = ""; if (t.fin) maj.fin = ""; if (t.evt) maj.evt = false; } }
  else if (heure) {
    if (!HEURE.test(heure)) return "heure doit être HH:MM, \"\" ou \"aucune\".";
    if (heure !== t.heure) {
      maj.heure = heure;
      // Un rendez-vous garde sa durée.
      if (t.fin && t.heure) {
        const d = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3));
        const f = d(heure) + d(t.fin) - d(t.heure);
        maj.fin = f < 24 * 60 ? `${String(Math.floor(f / 60)).padStart(2, "0")}:${String(f % 60).padStart(2, "0")}` : "";
      }
    }
  }
  if (QUIS.includes(e.qui as Qui) && e.qui !== t.qui) maj.qui = e.qui as Qui;
  if (e.important === "oui" && t.niveau !== 2) maj.niveau = 2;
  if (e.important === "non" && t.niveau === 2) maj.niveau = 1;
  if (!Object.keys(maj).length) return "Rien ne change : la tâche est déjà comme ça.";
  const changes = [
    maj.titre ? `renommée « ${maj.titre} »` : "",
    maj.jour || maj.heure !== undefined ? `→ ${quand(maj.jour ?? t.jour, maj.heure ?? t.heure, ctx.now)}` : "",
    maj.qui ? `pour ${nomDe(ctx.noms, maj.qui)}` : "",
    maj.niveau === 2 ? "important" : maj.niveau === 1 ? "plus important" : "",
  ].filter(Boolean);
  const avant: Partial<Tache> = Object.fromEntries(Object.keys(maj).map((k) => [k, t[k as keyof Tache]]));
  return {
    outil: "modifier_tache", genre: genrePour(t, ctx), cible: t.id, libelle: `Changer : ${t.titre}`, details: changes,
    faire: async () => {
      await db.taches.update(t.id, maj);
      return () => db.taches.update(t.id, avant);
    },
  };
}

async function cocherTache(e: Record<string, unknown>, ctx: ContexteEcho): Promise<Action | string> {
  const t = await cible(e);
  if (typeof t === "string") return t;
  if (t.evt) return "Un rendez-vous ne se coche pas.";
  if (t.fait) return "Cette tâche est déjà faite.";
  return {
    outil: "cocher_tache", genre: genrePour(t, ctx), cible: t.id, libelle: `Fait : ${t.titre}`, details: [libelleJour(t.jour, ctx.now)],
    faire: async () => {
      await marquerFait(t.id);
      return () => decocher(t.id);
    },
  };
}

async function supprimerTache(e: Record<string, unknown>, ctx: ContexteEcho): Promise<Action | string> {
  const t = await cible(e);
  if (typeof t === "string") return t;
  return {
    outil: "supprimer_tache", genre: "gros", cible: t.id, libelle: `Effacer : ${t.titre}`, details: [quand(t.jour, t.heure, ctx.now), nomDe(ctx.noms, t.qui)],
    faire: async () => {
      await mettreCorbeille(t.id);
      return () => remettre(t.id);
    },
  };
}

// Les outils de la base (tâches et agenda). Les modules ajoutent les leurs par leur contrat (champ outils).
export const OUTILS_BASE: Record<string, Executant> = {
  voir_jours: { lire: voirJours },
  chercher_taches: { lire: chercherTaches },
  ajouter_tache: { preparer: async (e, ctx) => ajouterTache(e, ctx) },
  modifier_tache: { preparer: modifierTache },
  cocher_tache: { preparer: cocherTache },
  supprimer_tache: { preparer: supprimerTache },
};

// Le genre final d'une action : celui de la liste, ou plus strict si l'app l'a durci (jamais plus souple).
export function genreFinal(a: Action): Action["genre"] {
  const base = genreDe(a.outil);
  return base === "gros" || a.genre === "gros" ? "gros" : "petit";
}
