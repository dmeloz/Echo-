import { db } from "../../data/db";
import { auJour, nouvelId, z } from "../dates";
import { MAX_CONVERSATION, MAX_MESSAGES, MAX_PHRASE, MAX_RESULTAT, MAX_SITUATION, MAX_TOURS } from "../../../supabase/functions/_shared/echo-outils";
import { genreFinal, type Action, type ContexteEcho, type Executant } from "./outils";
import { garderRetours, oublierRetours, suivre } from "./retour";
import { lireMemoire, memoirePourEcho, type Souvenir } from "./memoire";

// La boucle d'Echo. La phrase part au serveur (qui garde la clé et parle à Claude). Claude répond par du texte,
// ou demande des outils : l'app les exécute ici, sur ses données, et renvoie le résultat. Jusqu'à MAX_TOURS fois.
// Les actions qui changent quelque chose sont gardées de côté et montrées à la personne à la fin (« Oui » / « Non »),
// sauf les petites choses quand le réglage « Petites choses sans demander » est allumé.

// La forme des messages échangés avec le serveur (celle de l'API de Claude, réduite à ce qu'on utilise).
export type Bloc =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: string; [k: string]: unknown }; // la réflexion de Claude, renvoyée telle quelle
export interface ResultatOutil { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
export type Message = { role: "user"; content: string | ResultatOutil[] } | { role: "assistant"; content: Bloc[] };
export interface Tour { content: Bloc[]; stop_reason: string }
export type Appeler = (corps: { mode: "agent"; situation: string; messages: Message[]; outils: string[] }, enDirect?: (texte: string) => void) => Promise<Tour>;

export interface Faite { action: Action; annuler: () => Promise<unknown>; ligne: string }
export interface ResultatEcho {
  reponse: string;
  aConfirmer: Action[];
  faites: Faite[]; // déjà faites (petites choses sans demander)
  // La discussion à reprendre pour la phrase suivante (null : elle s'est arrêtée en route, on repartira de zéro).
  suite: Message[] | null;
}

// Une discussion trop longue repart à neuf, avec un court rappel de la dernière réponse d'Echo.
// Bien en dessous de MAX_CONVERSATION : la phrase qui vient ajoutera ses propres résultats d'outils.
const TAILLE_MAX = 60_000;
// La phrase passe toujours entière (jusqu'à MAX_PHRASE) ; ce sont les notes de l'app qui sont raccourcies s'il le faut.
// Chaque note tient sur sa ligne et reste entière (le serveur les reconnaît ainsi) : c'est son texte qui est raccourci.
function avecNotes(notes: string[], phrase: string) {
  const p = phrase.slice(0, MAX_PHRASE);
  let place = MAX_PHRASE - p.length, avant = "";
  for (const n of notes.filter(Boolean)) {
    const texte = n.replace(/[\[\]\n\r]+/g, " ").trim().slice(0, Math.max(0, place - 30));
    if (!texte) break;
    const ligne = `[Note de l'app : ${texte}]\n`;
    avant += ligne;
    place -= ligne.length;
  }
  return avant + p;
}
function reprendre(avant: Message[], phrase: string, notes: string[]): Message[] {
  const place = avant.length + 1 + 2 * MAX_TOURS <= MAX_MESSAGES && JSON.stringify(avant).length < TAILLE_MAX;
  if (!avant.length || place) return [...avant, { role: "user", content: avecNotes(notes, phrase) }];
  const dernier = [...avant].reverse().find((m) => m.role === "assistant");
  const rappel = dernier ? texteDe(dernier.content as Bloc[]).slice(0, 600) : "";
  const [date, ...autres] = notes;
  return [{ role: "user", content: avecNotes([date, rappel && `la discussion a été raccourcie. Ta dernière réponse : « ${rappel} »`, ...autres], phrase) }];
}

// Ce qu'Echo sait du foyer : qui écrit, sa mémoire. Elle ne change presque jamais d'une phrase à l'autre : le début de la
// discussion reste ainsi le même, et Echo garde sa réflexion d'une phrase à l'autre (elle est liée à ce qui la précède).
export function situation(ctx: ContexteEcho, memoire: Souvenir[] = []) {
  const { moi, elle } = ctx.noms;
  const tete = `Le foyer : "moi" = ${moi}, "elle" = ${elle}. La personne qui écrit est ${ctx.noms[ctx.proprio]} (place "${ctx.proprio}").`;
  // La mémoire prend la place qui reste sous la limite du serveur (les souvenirs les plus récents d'abord).
  return `${tete}\n${memoirePourEcho(memoire, MAX_SITUATION - tete.length - 100)}`;
}
// La date et l'heure : elles partent avec chaque phrase (une note de l'app), là où elles ne changent plus ensuite.
export function maintenant(ctx: ContexteEcho) {
  const jour = ctx.now.toLocaleDateString("fr-FR", { weekday: "long" });
  return `aujourd'hui : ${jour} ${auJour(0, ctx.now)}, il est ${z(ctx.now.getHours())}:${z(ctx.now.getMinutes())}.`;
}

const texteDe = (blocs: Bloc[]) =>
  // Les retours à la ligne restent (un programme de la journée, une ligne par créneau).
  blocs.flatMap((b) => (b.type === "text" && typeof b.text === "string" ? [b.text] : [])).join("\n")
    .replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim();
const estOutil = (b: Bloc): b is Extract<Bloc, { type: "tool_use" }> =>
  b.type === "tool_use" && typeof b.id === "string" && typeof b.name === "string" && !!b.input && typeof b.input === "object";

export async function lancerEcho(phrase: string, ctx: ContexteEcho, o: {
  appeler: Appeler; outils: Record<string, Executant>; seul: boolean;
  // Une action faite sans demander : notée au journal tout de suite.
  noter?: (a: Action, phrase: string, ctx: ContexteEcho) => Promise<Faite>;
  // Où ranger ce qui est fait sans demander : l'appelant le garde même si un tour suivant échoue (pour proposer Annuler).
  faites?: Faite[];
  // La discussion jusque-là (Echo se souvient de ce qui a été dit), et la note de l'app sur la proposition précédente.
  discussion?: Message[];
  note?: string;
  // La réponse d'Echo pendant qu'il l'écrit (le texte du tour en cours ; "" quand un nouveau tour commence).
  enDirect?: (texte: string) => void;
}): Promise<ResultatEcho> {
  const messages: Message[] = reprendre(o.discussion ?? [], phrase, [maintenant(ctx), o.note ?? ""]);
  const outils = Object.keys(o.outils);
  const sit = situation(ctx, await lireMemoire());
  const aConfirmer: Action[] = [];
  const faites: Faite[] = o.faites ?? [];
  let dernierTexte = "";

  for (let tour = 0; tour < MAX_TOURS; tour++) {
    // Les résultats d'outils ont trop rempli la conversation : on s'arrête avec ce qu'on a (le serveur la refuserait).
    if (JSON.stringify(messages).length > MAX_CONVERSATION - 10_000) break;
    o.enDirect?.("");
    const r = await o.appeler({ mode: "agent", situation: sit, messages, outils }, o.enDirect);
    const blocs = Array.isArray(r.content) ? r.content : [];
    messages.push({ role: "assistant", content: blocs });
    // La réponse est le texte du dernier tour seulement (« Je regarde. » d'un tour précédent n'est pas une réponse).
    dernierTexte = texteDe(blocs);
    const demandes = blocs.filter(estOutil);
    // La discussion ne se garde que si elle finit par une vraie réponse (le serveur refuse une réponse vide ou un outil sans résultat).
    if (r.stop_reason !== "tool_use" || !demandes.length) return { reponse: dernierTexte, aConfirmer, faites, suite: blocs.length && !demandes.length ? messages : null };

    // Tous les résultats d'un tour partent ensemble, dans un seul message.
    const resultats: ResultatOutil[] = [];
    for (const d of demandes) {
      const ex = o.outils[d.name];
      const res = (content: unknown, erreur = false): ResultatOutil => {
        const c = typeof content === "string" ? content : JSON.stringify(content);
        // Le serveur refuse un résultat trop long : on le dit à Echo, qui peut demander moins de jours.
        if (c.length > MAX_RESULTAT) return { type: "tool_result", tool_use_id: d.id, content: "Trop long : demande moins de jours à la fois.", is_error: true };
        return { type: "tool_result", tool_use_id: d.id, content: c, ...(erreur ? { is_error: true } : {}) };
      };
      try {
        if (ex?.lire) { resultats.push(res(await ex.lire(d.input, ctx))); continue; }
        if (!ex?.preparer) { resultats.push(res("Outil inconnu.", true)); continue; }
        const a = await ex.preparer(d.input, ctx);
        if (typeof a === "string") { resultats.push(res(a, true)); continue; }
        a.genre = genreFinal(a);
        if (o.seul && a.genre === "petit" && o.noter) {
          const f = await o.noter(a, phrase, ctx);
          faites.push(f);
          resultats.push(res(`Fait : ${a.libelle}${a.details.length ? ` (${a.details.join(", ")})` : ""}.`));
          continue;
        }
        // Une 2e action sur la même tâche remplace la 1re.
        const i = a.cible ? aConfirmer.findIndex((x) => x.cible === a.cible) : -1;
        if (i >= 0) aConfirmer.splice(i, 1, a); else aConfirmer.push(a);
        resultats.push(res(`Proposé à ${ctx.noms[ctx.proprio]} : ${a.libelle}${a.details.length ? ` (${a.details.join(", ")})` : ""}. Ce sera fait s'il ou elle dit oui.`));
      } catch {
        resultats.push(res("L'app n'a pas pu faire cette action.", true));
      }
    }
    messages.push({ role: "user", content: resultats });
  }
  // Le serveur force une réponse au dernier tour ; si elle manque, on le dit simplement.
  return { reponse: dernierTexte || "J'ai dû m'arrêter là. Voici ce que j'ai préparé.", aConfirmer, faites, suite: null };
}

// Faire une action et la noter au journal. Annuler défait l'action et marque la ligne comme annulée.
export async function executer(a: Action, phrase: string, ctx: ContexteEcho): Promise<Faite> {
  // Les lignes touchées sont notées : l'action pourra s'annuler plus tard depuis le journal (retour.ts).
  const { resultat: defaire, retours } = await suivre(() => a.faire());
  const id = nouvelId();
  const ligne = [a.libelle, ...a.details].join(" · ");
  await db.echo_journal.add({ id, quand: Date.now(), par: ctx.noms[ctx.proprio], demande: phrase.slice(0, 1000), action: ligne.slice(0, 200), outil: a.outil });
  await garderRetours(id, retours).catch(() => {});
  return {
    action: a, ligne,
    annuler: async () => { await defaire(); await db.echo_journal.update(id, { annule: Date.now() }); await oublierRetours(id).catch(() => {}); },
  };
}
