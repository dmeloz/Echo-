import { toast } from "sonner";
import { auJour, libelleJour, nouvelId, plusJours } from "../lib/dates";
import { NIVEAUX, niveau } from "../lib/importance";
import type { Niveau, Qui, Repete, Tache } from "../lib/types";
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
  const deja = await db.reglages.get("initialise");
  if (deja) return;
  await db.transaction("rw", db.taches, db.reglages, async () => {
    await db.taches.bulkAdd(exemples());
    await db.reglages.put({ cle: "initialise", valeur: true });
  });
}

export interface Brouillon { titre: string; qui: Qui; jour: string; heure: string; niveau: Niveau | null; repete: Repete; note: string }

export async function ajouter(d: Brouillon) {
  const t: Tache = { id: nouvelId(), ...d, fait: null, faitLe: null, cree: Date.now() };
  await db.taches.add(t);
  const quand = t.jour === auJour() ? "" : ` · ${libelleJour(t.jour).toLowerCase()}`;
  toast(`Ajouté${quand}`, { action: { label: "Annuler", onClick: () => db.taches.delete(t.id) } });
}

export async function modifier(id: string, d: Brouillon) {
  await db.taches.update(id, { ...d, ex: false });
  toast("Enregistré");
}

export async function cocher(t: Tache) {
  if (t.fait) return decocher(t.id);
  const maj: Partial<Tache> = { fait: Date.now(), faitLe: auJour() };
  let message = "Fait !";
  await db.transaction("rw", db.taches, async () => {
    // Une tâche qui revient : on prépare la suivante.
    if (t.repete) {
      const pas = t.repete === "jour" ? 1 : 7;
      let suiv = plusJours(t.jour, pas);
      while (suiv <= auJour()) suiv = plusJours(suiv, pas);
      const copie: Tache = { ...t, id: nouvelId(), jour: suiv, fait: null, faitLe: null, suite: null, cree: Date.now() };
      await db.taches.add(copie);
      maj.suite = copie.id;
      message = `Fait. Revient ${libelleJour(suiv).toLowerCase()}`.replace(/\.?$/, ".");
    }
    await db.taches.update(t.id, maj);
  });
  navigator.vibrate?.(12);
  toast(message, { action: { label: "Annuler", onClick: () => decocher(t.id) } });
}

export async function decocher(id: string) {
  await db.transaction("rw", db.taches, async () => {
    const t = await db.taches.get(id);
    if (!t) return;
    if (t.suite) await db.taches.delete(t.suite);
    await db.taches.update(id, { fait: null, faitLe: null, suite: null });
  });
}

export async function changerNiveau(t: Tache, sens: 1 | -1) {
  const avant = t.niveau, cur = niveau(t);
  const n = Math.max(0, Math.min(2, cur + sens)) as Niveau;
  if (n === cur) { toast(sens > 0 ? "Déjà en important" : "Déjà en plus tard"); return; }
  await db.taches.update(t.id, { niveau: n });
  navigator.vibrate?.(10);
  toast(`Rangé en « ${NIVEAUX[n]} »`, { action: { label: "Annuler", onClick: () => db.taches.update(t.id, { niveau: avant }) } });
}

export async function supprimer(id: string) {
  const t = await db.taches.get(id);
  if (!t) return;
  await db.taches.delete(id);
  toast("Tâche supprimée", { action: { label: "Annuler", onClick: () => db.taches.add(t) } });
}

export const effacerExemples = () => db.taches.filter((t) => !!t.ex).delete();
export const remettreExemples = () => db.taches.bulkAdd(exemples());
export const toutEffacer = () => db.taches.clear();
