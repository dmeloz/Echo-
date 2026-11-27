// Lit la photo d'un ticket de caisse et renvoie ses produits, en clair, avec l'endroit où ils se rangent.
// La clé Anthropic reste ici (secret ANTHROPIC_API_KEY) : elle n'est jamais dans l'app. La photo n'est pas gardée.
// Qui peut l'appeler : un membre connecté d'un foyer, ou le code secret du foyer (voir ../_shared/garde.ts). Appels comptés.
import Anthropic from "npm:@anthropic-ai/sdk@1.12.0";
import { garder } from "../_shared/garde.ts";

const ORIGINES = ["https://dmeloz.github.io", "http://localhost:5173", "http://localhost:4173"];
const MAX_IMAGE = 7_000_000; // caractères base64 (~5 Mo)
const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const LIEUX = ["frigo", "congelateur", "placard", "maison", "aucun"] as const;
const MAX_LIGNES = 80, MAX_COURSES = 80;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["lisible", "magasin", "date", "total", "monnaie", "lignes", "remarque"],
  properties: {
    lisible: { type: "boolean" },
    magasin: { type: "string" },
    date: { type: "string" },
    total: { type: "number" },
    monnaie: { type: "string" },
    lignes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nom", "qte", "prix", "lieu", "jours", "course", "sur"],
        properties: {
          nom: { type: "string" },
          qte: { type: "string" },
          prix: { type: "number" },
          lieu: { type: "string", enum: LIEUX },
          jours: { type: "integer" },
          course: { type: "string" },
          sur: { type: "boolean" },
        },
      },
    },
    remarque: { type: "string" },
  },
};

const CONSIGNE = (courses: string[]) => `Tu lis la photo d'un ticket de caisse (supermarché, souvent en Suisse ou en France).
Donne une ligne par produit acheté, dans l'ordre du ticket.

Pour chaque ligne :
- nom : le produit en clair, en français courant, sans marque ni code (« M-CLAS LAIT DR 1L » devient « Lait demi-écrémé »). Première lettre en majuscule, 40 caractères au plus.
- qte : la quantité si elle est écrite (« 2 », « 500 g », « 1 L »), sinon vide.
- prix : le prix payé pour la ligne, rabais de la ligne déduit. 0 si illisible.
- lieu : où ça se range à la maison : frigo, congelateur, placard (épicerie, boissons, pain), maison (ménage, hygiène), ou aucun pour ce qui ne se stocke pas (sac, consigne, journal, plat mangé tout de suite, carte cadeau).
- jours : pour un produit frais du frigo, le nombre de jours pendant lesquels il se garde en général (viande et poisson crus 2, salade en sachet 4, yaourts 14…). 0 pour tout le reste ou si tu ne sais pas.
- course : si ce produit correspond à un article de la liste de courses ci-dessous, recopie cet article EXACTEMENT ; sinon vide. Un article ne sert qu'une fois.
- sur : false si la ligne est floue, coupée ou si tu hésites sur le produit.

N'invente aucun produit. Ignore les lignes qui ne sont pas des produits (sous-totaux, TVA, moyen de paiement, points de fidélité). Un rabais global n'est pas une ligne.
magasin : l'enseigne (« Migros », « Coop »…), vide si absente. date : la date du ticket au format AAAA-MM-JJ, vide si illisible. total : le total payé, 0 si illisible. monnaie : CHF ou EUR selon le ticket.
lisible = false si la photo n'est pas un ticket de caisse ou qu'on ne peut rien y lire (alors lignes est vide).
remarque : une phrase courte en français pour l'utilisateur si le ticket est coupé ou flou, sinon vide.

Liste de courses :
${courses.length ? courses.map((c) => `- ${c}`).join("\n") : "(vide)"}`;

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

const texte = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, max) : "");
const montant = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 && x < 100_000 ? Math.round(x * 100) / 100 : 0);

