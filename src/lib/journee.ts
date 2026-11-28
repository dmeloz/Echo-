import { auJour } from "./dates";
import type { Tache } from "./types";

export function tachesDuJour(taches: Tache[], now = new Date()) {
  const today = auJour(0, now);
  return {
    ouvertes: taches.filter((t) => !t.evt && !t.fait && t.jour <= today),
    faites: taches.filter((t) => !t.evt && t.fait && t.faitLe === today),
  };
}
