// Lit une photo de la fiche d'horaires et renvoie les codes d'une personne, jour par jour.
// La clé Anthropic reste ici (secret ANTHROPIC_API_KEY) : elle n'est jamais dans l'app.
// Qui peut l'appeler : un membre connecté d'un foyer, ou le code secret du foyer (voir ../_shared/garde.ts). Appels comptés.
import Anthropic from "npm:@anthropic-ai/sdk@1.12.0";
import { garder } from "../_shared/garde.ts";

const ORIGINES = ["https://dmeloz.github.io", "http://localhost:5173", "http://localhost:4173"];
const MAX_IMAGE = 7_000_000; // caractères base64 (~5 Mo)
const CODES = ["C1", "C2", "C3", "C4", "C5", "C6", "R", "VAC", "CHR", "AUTRE", "VIDE"] as const;
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ligne_trouvee", "nom_lu", "mois_concorde", "jours", "remarque"],
  properties: {
    ligne_trouvee: { type: "boolean" },
    nom_lu: { type: "string" },
    mois_concorde: { type: "boolean" },
    jours: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["jour", "code", "sur"],
        properties: { jour: { type: "integer" }, code: { type: "string", enum: CODES }, sur: { type: "boolean" } },
      },
    },
    remarque: { type: "string" },
  },
};

const CONSIGNE = (nom: string, mois: string, nbJours: number, premier: string) => `Tu lis la photo d'une fiche d'horaires de cuisine (tableau Excel imprimé).
Chaque ligne est un employé (numéro et NOM Prénom), chaque jour a deux cases : AM (matin) et PM (après-midi). Les colonnes portent le jour de la semaine et le numéro du jour.
Le titre de la feuille peut être faux ou barré : fie-toi aux en-têtes des colonnes.

Trouve la ligne de l'employé « ${nom} » et lis ses ${nbJours} jours du mois ${mois} (le 1er est un ${premier}). La fiche peut être coupée en deux tableaux l'un sous l'autre : lis les deux.
Pour chaque jour, donne UN code :
- C1, C2, C3, C4, C5, C6 tels qu'écrits (« C1/8H » compte comme C1) ;
- R pour « Repos » ; VAC pour « VAC » ; CHR pour « CHR » ;
- AUTRE pour tout autre mot (FOR, EPM, un nom de lieu…) ;
- VIDE si le jour n'est pas sur la photo ou que la case est vide.
Si AM et PM diffèrent, prends le code de travail (C1 à C6) plutôt que Repos, sinon celui du matin.
Mets sur=false quand la case est floue, cachée ou que tu hésites, même un peu. Ne devine pas en silence.
mois_concorde = false si les jours de la semaine des en-têtes ne correspondent pas à ce mois.
Dans remarque, une phrase courte en français pour l'utilisateur (vide si tout est net).`;

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


Deno.serve(async (req) => {
  const origine = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origine) });
  if (req.method !== "POST") return repondre({ erreur: "methode" }, 405, origine);

  if (!Deno.env.get("ANTHROPIC_API_KEY")) return repondre({ erreur: "cle" }, 503, origine);
  const g = await garder(req, "lire-horaires", { parPersonne: 15, tous: 40 });
  if (!g.ok) return repondre({ erreur: g.erreur }, g.statut, origine);

  let corps: { image?: string; type?: string; nom?: string; mois?: string };
  try { corps = await req.json(); } catch { return repondre({ erreur: "requete" }, 400, origine); }
  const { image, type, nom, mois } = corps;
  if (typeof image !== "string" || !image || image.length > MAX_IMAGE) return repondre({ erreur: "image" }, 400, origine);
  if (!TYPES.includes(type as typeof TYPES[number])) return repondre({ erreur: "image" }, 400, origine);
  if (typeof nom !== "string" || nom.trim().length < 2 || nom.length > 60) return repondre({ erreur: "nom" }, 400, origine);
  if (typeof mois !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) return repondre({ erreur: "mois" }, 400, origine);

  const [a, m] = mois.split("-").map(Number);
  const nbJours = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const premier = new Date(Date.UTC(a, m - 1, 1)).toLocaleDateString("fr-FR", { weekday: "long", timeZone: "UTC" });

  const client = new Anthropic();
  try {
    const reponse = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: type as typeof TYPES[number], data: image } },
          { type: "text", text: CONSIGNE(nom.trim(), mois, nbJours, premier) },
        ],
      }],
    });
    if (reponse.stop_reason === "refusal") return repondre({ erreur: "refus" }, 422, origine);
    if (reponse.stop_reason === "max_tokens") return repondre({ erreur: "lecture" }, 502, origine);
    const texte = reponse.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const lu = JSON.parse(texte);
    return repondre({ ...lu, nbJours }, 200, origine);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return repondre({ erreur: "cle" }, 503, origine);
    if (e instanceof Anthropic.RateLimitError) return repondre({ erreur: "occupe" }, 429, origine);
    if (e instanceof Anthropic.BadRequestError) return repondre({ erreur: "image" }, 400, origine);
    if (e instanceof Anthropic.APIError) return repondre({ erreur: "service" }, 502, origine);
    if (e instanceof SyntaxError) return repondre({ erreur: "lecture" }, 502, origine);
    return repondre({ erreur: "service" }, 502, origine);
  }
});
