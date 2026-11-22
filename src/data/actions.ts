import { toast } from "sonner";
import { auJour, libelleJour, nouvelId } from "../lib/dates";
import { NIVEAUX, niveau } from "../lib/importance";
import type { Etape, Niveau, Qui, Repete, Tache } from "../lib/types";
import { prochainJour } from "../lib/valider";
import { db } from "./db";

export function exemples(): Tache[] {
  const t = auJour(), h = new Date().getHours();
  const plus = (n: number) => String(Math.min(22, h + n)).padStart(2, "0") + ":00";
  const base: Array<Partial<Tache> & Pick<Tache, "titre" | "qui" | "jour" | "heure">> = [
    { titre: "Payer la facture d'électricité", qui: "moi", jour: auJour(-1), heure: "" },
    { titre: "Vétérinaire pour le chat", qui: "nous", jour: t, heure: plus(2) },
    { titre: "Sortir les poubelles", qui: "elle", jour: t, heure: "20:00", repete: "semaine" },
    { titre: "Appeler le plombier pour le robinet", qui: "moi", jour: t, heure: "" },
    { titre: "Arroser les plantes", qui: "elle", jour: t, heure: "", repete: "jour" },
    { titre: "Trier les papiers du tiroir, un jour", qui: "nous", jour: t, heure: "" },
  ];
  return base.map((x, i) => ({ id: nouvelId() + i, niveau: null, repete: "", note: "", fait: null, faitLe: null, cree: Date.now() + i, ex: true, ...x }));
}

// Au tout premier lancement, on met des exemples pour essayer.
export async function premierLancement() {
  // Le contrôle se fait DANS la transaction : deux ouvertures en même temps ne doublent pas les exemples.
  await db.transaction("rw", db.taches, db.reglages, async () => {
    if (await db.reglages.get("initialise")) return;
    await db.taches.bulkAdd(exemples());
    await db.reglages.put({ cle: "initialise", valeur: true });
  });
}

export interface Brouillon { titre: string; qui: Qui; jour: string; heure: string; niveau: Niveau | null; repete: Repete; note: string; etapes?: Etape[] }

export async function ajouter(d: Brouillon, photos: Blob[] = []) {
  const t: Tache = { id: nouvelId(), ...d, fait: null, faitLe: null, cree: Date.now() };
  await db.transaction("rw", db.taches, db.photos, async () => {
    await db.taches.add(t);
    await db.photos.bulkAdd(photos.map((blob, i) => ({ id: nouvelId() + i, tacheId: t.id, blob, cree: Date.now() + i })));
  });
  const quand = t.jour === auJour() ? "" : ` · ${libelleJour(t.jour).toLowerCase()}`;
  toast(`Ajouté${quand}`, { action: { label: "Annuler", onClick: () => retirer(t.id) } });
}

// Retirer une tâche et ses photos (sans message).
const retirer = (id: string) => db.transaction("rw", db.taches, db.photos, async () => {
  await db.taches.delete(id);
  await db.photos.where("tacheId").equals(id).delete();
});

export async function modifier(id: string, d: Brouillon, photos: Blob[] = [], photosRetirees: string[] = []) {
  await db.transaction("rw", db.taches, db.photos, async () => {
    await db.taches.update(id, { ...d, ex: false });
    await db.photos.bulkDelete(photosRetirees);
    await db.photos.bulkAdd(photos.map((blob, i) => ({ id: nouvelId() + i, tacheId: id, blob, cree: Date.now() + i })));
  });
  toast("Enregistré");
}

export async function cocher(tache: Tache) {
  let message = "Fait !";
  let deja = false;
  await db.transaction("rw", db.taches, async () => {
    // On relit la tâche : deux touchers rapides ne doivent pas la cocher (ou la répéter) deux fois.
    const t = await db.taches.get(tache.id);
    if (!t) { deja = true; return; }
    if (t.fait) { deja = true; if (tache.fait) await annulerFait(t.id); return; }
    const maj: Partial<Tache> = { fait: Date.now(), faitLe: auJour() };
    // Une tâche qui revient : on prépare la suivante.
    if (t.repete) {
      const suiv = prochainJour(t.jour, t.repete);
      const copie: Tache = { ...t, id: nouvelId(), jour: suiv, fait: null, faitLe: null, suite: null, cree: Date.now(), etapes: t.etapes?.map((e) => ({ ...e, fait: false })) };
      await db.taches.add(copie);
      maj.suite = copie.id;
      message = `Fait. Revient ${libelleJour(suiv).toLowerCase()}`.replace(/\.?$/, ".");
    }
    await db.taches.update(t.id, maj);
  });
  if (deja) return;
  toast(message, { action: { label: "Annuler", onClick: () => decocher(tache.id) } });
}

async function annulerFait(id: string) {
  const t = await db.taches.get(id);
  if (!t) return;
  if (t.suite) {
    // La suivante n'est retirée que si elle n'a pas déjà été faite.
    const suite = await db.taches.get(t.suite);
    if (suite && !suite.fait) await db.taches.delete(t.suite);
  }
  await db.taches.update(id, { fait: null, faitLe: null, suite: null });
}
export const decocher = (id: string) => db.transaction("rw", db.taches, () => annulerFait(id));

export async function changerNiveau(t: Tache, sens: 1 | -1) {
  const avant = t.niveau, cur = niveau(t);
  const n = Math.max(0, Math.min(2, cur + sens)) as Niveau;
  if (n === cur) { toast(sens > 0 ? "Déjà en important" : "Déjà en plus tard"); return; }
  await db.taches.update(t.id, { niveau: n });
  toast(`Rangé en « ${NIVEAUX[n]} »`, { action: { label: "Annuler", onClick: () => db.taches.update(t.id, { niveau: avant }) } });
}

export async function supprimer(id: string) {
  const t = await db.taches.get(id);
  if (!t) return;
  const photos = await db.photos.where("tacheId").equals(id).toArray();
  await db.transaction("rw", db.taches, db.photos, async () => {
    await db.taches.delete(id);
    await db.photos.where("tacheId").equals(id).delete();
  });
  toast("Tâche supprimée", { action: { label: "Annuler", onClick: () => db.transaction("rw", db.taches, db.photos, async () => { await db.taches.add(t); await db.photos.bulkAdd(photos); }) } });
}

// Cocher une étape directement, sans ouvrir la feuille.
export const cocherEtape = async (t: Tache, etapeId: string) =>
  db.taches.update(t.id, { etapes: (t.etapes || []).map((e) => (e.id === etapeId ? { ...e, fait: !e.fait } : e)) });

export const effacerExemples = () => db.transaction("rw", db.taches, db.photos, async () => {
  const ids = (await db.taches.filter((t) => !!t.ex).toArray()).map((t) => t.id);
  await db.taches.bulkDelete(ids);
  await db.photos.where("tacheId").anyOf(ids).delete();
});

export const remettreExemples = () => db.taches.bulkAdd(exemples());
export const toutEffacer = () => db.transaction("rw", db.taches, db.photos, async () => { await db.taches.clear(); await db.photos.clear(); });

// « À demain » : la tâche quitte aujourd'hui sans être perdue.
export async function aDemain(t: Tache) {
  const avant = t.jour;
  await db.taches.update(t.id, { jour: auJour(1) });
  toast("Remis à demain", { action: { label: "Annuler", onClick: () => db.taches.update(t.id, { jour: avant }) } });
}
