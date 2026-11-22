import type { Tache } from "./types";

const sansAccent = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Ce que la recherche trouve : le titre, la note et les étapes de chaque tâche, sans tenir compte des accents ni des majuscules.
export function chercherTaches(taches: Tache[], q: string): Tache[] {
  const n = sansAccent(q.trim());
  if (!n) return [];
  return taches.filter((t) => sansAccent([t.titre, t.note, ...(t.etapes ?? []).map((e) => e.texte)].join(" ")).includes(n));
}
