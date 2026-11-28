import { auJour, minutes, sansAccents } from "./dates";
import type { Niveau, Tache } from "./types";

// Règle simple en attendant l'assistant IA : l'app propose, Melo corrige d'un geste.
const MOTS_IMPORTANTS = /(urgent|payer|paie|facture|loyer|impot|rdv|rendez|medecin|docteur|veterinaire|dentiste|banque|ecole|creche|pharmacie|assurance|amende|ordonnance|vaccin|caf|administratif)/;
const MOTS_PLUS_TARD = /(un jour|quand possible|si possible|eventuellement|idee|plus tard|a l'occasion)/;

export function niveauPropose(t: Pick<Tache, "titre" | "jour" | "heure">, now = new Date()): Niveau {
  const s = sansAccents(t.titre);
  const today = auJour(0, now);
  let n: number = 1;
  if (MOTS_IMPORTANTS.test(s)) n = 2;
  if (MOTS_PLUS_TARD.test(s)) n = 0;
  if (t.jour < today && n < 2) n++;
  if (t.heure && t.jour === today) {
    const ecart = minutes(t.heure) - (now.getHours() * 60 + now.getMinutes());
    if (ecart <= 120 && ecart >= -60) n = 2;
  }
  return n as Niveau;
}

export const niveau = (t: Tache, now = new Date()): Niveau => t.niveau ?? niveauPropose(t, now);
export const NIVEAUX: Record<Niveau, string> = { 2: "Important", 1: "Normal", 0: "Plus tard" };
