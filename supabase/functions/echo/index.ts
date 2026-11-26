// L'assistant Echo : comprend une phrase libre (« dentiste jeudi 15h pour Sarah, et rappelle-moi les poubelles chaque mardi »)
// et propose des tâches. Il ne fait rien lui-même : l'app montre la proposition et c'est la personne qui confirme.
// Modèle : Claude Haiku 5.5 (rapide et peu cher). La clé reste ici (secret ANTHROPIC_API_KEY), jamais dans l'app.
// Qui peut l'appeler : un membre connecté d'un foyer, ou le code secret du foyer (voir ../_shared/garde.ts). Appels comptés.
import Anthropic from "npm:@anthropic-ai/sdk@1.12.0";
import { garder } from "../_shared/garde.ts";

const ORIGINES = ["https://dmeloz.github.io", "http://localhost:5173", "http://localhost:4173"];
const MAX_TEXTE = 1000;
const MAX_TACHES = 8;
const MAX_CONTEXTE = 40;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["taches", "reponse"],
  properties: {
    taches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["titre", "jour", "heure", "qui", "repete", "important", "evenement", "fin", "etapes"],
        properties: {
          titre: { type: "string" },
          jour: { type: "string" },
          heure: { type: "string" },
          qui: { type: "string", enum: ["moi", "elle", "nous"] },
          repete: { type: "string", enum: ["", "jour", "semaine"] },
          important: { type: "boolean" },
          evenement: { type: "boolean" },
          fin: { type: "string" },
          etapes: { type: "array", items: { type: "string" } },
        },
      },
    },
    reponse: { type: "string" },
  },
};

const CONSIGNE = `Tu es Echo, l'assistant d'un foyer de deux personnes. On t'écrit (ou on te dicte) une phrase en français, souvent courte, parfois avec des fautes.
Ton seul travail : transformer la phrase en tâches ou rendez-vous à ajouter. Tu ne fais rien d'autre et tu n'inventes rien.

Pour chaque chose à faire ou à retenir, donne :
- titre : court et clair, commence par une majuscule, sans le jour, l'heure ni la personne (« Appeler le garage », « Dentiste »).
- jour : AAAA-MM-JJ. Calcule-le à partir de la date du jour donnée. Sans jour dit : aujourd'hui. Un jour de la semaine sans précision = le prochain (si c'est aujourd'hui et que l'heure est passée, la semaine suivante).
- heure : HH:MM sur 24 h, ou "" si aucune heure n'est dite. « ce matin » 09:00, « midi » 12:00, « cet après-midi » 14:00, « ce soir » 19:00.
- qui : "moi", "elle" ou "nous", selon les places données plus bas. Sans précision : la personne qui écrit. « nous », « ensemble », « tous les deux » : "nous".
- repete : "jour" (chaque jour), "semaine" (chaque semaine, chaque mardi…), sinon "".
- important : true seulement si la phrase le dit (urgent, important, à ne pas oublier, !) ou si c'est une facture, un impôt, une échéance.
- evenement : true pour un rendez-vous à une heure précise (médecin, dentiste, réunion, anniversaire, rendez-vous, sortie), false pour une chose à faire et cocher.
- fin : HH:MM de fin si elle est dite (« de 14h à 16h »), sinon "".
- etapes : les sous-étapes seulement si la phrase en donne plusieurs pour une même chose (une liste de courses pour un même achat, par exemple), sinon [].

Plusieurs choses dans la phrase = plusieurs tâches. Au plus ${MAX_TACHES}.
reponse : une phrase très courte et chaleureuse pour la personne, en la tutoyant, qui dit ce que tu proposes (« Je note le dentiste jeudi à 15 h pour Sarah. »).
Si la phrase n'est pas une chose à noter (une question, une salutation, un texte incompréhensible), renvoie taches: [] et dis dans reponse, gentiment, que pour l'instant tu sais seulement noter des tâches et des rendez-vous.
Les tâches déjà prévues te sont données pour le contexte seulement : ne les recopie pas.`;

