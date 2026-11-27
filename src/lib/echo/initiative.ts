import { db } from "../../data/db";
import { MODULES, outilsEcho } from "../../modules/registre";
import { auJour } from "../dates";
import { genreDe } from "../../../supabase/functions/_shared/echo-outils";
import { lancerEcho, type Appeler } from "./boucle";
import type { ContexteEcho, Executant } from "./outils";
import type { Mot } from "./discussions";

// Echo prend l'initiative (réglage « Echo prend l'initiative », allumé par défaut) :
// 1. un petit mot le matin, la première fois qu'on ouvre l'app entre 5 h et midi (une fois par jour) ;
// 2. un message quand l'autre ajoute ou termine quelque chose (motDeLAutre dans discussions.ts, appelé par src/sync/moteur.ts, sans IA).
// Le mot arrive dans la discussion avec Echo, et un point sur l'étoile dit qu'il y a du nouveau.

const CLE_BONJOUR = "echo-bonjour";
export function aDireBonjour(now = new Date()) {
  const h = now.getHours();
  if (h < 5 || h >= 12) return false;
  try { return localStorage.getItem(CLE_BONJOUR) !== auJour(0, now); } catch { return false; }
}
// Noté avant d'appeler Echo : un seul essai par jour, même s'il échoue (pas de mot répété ni de dépense en boucle).
export function noterBonjour(now = new Date()) {
  try { localStorage.setItem(CLE_BONJOUR, auJour(0, now)); } catch { /* stockage fermé : tant pis pour aujourd'hui */ }
}

// Les réglages lus dans la base au moment même : Echo allumé, initiative permise. Rend les outils d'Echo (modules allumés), ou null.
export async function initiativePermise(): Promise<Record<string, Executant> | null> {
  const [actif, initiative, masques] = await Promise.all(["assistantEcho", "echoInitiative", "modulesMasques"].map((c) => db.reglages.get(c)));
  if (actif?.valeur === false || initiative?.valeur === false) return null;
  const caches = Array.isArray(masques?.valeur) ? (masques!.valeur as string[]) : [];
  return outilsEcho(MODULES.filter((m) => !caches.includes(m.id)));
}

// Ce qu'Echo reçoit à la place d'une phrase de la personne (rien de cela n'apparaît dans la discussion).
// La consigne part en note de l'app : la phrase reste courte, et Echo répond avec Haiku (pas de plan à faire).
export const PHRASE_BONJOUR = "Bonjour Echo !";
export const NOTE_BONJOUR = "c'est le matin, la personne vient d'ouvrir l'app et n'a encore rien écrit. Écris-lui un petit mot pour bien commencer : "
  + "bonjour, puis ce qui compte aujourd'hui pour elle (rendez-vous, travail, choses importantes), en deux ou trois phrases courtes. "
  + "Une seule idée utile si tu en vois une. Regarde son agenda avant. Ne propose aucune action.";

// Le mot du matin : Echo ne peut que regarder (aucun outil qui change quelque chose).
export async function motDuMatin(ctx: ContexteEcho, appeler: Appeler, outils: Record<string, Executant>): Promise<Mot | null> {
  const lecture = Object.fromEntries(Object.entries(outils).filter(([nom]) => genreDe(nom) === "lire"));
  const r = await lancerEcho(PHRASE_BONJOUR, ctx, { appeler, outils: lecture, seul: false, note: NOTE_BONJOUR });
  const texte = r.reponse.trim();
  if (!texte) return null;
  return { texte, note: `ce matin, tu as écrit de toi-même à ${ctx.noms[ctx.proprio]} : « ${texte.replace(/\s+/g, " ").slice(0, 400)} »` };
}
