import { auJour, nouvelId, plusJours } from "./dates";
import type { Etape, Noms, Repete, Tache } from "./types";

// Ce qui vient de l'extérieur (un fichier de sauvegarde) est nettoyé avant d'entrer dans l'app :
// une tâche abîmée ne doit jamais pouvoir faire planter l'accueil.

const texte = (x: unknown, max: number, defaut = "") => (typeof x === "string" ? x.slice(0, max) : defaut);
const JOUR = /^\d{4}-\d{2}-\d{2}$/, HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function nettoyerTache(x: unknown, today = auJour()): Tache | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const titre = texte(o.titre, 140).trim();
  if (!titre) return null;
  const fait = typeof o.fait === "number" && Number.isFinite(o.fait) ? o.fait : null;
  const jour = typeof o.jour === "string" && JOUR.test(o.jour) ? o.jour : today;
  const etapes: Etape[] = Array.isArray(o.etapes)
    ? o.etapes.flatMap((e) => {
        const t = e && typeof e === "object" ? texte((e as Record<string, unknown>).texte, 200).trim() : "";
        return t ? [{ id: texte((e as Record<string, unknown>).id, 40) || nouvelId(), texte: t, fait: !!(e as Record<string, unknown>).fait }] : [];
      }).slice(0, 50)
    : [];
  return {
    id: texte(o.id, 40) || nouvelId(),
    titre,
    qui: o.qui === "elle" || o.qui === "nous" ? o.qui : "moi",
    jour,
    heure: typeof o.heure === "string" && HEURE.test(o.heure) ? o.heure : "",
    niveau: o.niveau === 0 || o.niveau === 1 || o.niveau === 2 ? o.niveau : null,
    repete: o.repete === "jour" || o.repete === "semaine" ? o.repete : "",
    note: texte(o.note, 1000),
    fait,
    faitLe: fait && typeof o.faitLe === "string" && JOUR.test(o.faitLe) ? o.faitLe : fait ? today : null,
    suite: typeof o.suite === "string" ? o.suite.slice(0, 40) : null,
    cree: typeof o.cree === "number" && Number.isFinite(o.cree) ? o.cree : Date.now(),
    ...(o.ex === true ? { ex: true } : {}),
    ...(etapes.length ? { etapes } : {}),
  };
}

export function nettoyerNoms(x: unknown, defaut: Noms): Noms {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  return { moi: texte(o.moi, 24).trim() || defaut.moi, elle: texte(o.elle, 24).trim() || defaut.elle };
}

// Une tâche qui revient : le prochain jour, toujours après aujourd'hui.
export function prochainJour(jour: string, repete: Exclude<Repete, "">, today = auJour()): string {
  const pas = repete === "jour" ? 1 : 7;
  let suiv = plusJours(jour, pas);
  while (suiv <= today) suiv = plusJours(suiv, pas);
  return suiv;
}