// Une vraie date du calendrier (« 2026-11-31 » n'en est pas une).
function vraiJour(j: string) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(j) ? new Date(j + "T12:00:00Z") : null;
  return !!d && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === j;
}

// On ne fait pas confiance à la réponse : tailles bornées, lieux connus, et un article de la liste ne sert qu'une fois.
function nettoyer(lu: unknown, courses: string[]) {
  const o = (lu && typeof lu === "object" ? lu : {}) as Record<string, unknown>;
  const libres = new Set(courses);
  const brutes = Array.isArray(o.lignes) ? o.lignes : [];
  const lignes = brutes.slice(0, MAX_LIGNES).flatMap((l) => {
    const x = (l && typeof l === "object" ? l : {}) as Record<string, unknown>;
    const nom = texte(x.nom, 40);
    if (!nom) return [];
    const lieu = LIEUX.find((k) => k === x.lieu) ?? "aucun";
    const jours = lieu === "frigo" && Number.isInteger(x.jours) && (x.jours as number) > 0 && (x.jours as number) <= 60 ? (x.jours as number) : 0;
    const course = typeof x.course === "string" && libres.delete(x.course) ? x.course : "";
    return [{ nom, qte: texte(x.qte, 20), prix: montant(x.prix), lieu, jours, course, sur: x.sur !== false }];
  });
  const date = texte(o.date, 10);
  return {
    lisible: o.lisible === true && lignes.length > 0,
    magasin: texte(o.magasin, 40),
    date: vraiJour(date) ? date : "",
    total: montant(o.total),
    monnaie: o.monnaie === "EUR" ? "EUR" : "CHF",
    lignes,
    remarque: brutes.length > MAX_LIGNES ? "Ticket très long : seules les 80 premières lignes sont lues." : texte(o.remarque, 200),
  };
}

Deno.serve(async (req) => {
  const origine = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origine) });
  if (req.method !== "POST") return repondre({ erreur: "methode" }, 405, origine);

  const g = await garder(req, "lire-ticket", { parPersonne: 15, tous: 40 });
  if (!g.ok) return repondre({ erreur: g.erreur }, g.statut, origine);
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return repondre({ erreur: "cle" }, 503, origine);

  let corps: { image?: string; type?: string; courses?: unknown };
  try { corps = await req.json(); } catch { return repondre({ erreur: "requete" }, 400, origine); }
  const { image, type } = corps;
  if (typeof image !== "string" || !image || image.length > MAX_IMAGE) return repondre({ erreur: "image" }, 400, origine);
  if (!TYPES.includes(type as typeof TYPES[number])) return repondre({ erreur: "image" }, 400, origine);
  // Les articles de la liste : du texte court, sans retour à la ligne (ils sont recopiés dans la consigne).
  const courses = [...new Set((Array.isArray(corps.courses) ? corps.courses : []).slice(0, MAX_COURSES)
    .map((c) => texte(c, 60)).filter(Boolean))];

  const client = new Anthropic();
  try {
    const reponse = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 12000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: type as typeof TYPES[number], data: image } },
          { type: "text", text: CONSIGNE(courses) },
        ],
      }],
    });
    if (reponse.stop_reason === "refusal") return repondre({ erreur: "refus" }, 422, origine);
    if (reponse.stop_reason === "max_tokens") return repondre({ erreur: "lecture" }, 502, origine);
    const brut = reponse.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return repondre(nettoyer(JSON.parse(brut), courses), 200, origine);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return repondre({ erreur: "cle" }, 503, origine);
    if (e instanceof Anthropic.RateLimitError) return repondre({ erreur: "occupe" }, 429, origine);
    if (e instanceof Anthropic.BadRequestError) return repondre({ erreur: "image" }, 400, origine);
    if (e instanceof SyntaxError) return repondre({ erreur: "lecture" }, 502, origine);
    return repondre({ erreur: "service" }, 502, origine);
  }
});