function cors(origine: string | null) {
  return {
    "Access-Control-Allow-Origin": origine && ORIGINES.includes(origine) ? origine : ORIGINES[0],
    "Access-Control-Allow-Headers": "content-type, x-echo-code, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const repondre = (corps: unknown, statut: number, origine: string | null) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...cors(origine), "Content-Type": "application/json" } });


const JOUR = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
const court = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");

interface Contexte { titre: string; jour: string; heure: string; qui: string }
interface Demande { texte?: unknown; aujourdhui?: unknown; maintenant?: unknown; noms?: { moi?: unknown; elle?: unknown }; proprio?: unknown; prevu?: unknown }

// Ce que le modèle renvoie est vérifié champ par champ : une tâche mal formée est écartée, jamais devinée.
// deno-lint-ignore no-explicit-any
function nettoyer(lu: any, proprio: "moi" | "elle") {
  const taches = (Array.isArray(lu?.taches) ? lu.taches : []).slice(0, MAX_TACHES).flatMap((t: any) => {
    const titre = court(t?.titre, 120);
    if (!titre || !JOUR.test(t?.jour ?? "")) return [];
    const heure = HEURE.test(t?.heure ?? "") ? t.heure : "";
    return [{
      titre, jour: t.jour, heure,
      qui: ["moi", "elle", "nous"].includes(t?.qui) ? t.qui : proprio,
      repete: ["jour", "semaine"].includes(t?.repete) ? t.repete : "",
      important: t?.important === true,
      evenement: t?.evenement === true && !!heure,
      fin: heure && HEURE.test(t?.fin ?? "") && t.fin > heure ? t.fin : "",
      etapes: (Array.isArray(t?.etapes) ? t.etapes : []).map((e: unknown) => court(e, 120)).filter(Boolean).slice(0, 12),
    }];
  });
  const recues = Array.isArray(lu?.taches) ? Math.min(lu.taches.length, MAX_TACHES) : 0;
  const reponse = court(lu?.reponse, 300);
  // Une tâche écartée : on ne laisse pas la réponse promettre ce qui n'est pas dans la liste.
  if (taches.length < recues) return { taches, reponse: taches.length ? "Voici ce que j'ai compris. Une partie de ta phrase m'a échappé : ajoute-la à part." : "Je n'ai pas bien compris. Reformule ta phrase." };
  return { taches, reponse };
}

Deno.serve(async (req) => {
  const origine = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origine) });
  if (req.method !== "POST") return repondre({ erreur: "methode" }, 405, origine);

  if (!Deno.env.get("ANTHROPIC_API_KEY")) return repondre({ erreur: "cle" }, 503, origine);
  const g = await garder(req, "echo", { parPersonne: 60, tous: 200 });
  if (!g.ok) return repondre({ erreur: g.erreur }, g.statut, origine);

  let d: Demande;
  try { d = await req.json(); } catch { return repondre({ erreur: "requete" }, 400, origine); }
  const texte = court(d.texte, MAX_TEXTE);
  if (!texte) return repondre({ erreur: "texte" }, 400, origine);
  if (typeof d.aujourdhui !== "string" || !JOUR.test(d.aujourdhui)) return repondre({ erreur: "requete" }, 400, origine);
  const maintenant = typeof d.maintenant === "string" && HEURE.test(d.maintenant) ? d.maintenant : "";
  const moi = court(d.noms?.moi, 30) || "moi", elle = court(d.noms?.elle, 30) || "l'autre";
  const proprio = d.proprio === "elle" ? "elle" : "moi";
  const prevu: Contexte[] = (Array.isArray(d.prevu) ? d.prevu : []).slice(0, MAX_CONTEXTE).map((t: Contexte) => ({
    titre: court(t?.titre, 80), jour: JOUR.test(t?.jour ?? "") ? t.jour : "", heure: HEURE.test(t?.heure ?? "") ? t.heure : "", qui: court(t?.qui, 5),
  })).filter((t: Contexte) => t.titre && t.jour);

  const jourSemaine = new Date(`${d.aujourdhui}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", timeZone: "UTC" });
  const situation = [
    `Aujourd'hui : ${jourSemaine} ${d.aujourdhui}${maintenant ? `, il est ${maintenant}` : ""}.`,
    `Places du foyer : "moi" = ${moi}, "elle" = ${elle}. La personne qui écrit est ${proprio === "moi" ? moi : elle} (place "${proprio}").`,
    prevu.length ? `Déjà prévu (contexte) :\n${prevu.map((t) => `- ${t.jour}${t.heure ? ` ${t.heure}` : ""} · ${t.titre} (${t.qui})`).join("\n")}` : "Rien d'autre de prévu.",
  ].join("\n");

  const client = new Anthropic();
  try {
    const reponse = await client.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 4000,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: CONSIGNE,
      messages: [{ role: "user", content: `${situation}\n\nLa phrase :\n${texte}` }],
    });
    if (reponse.stop_reason === "refusal") return repondre({ erreur: "refus" }, 422, origine);
    if (reponse.stop_reason === "max_tokens") return repondre({ erreur: "lecture" }, 502, origine);
    const brut = reponse.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return repondre(nettoyer(JSON.parse(brut), proprio), 200, origine);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return repondre({ erreur: "cle" }, 503, origine);
    if (e instanceof Anthropic.RateLimitError) return repondre({ erreur: "occupe" }, 429, origine);
    if (e instanceof Anthropic.BadRequestError) return repondre({ erreur: "requete" }, 400, origine);
    if (e instanceof Anthropic.APIError) return repondre({ erreur: "service" }, 502, origine);
    if (e instanceof SyntaxError) return repondre({ erreur: "lecture" }, 502, origine);
    return repondre({ erreur: "service" }, 502, origine);
  }
});
