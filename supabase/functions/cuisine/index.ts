// Cuisine : Echo propose les repas du soir d'une semaine (et la gamelle du midi) pour le foyer.
// Il ne décide rien : l'app montre la proposition, on change un plat ou on valide.
// Modèle : Claude Haiku 5.5. La clé reste ici (secret ANTHROPIC_API_KEY), jamais dans l'app.
// Qui peut l'appeler : un membre connecté d'un foyer, ou le code secret du foyer (voir ../_shared/garde.ts). Appels comptés.
import Anthropic from "npm:@anthropic-ai/sdk@1.12.0";
import { garder } from "../_shared/garde.ts";

const ORIGINES = ["https://dmeloz.github.io", "http://localhost:5173", "http://localhost:4173"];
const MAX_JOURS = 7;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["repas", "reponse"],
  properties: {
    repas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["jour", "plat", "ingredients", "congele", "gamelle"],
        properties: {
          jour: { type: "string" },
          plat: { type: "string" },
          ingredients: {
            type: "array",
            items: { type: "object", additionalProperties: false, required: ["nom", "qte"], properties: { nom: { type: "string" }, qte: { type: "string" } } },
          },
          congele: { type: "boolean" },
          gamelle: { type: "string" },
        },
      },
    },
    reponse: { type: "string" },
  },
};

