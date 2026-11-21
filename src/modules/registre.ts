import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../data/db";
import { budget } from "./budget";
import type { Module } from "./contrat";
import { cuisine } from "./cuisine";
import { maison } from "./maison";

// Tous les modules de l'app, dans l'ordre du menu. Pour en ajouter un, l'ajouter ici.
export const MODULES: Module[] = [cuisine, maison, budget];

// Chaque module peut être masqué dans les Réglages (il disparaît du menu et de l'accueil).
export function useModulesActifs(): { actifs: Module[]; masques: string[] } {
  const r = useLiveQuery(() => db.reglages.get("modulesMasques"), []);
  const masques = (r?.valeur as string[] | undefined) ?? [];
  return { actifs: MODULES.filter((m) => !masques.includes(m.id)), masques };
}
export const basculerModule = async (id: string, masques: string[]) =>
  db.reglages.put({ cle: "modulesMasques", valeur: masques.includes(id) ? masques.filter((x) => x !== id) : [...masques, id] });
