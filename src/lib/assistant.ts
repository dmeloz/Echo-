import { auJour, nouvelId, z } from "./dates";
import type { Brouillon } from "../data/actions";
import { entetesIA } from "../sync/client";
import type { Noms, Personne, Qui, Repete, Tache } from "./types";
import type { Appeler, Tour } from "./echo/boucle";

// L'assistant Echo : la phrase part vers la fonction « echo » du projet Supabase, qui la fait comprendre par Claude (Haiku 5.5).
// Echo propose, la personne confirme : rien n'est ajouté sans un toucher sur « Ajouter ».
// Sans code Echo ou sans internet, l'app garde sa façon simple de comprendre (src/lib/comprendre.ts).

export const ADRESSE_ECHO = "https://ewqvgayhptfwbpkxsaij.supabase.co/functions/v1/echo";

export interface TacheEcho {
  titre: string; jour: string; heure: string; qui: Qui; repete: Repete;
  important: boolean; evenement: boolean; fin: string; etapes: string[];
}
export interface PropositionEcho { taches: TacheEcho[]; reponse: string }

const MESSAGES: Record<string, string> = {
  code: "Echo ne te reconnaît pas. Relie ce téléphone au foyer, ou vérifie le code dans Réglages → Echo.",
  limite: "Echo a beaucoup servi cette dernière heure. Réessaie un peu plus tard.",
  cle: "Echo n'est pas encore branché (la clé de l'IA manque côté serveur).",
  refus: "Echo n'a pas pu traiter cette phrase.",
  occupe: "Echo est très demandé. Réessaie dans une minute.",
  lecture: "Echo n'a pas compris. Reformule ta phrase.",
  service: "Echo ne répond pas pour l'instant.",
  budget: "Echo a assez travaillé aujourd'hui (budget du jour atteint). Il revient demain.",
  requete: "Echo n'a pas pu lire ta demande. Reformule-la plus simplement.",
};
export class ErreurEcho extends Error {}

// Les tâches à venir (14 jours) donnent du contexte à Echo, sans les photos ni les notes.
export function contexte(taches: Tache[], now = new Date()) {
  const debut = auJour(0, now), fin = auJour(14, now);
  return taches
    .filter((t) => !t.fait && !t.ex && t.jour >= debut && t.jour <= fin)
    .sort((a, b) => (a.jour + a.heure).localeCompare(b.jour + b.heure))
    .slice(0, 40)
    .map((t) => ({ titre: t.titre, jour: t.jour, heure: t.heure, qui: t.qui }));
}

export async function demanderEcho(p: { texte: string; code: string; noms: Noms; proprio: Personne; taches: Tache[] }, now = new Date()): Promise<PropositionEcho> {
  let r: Response;
  try {
    r = await fetch(ADRESSE_ECHO, {
      method: "POST",
      headers: await entetesIA(p.code),
      body: JSON.stringify({
        texte: p.texte, aujourdhui: auJour(0, now), maintenant: `${z(now.getHours())}:${z(now.getMinutes())}`,
        noms: p.noms, proprio: p.proprio, prevu: contexte(p.taches, now),
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new ErreurEcho("Pas de connexion avec Echo.");
  }
  const corps = await r.json().catch(() => null);
  if (!r.ok || !corps || !Array.isArray(corps.taches)) throw new ErreurEcho(MESSAGES[corps?.erreur] ?? MESSAGES.service);
  return corps as PropositionEcho;
}

// Une tâche proposée par Echo, telle que l'app l'enregistre.
export function versBrouillon(t: TacheEcho): Brouillon {
  const b: Brouillon = {
    titre: t.titre, qui: t.qui, jour: t.jour, heure: t.heure, repete: t.repete,
    niveau: t.important ? 2 : null, note: "",
  };
  if (t.etapes.length) b.etapes = t.etapes.map((texte, i) => ({ id: nouvelId() + i, texte, fait: false }));
  if (t.evenement && t.heure) { b.evt = true; if (t.fin) b.fin = t.fin; }
  return b;
}

// Un tour de la boucle d'Echo (src/lib/echo/boucle.ts) : la conversation part au serveur, la réponse de Claude revient.
export function appelerServeur(code: string): Appeler {
  return async (corps) => {
    let r: Response;
    try {
      r = await fetch(ADRESSE_ECHO, { method: "POST", headers: await entetesIA(code), body: JSON.stringify(corps), signal: AbortSignal.timeout(30000) });
    } catch {
      throw new ErreurEcho("Pas de connexion avec Echo.");
    }
    const c = await r.json().catch(() => null);
    if (!r.ok || !c || !Array.isArray(c.content)) throw new ErreurEcho(MESSAGES[c?.erreur] ?? MESSAGES.service);
    return c as Tour;
  };
}