const CONSIGNE = `Tu es Echo, l'assistant d'un foyer de deux personnes, en Suisse romande. Tu proposes les repas du soir de la semaine, et la gamelle du midi quand quelqu'un en emporte une.
Le but du foyer : bien manger, économiser, ne pas manger dehors, ne rien gaspiller.

Règles du foyer, à respecter toujours :
- JAMAIS de porc, sous aucune forme (pas de jambon, lardons, bacon, saucisse de porc, chorizo, saindoux, gélatine de porc).
- Respecte ce que chacun ne mange pas ou n'aime pas. Sers-toi de ce que chacun aime, sans le répéter toute la semaine.
- Tout est cuisiné en une fois le dimanche (batch cooking), puis réchauffé. Les repas de lundi, mardi et mercredi se gardent au frigo. Ceux de jeudi et vendredi doivent très bien se congeler : mets congele à true pour eux, false pour les autres. Samedi et dimanche, si on te les demande : un repas frais et simple, congele false.
- Choisis des plats qui partagent des bases (un même riz, une même sauce tomate, des légumes rôtis) pour que le dimanche reste court. Des plats de tous les jours, de saison, pas chers.
- Utilise d'abord ce qui est au stock, surtout ce qui est à manger vite.
- Ne repropose pas les plats récents ni ceux à éviter. Varie : pas deux soirs de suite la même viande ou le même féculent.

Pour chaque jour demandé, et seulement ceux-là, donne :
- jour : la date AAAA-MM-JJ, telle qu'on te l'a donnée.
- plat : le nom du plat, court, commence par une majuscule (« Curry de pois chiches », « Poulet rôti, riz, légumes »).
- ingredients : ce qu'il faut pour le nombre de portions du soir, plus une portion si une gamelle est prévue le lendemain avec ce plat. nom au pluriel courant, en minuscules (« carottes », « lait de coco ») ; qte courte (« 500 g », « 2 », « 1 boîte »). Ne mets pas le sel, le poivre, l'huile ni l'eau. Au plus 10 ingrédients.
- gamelle : si une gamelle est demandée ce jour-là, ce qu'elle contient, en quelques mots. Le plus économe : la portion en plus du plat de la veille (« Chili de mardi »). Le lundi : un plat du batch. Si la personne ne peut pas réchauffer, une gamelle qui se mange froide. Sinon "".
Un soir à 0 portion : personne ne mange à la maison, ne propose rien pour ce jour (ne le mets pas dans repas), sauf si une gamelle est demandée.

reponse : une phrase courte et chaleureuse, en tutoyant, qui résume la semaine (« Une semaine autour du riz et des légumes rôtis, avec le curry jeudi au congélateur. »).`;

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
const court = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");
// deno-lint-ignore no-explicit-any
const liste = (x: unknown, max: number): any[] => (Array.isArray(x) ? x.slice(0, max) : []);
// Jamais de porc. On regarde le début des mots (« jambonneau », « saucisses ») ; une version à la volaille ou au bœuf est permise.
const PORC = /(^|[^a-zà-ÿœ])(porc|cochon|jambon|lard|bacon|chorizo|saucisse|saucisson|saindoux|pancetta|coppa|rillette|cervelas|salami|prosciutto|mortadelle|andouill|boudin|speck|guanciale|travers|cordon bleu|knacki|wienerli)/i;
const PERMIS = /(jambon|bacon|lardons?|saucisses?|saucisson|chorizo|salami|cervelas|rillettes?)\s+(de|d'|à la|au)\s*(dinde|volaille|poulet|b[oœ]uf|boeuf|veau|agneau|canard|oie|thon|saumon)/gi;
const aDuPorc = (t: string) => PORC.test(t.replace(PERMIS, " "));

// Ce que le modèle renvoie est vérifié : seulement les jours demandés, une fois chacun, et jamais de porc.
// deno-lint-ignore no-explicit-any
function nettoyer(lu: any, demandes: Set<string>) {
  const vus = new Set<string>();
  // deno-lint-ignore no-explicit-any
  const repas = liste(lu?.repas, MAX_JOURS).flatMap((r: any) => {
    const plat = court(r?.plat, 80), jour = r?.jour;
    if (!plat || typeof jour !== "string" || !demandes.has(jour) || vus.has(jour)) return [];
    // deno-lint-ignore no-explicit-any
    const ingredients = liste(r?.ingredients, 12).map((i: any) => ({ nom: court(i?.nom, 60), qte: court(i?.qte, 20) })).filter((i) => i.nom);
    if (aDuPorc(plat) || ingredients.some((i) => aDuPorc(i.nom))) return [];
    vus.add(jour);
    const gamelle = court(r?.gamelle, 80);
    return [{ jour, plat, ingredients, congele: r?.congele === true, gamelle: aDuPorc(gamelle) ? "" : gamelle }];
  });
  return { repas, reponse: court(lu?.reponse, 300) };
}

Deno.serve(async (req) => {
  const origine = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(origine) });
  if (req.method !== "POST") return repondre({ erreur: "methode" }, 405, origine);

  const g = await garder(req, "cuisine", { parPersonne: 20, tous: 60 });
  if (!g.ok) return repondre({ erreur: g.erreur }, g.statut, origine);
  if (!Deno.env.get("ANTHROPIC_API_KEY")) return repondre({ erreur: "cle" }, 503, origine);

  // deno-lint-ignore no-explicit-any
  let d: any;
  try { d = await req.json(); } catch { return repondre({ erreur: "requete" }, 400, origine); }
  // deno-lint-ignore no-explicit-any
  const jours = liste(d?.jours, MAX_JOURS).filter((j: any) => typeof j?.jour === "string" && JOUR.test(j.jour)).map((j: any) => ({
    jour: j.jour as string, soir: Math.max(0, Math.min(4, Number(j.soir) || 0)), gamelle: j.gamelle === true,
  })).filter((j) => j.soir > 0 || j.gamelle);
  if (!jours.length) return repondre({ erreur: "requete" }, 400, origine);

  // deno-lint-ignore no-explicit-any
  const gouts = liste(d?.gouts, 4).map((x: any) => ({
    prenom: court(x?.prenom, 30), aime: liste(x?.aime, 20).map((a) => court(a, 30)).filter(Boolean), evite: court(x?.evite, 200),
    rechauffe: ["oui", "non", "pas"].includes(x?.rechauffe) ? x.rechauffe : "",
  })).filter((x) => x.prenom);
  // deno-lint-ignore no-explicit-any
  const stock = liste(d?.stock, 40).map((p: any) => ({ nom: court(p?.nom, 60), avant: JOUR.test(p?.avant ?? "") ? p.avant : "" })).filter((p) => p.nom);
  const noms = (x: unknown, n: number) => liste(x, n).map((p) => court(p, 80)).filter(Boolean);
  const recents = noms(d?.recents, 20), eviter = noms(d?.eviter, 20);
  // deno-lint-ignore no-explicit-any
  const gardes = liste(d?.gardes, 7).map((r: any) => ({ jour: JOUR.test(r?.jour ?? "") ? r.jour : "", plat: court(r?.plat, 80) })).filter((r) => r.jour && r.plat);
  const mangeur = court(d?.gamellePour, 30);

  const nomJour = (j: string) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", timeZone: "UTC" });
  const situation = [
    `Les jours à prévoir :\n${jours.map((j) => `- ${nomJour(j.jour)} ${j.jour} : soir ${j.soir} portion${j.soir > 1 ? "s" : ""}${j.gamelle ? `, gamelle du midi${mangeur ? ` pour ${mangeur}` : ""}` : ""}`).join("\n")}`,
    gouts.length ? `Les goûts :\n${gouts.map((x) => `- ${x.prenom} aime : ${x.aime.join(", ") || "pas précisé"}. Ne mange pas ou n'aime pas : ${x.evite || "rien de précisé"}.${x.rechauffe === "non" ? " Ne peut PAS réchauffer au travail." : x.rechauffe === "oui" ? " Peut réchauffer au travail." : ""}`).join("\n")}` : "Goûts : pas encore donnés.",
    stock.length ? `Au stock :\n${stock.map((p) => `- ${p.nom}${p.avant ? ` (à manger avant le ${p.avant})` : ""}`).join("\n")}` : "Stock : rien de noté.",
    gardes.length ? `Déjà décidé cette semaine (ne change pas, sers-t'en pour varier et pour les gamelles) :\n${gardes.map((r) => `- ${nomJour(r.jour)} ${r.jour} : ${r.plat}`).join("\n")}` : "",
    recents.length ? `Plats récents, à ne pas reproposer : ${recents.join(" ; ")}.` : "",
    eviter.length ? `À éviter cette fois (la personne veut autre chose) : ${eviter.join(" ; ")}.` : "",
  ].filter(Boolean).join("\n\n");

  const client = new Anthropic();
  try {
    const reponse = await client.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 6000,
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      system: CONSIGNE,
      messages: [{ role: "user", content: situation }],
    });
    if (reponse.stop_reason === "refusal") return repondre({ erreur: "refus" }, 422, origine);
    if (reponse.stop_reason === "max_tokens") return repondre({ erreur: "lecture" }, 502, origine);
    const brut = reponse.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return repondre(nettoyer(JSON.parse(brut), new Set(jours.map((j) => j.jour))), 200, origine);
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return repondre({ erreur: "cle" }, 503, origine);
    if (e instanceof Anthropic.RateLimitError) return repondre({ erreur: "occupe" }, 429, origine);
    if (e instanceof Anthropic.BadRequestError) return repondre({ erreur: "requete" }, 400, origine);
    if (e instanceof Anthropic.APIError) return repondre({ erreur: "service" }, 502, origine);
    if (e instanceof SyntaxError) return repondre({ erreur: "lecture" }, 502, origine);
    return repondre({ erreur: "service" }, 502, origine);
  }
});
