import { nouvelId, sansAccents } from "../../lib/dates";
import type { Personne } from "../../lib/types";

// Les données du module Cuisine et tout ce qui se calcule sans toucher à la base :
// lire une phrase (« 2 citrons, du lait »), deviner le rayon, repérer les achats habituels.

export type Rayon = "fruits" | "boulangerie" | "frais" | "boucherie" | "epicerie" | "surgeles" | "boissons" | "maison" | "hygiene" | "autre";
// L'ordre des rayons = l'ordre du carrousel et du mode « Au magasin ».
export const RAYONS: Array<{ id: Rayon; nom: string }> = [
  { id: "fruits", nom: "Fruits et légumes" },
  { id: "boulangerie", nom: "Boulangerie" },
  { id: "frais", nom: "Frais" },
  { id: "boucherie", nom: "Boucherie et poisson" },
  { id: "epicerie", nom: "Épicerie" },
  { id: "surgeles", nom: "Surgelés" },
  { id: "boissons", nom: "Boissons" },
  { id: "maison", nom: "Maison" },
  { id: "hygiene", nom: "Hygiène" },
  { id: "autre", nom: "Autre" },
];
export const nomRayon = (r: Rayon) => RAYONS.find((x) => x.id === r)?.nom ?? "Autre";
const estRayon = (x: unknown): x is Rayon => RAYONS.some((r) => r.id === x);

export type Auteur = Personne | "echo"; // « echo » = un achat habituel remis tout seul
export interface Article { id: string; nom: string; qte: string; rayon: Rayon; par: Auteur; fait: number | null; faitPar?: Personne; cree: number }
// Ce qu'Echo retient d'un produit : son rayon, et quand on l'a acheté (pour le remettre tout seul).
export interface Habitude { cle: string; nom: string; qte: string; rayon: Rayon; achats: number[]; refus: number; pause?: number }
export interface Repas { jour: string; plat: string }
export type Lieu = "frigo" | "congelateur" | "placard" | "maison";
export const LIEUX: Array<{ id: Lieu; nom: string }> = [
  { id: "frigo", nom: "Frigo" }, { id: "congelateur", nom: "Congélateur" }, { id: "placard", nom: "Placard" }, { id: "maison", nom: "Maison" },
];
export interface Produit { id: string; nom: string; lieu: Lieu; avant?: string; cree: number }
export type Rechauffe = "" | "oui" | "non" | "pas";
export interface Gouts { qui: Personne; aime: string[]; evite: string; rechauffe: Rechauffe; maj: number }

/* ---------- Lire ce qu'on écrit ---------- */

// La clé d'un produit : sans accents, au singulier, pour reconnaître « Citrons » et « citron ».
export const cleDe = (nom: string) =>
  sansAccents(nom.replace(/œ/gi, "oe")).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean)
    .map((m) => (m.length > 3 ? m.replace(/(s|x)$/, "") : m)).join(" ");

const UNITES = "kg|g|gr|l|cl|ml|litres?|bouteilles?|bo[iî]tes?|paquets?|bottes?|pots?|sachets?|tranches?|briques?|packs?|barquettes?|filets?|douzaines?";
const QTE = new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(?:(${UNITES})\\b\\.?)?\\s*(?:de\\s+|d['’]\\s*)?(.+)$`, "i");
const QTE_FIN = new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${UNITES})?$`, "i");
const ARTICLE = /^(?:(?:un peu de|de la|du|des|de|les|le|la)\s+|(?:un peu d|de l|d|l)['’]\s*)/i;
const majuscule = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface Lu { nom: string; qte: string }
// « 2 citrons, du lait et 500 g de bœuf haché » → trois articles avec leur quantité.
export function lireArticles(texte: string): Lu[] {
  // « 1,5 kg » : la virgule d'un nombre ne sépare pas deux articles.
  return texte.replace(/(\d),(\d)/g, "$1.$2").split(/[,;\n]+|\s+et\s+|\s+puis\s+/i).map((brut) => {
    let s = brut.trim().replace(/\s+/g, " ").replace(/[.!]+$/, "").replace(/^une?\s+/i, "1 ");
    let qte = "";
    const dire = (n: string, u?: string) => (u ? `${n.replace(".", ",")} ${u.toLowerCase()}` : n.replace(".", ","));
    const m = s.match(QTE), fin = m ? null : s.match(QTE_FIN); // « 2 l de lait » ou « lait 2 l »
    if (m) { qte = dire(m[1], m[2]); s = m[3]; }
    else if (fin) { qte = dire(fin[2], fin[3]); s = fin[1]; }
    s = s.replace(ARTICLE, "").trim().replace(/(\d)\.(\d)/g, "$1,$2");
    return { nom: majuscule(s).slice(0, 60), qte };
  }).filter((a) => cleDe(a.nom).length > 1);
}

// « plus de lait », « ajoute des œufs aux courses », « courses : lait, œufs » : ce qui, dans la barre d'Echo, va à la liste.
// Prudent exprès : « Penser aux courses » ou « plus de 30 min de sport » restent des tâches. Sans mot clair
// (« il n'y a plus de… », « ajoute… aux courses », « courses : … »), il faut que chaque article soit un produit connu.
export function lireDemande(texte: string): Lu[] | null {
  const t = texte.trim();
  const sur = t.match(/^(?:il n['’]y a |y a |on n['’]a |je n['’]ai )plus\s+(?:de\s+|d['’]\s*|du\s+|des\s+)(.+)$/i)
    ?? t.match(/^(?:liste de courses|courses)\s*[:,]\s*(.+)$/i)
    ?? t.match(/^(?:ajoute[rz]?|mets?|mettre|note[rz]?|rajoute[rz]?)\s+(.+?)\s+(?:aux|dans les|sur la liste des?|[àa] la liste des?) courses$/i);
  const peutEtre = sur ? null : t.match(/^plus\s+(?:de\s+|d['’]\s*|du\s+|des\s+)(.+)$/i) ?? t.match(/^(.+?)\s+(?:aux|dans les|sur la liste des?|[àa] la liste des?) courses$/i);
  const m = sur ?? peutEtre;
  if (!m) return null;
  const lus = lireArticles(m[1]);
  if (!lus.length || (peutEtre && lus.some((l) => devinerRayon(l.nom) === "autre"))) return null;
  return lus;
}

/* ---------- Deviner le rayon ---------- */

const MOTS: Record<Exclude<Rayon, "autre">, string> = {
  fruits: "pomme poire banane orange citron clementine mandarine fraise framboise raisin melon pasteque peche abricot prune kiwi mangue ananas avocat tomate carotte oignon ail echalote pomme de terre patate courgette aubergine poivron concombre salade laitue epinard brocoli chou chou-fleur poireau celeri navet radis betterave champignon haricot vert courge potiron butternut fenouil gingembre coriandre persil basilic menthe ciboulette thym herbe fruit legume citron vert piment mais endive roquette mache asperge petit poi haricot",
  boulangerie: "pain baguette croissant brioche pain de mie viennoiserie tresse toast wrap tortilla pita",
  frais: "lait oeuf yaourt yogourt beurre creme fromage gruyere emmental mozzarella parmesan feta chevre comte raclette ricotta mascarpone skyr fromage blanc pate feuilletee pate brisee pate a pizza tofu houmous margarine creme fraiche serac",
  boucherie: "poulet boeuf veau agneau dinde canard steak viande hache escalope blanc de poulet cuisse filet saumon cabillaud thon frais poisson crevette merguez bresaola viande sechee volaille pave gigot entrecote emince",
  epicerie: "pate riz semoule quinoa lentille pois chiche farine sucre sel poivre huile vinaigre moutarde mayonnaise ketchup sauce conserve thon sardine cereale muesli flocon avoine confiture miel chocolat biscuit gateau chips cafe the tisane epice curry cumin paprika cannelle bouillon concentre coulis passata lait de coco noix amande noisette raisin sec levure maizena chapelure cornichon olive soupe nouille boulgour haricot rouge haricot blanc pois casse couscous sirop d erable nutella pate a tartiner compote puree sauce soja sauce tomate",
  surgeles: "surgele glace sorbet frite pizza pizza surgelee poisson pane epinard surgele petit pois surgele",
  boissons: "eau jus soda coca limonade sirop biere vin cidre the glace boisson lait d amande lait d avoine eau gazeuse",
  maison: "papier lessive liquide vaisselle eponge sac poubelle essuie-tout papier toilette papier alu aluminium film alimentaire papier cuisson nettoyant javel adoucissant pastille lave-vaisselle ampoule pile bougie allumette serpilliere sopalin mouchoir",
  hygiene: "shampoing shampooing savon gel douche dentifrice brosse a dent deodorant rasoir coton creme solaire creme hydratante serviette tampon pansement apres-shampoing mousse a raser coton-tige",
};
// Les expressions de plusieurs mots passent avant les mots seuls (« lait de coco » avant « lait »).
const TABLE = (() => {
  const multi: Array<[string, Rayon]> = [], seuls = new Map<string, Rayon>();
  const expressions = ["pomme de terre", "haricot vert", "citron vert", "petit poi", "pain de mie", "fromage blanc", "pate feuilletee", "pate brisee", "pate a pizza", "creme fraiche", "blanc de poulet", "viande sechee", "thon frais", "pois chiche", "lait de coco", "raisin sec", "haricot rouge", "haricot blanc", "pois casse", "sirop d erable", "pate a tartiner", "sauce soja", "sauce tomate", "pizza surgelee", "poisson pane", "epinard surgele", "petit pois surgele", "the glace", "lait d amande", "lait d avoine", "eau gazeuse", "liquide vaisselle", "sac poubelle", "papier toilette", "papier alu", "film alimentaire", "papier cuisson", "brosse a dent", "gel douche", "creme solaire", "creme hydratante", "mousse a raser"];
  for (const [rayon, mots] of Object.entries(MOTS) as Array<[Rayon, string]>) {
    let reste = " " + mots + " ";
    for (const e of expressions) if (reste.includes(" " + e + " ")) { multi.push([cleDe(e), rayon]); reste = reste.replace(" " + e + " ", " "); }
    for (const m of reste.split(" ").filter(Boolean)) {
      const k = cleDe(m); // « essuie-tout » devient deux mots : c'est une expression
      if (k.includes(" ")) multi.push([k, rayon]); else if (!seuls.has(k)) seuls.set(k, rayon);
    }
  }
  multi.sort((a, b) => b[0].length - a[0].length);
  return { multi, seuls };
})();

// Le rayon d'un produit : d'abord ce qu'on a déjà rangé à la main, sinon les mots connus, sinon « Autre ».
export function devinerRayon(nom: string, habitudes: Habitude[] = []): Rayon {
  const cle = cleDe(nom);
  const connu = habitudes.find((h) => h.cle === cle);
  if (connu) return connu.rayon;
  const bord = ` ${cle} `;
  for (const [e, r] of TABLE.multi) if (bord.includes(` ${e} `)) return r;
  for (const mot of cle.split(" ")) { const r = TABLE.seuls.get(mot); if (r) return r; }
  return "autre";
}

/* ---------- Les achats habituels ---------- */

const JOUR = 86_400_000;
// Le rythme d'un produit : l'écart du milieu entre ses achats (il en faut au moins trois, espacés d'au moins deux jours).
export function rythme(achats: number[]): number | null {
  if (achats.length < 3) return null;
  const tri = [...achats].sort((a, b) => a - b);
  const ecarts = tri.slice(1).map((t, i) => t - tri[i]).sort((a, b) => a - b);
  const m = ecarts[Math.floor(ecarts.length / 2)];
  return m >= 2 * JOUR ? m : null;
}

// Ce qu'Echo remet tout seul dans la liste : un produit acheté régulièrement, dont c'est bientôt le moment.
// L'id dépend du dernier achat : deux téléphones qui font le calcul en même temps créent la même ligne, pas deux.
export function habituelsDus(habitudes: Habitude[], courses: Article[], now: number): Article[] {
  const presents = new Set(courses.map((a) => cleDe(a.nom)));
  const dus: Article[] = [];
  for (const h of habitudes) {
    const r = rythme(h.achats);
    if (!r || h.refus >= 3 || presents.has(h.cle) || (h.pause && h.pause > now)) continue;
    const dernier = Math.max(...h.achats);
    if (now - dernier < r * 0.9) continue;
    dus.push({ id: `h-${h.cle.replace(/ /g, "-")}-${dernier}`, nom: h.nom, qte: h.qte, rayon: h.rayon, par: "echo", fait: null, cree: now });
  }
  return dus;
}

// Après un achat : Echo s'en souvient (les huit derniers suffisent).
export function apresAchat(h: Habitude | undefined, a: Article): Habitude {
  const achats = [...new Set([...(h?.achats ?? []), a.fait ?? Date.now()])].sort((x, y) => x - y).slice(-8);
  return { cle: cleDe(a.nom), nom: a.nom, qte: a.qte, rayon: a.rayon, achats, refus: 0 };
}
// On retire un produit qu'Echo avait remis : il attend un tour de plus, et arrête au troisième refus.
export function apresRefus(h: Habitude, now: number): Habitude {
  const refus = h.refus + 1;
  return { ...h, refus, pause: now + (rythme(h.achats) ?? 7 * JOUR) * refus };
}

/* ---------- Regrouper pour l'écran ---------- */

export interface Groupe { rayon: Rayon; nom: string; articles: Article[]; reste: number }
export function parRayon(courses: Article[]): Groupe[] {
  return RAYONS.map(({ id, nom }) => {
    const articles = courses.filter((a) => a.rayon === id).sort((a, b) => Number(!!a.fait) - Number(!!b.fait) || a.cree - b.cree);
    return { rayon: id, nom, articles, reste: articles.filter((a) => !a.fait).length };
  }).filter((g) => g.articles.length);
}

export const nouvelArticle = (lu: Lu, par: Auteur, habitudes: Habitude[], i = 0): Article =>
  ({ id: nouvelId() + i, nom: lu.nom, qte: lu.qte, rayon: devinerRayon(lu.nom, habitudes), par, fait: null, cree: Date.now() + i });

/* ---------- Nettoyer ce qui arrive de l'autre téléphone ---------- */

const obj = (x: unknown) => (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
const txt = (x: unknown, max: number) => (typeof x === "string" ? x.slice(0, max) : "");
const nb = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);
const personne = (x: unknown): x is Personne => x === "moi" || x === "elle";
const JOUR_ISO = /^\d{4}-\d{2}-\d{2}$/;

export function nettoyerArticle(x: unknown): Article | null {
  const o = obj(x), id = txt(o.id, 80), nom = txt(o.nom, 60).trim();
  if (!id || !nom) return null;
  return { id, nom, qte: txt(o.qte, 20), rayon: estRayon(o.rayon) ? o.rayon : "autre", par: personne(o.par) ? o.par : o.par === "echo" ? "echo" : "moi",
    fait: nb(o.fait), ...(personne(o.faitPar) ? { faitPar: o.faitPar } : {}), cree: nb(o.cree) ?? Date.now() };
}
export function nettoyerHabitude(x: unknown): Habitude | null {
  const o = obj(x), cle = txt(o.cle, 80), nom = txt(o.nom, 60).trim();
  if (!cle || !nom) return null;
  const achats = (Array.isArray(o.achats) ? o.achats : []).filter((n): n is number => nb(n) !== null).slice(-8);
  const pause = nb(o.pause);
  return { cle, nom, qte: txt(o.qte, 20), rayon: estRayon(o.rayon) ? o.rayon : "autre", achats, refus: Math.max(0, Math.min(9, nb(o.refus) ?? 0)), ...(pause ? { pause } : {}) };
}
export function nettoyerRepas(x: unknown): Repas | null {
  const o = obj(x), jour = txt(o.jour, 10), plat = txt(o.plat, 80).trim();
  return JOUR_ISO.test(jour) && plat ? { jour, plat } : null;
}
export function nettoyerProduit(x: unknown): Produit | null {
  const o = obj(x), id = txt(o.id, 80), nom = txt(o.nom, 60).trim(), avant = txt(o.avant, 10);
  if (!id || !nom || !LIEUX.some((l) => l.id === o.lieu)) return null;
  return { id, nom, lieu: o.lieu as Lieu, ...(JOUR_ISO.test(avant) ? { avant } : {}), cree: nb(o.cree) ?? Date.now() };
}
export function nettoyerGouts(x: unknown): Gouts | null {
  const o = obj(x);
  if (!personne(o.qui)) return null;
  const aime = (Array.isArray(o.aime) ? o.aime : []).filter((s): s is string => typeof s === "string").slice(0, 30).map((s) => s.slice(0, 30));
  const rechauffe = (["oui", "non", "pas"] as const).find((r) => r === o.rechauffe) ?? "";
  return { qui: o.qui, aime, evite: txt(o.evite, 200), rechauffe, maj: nb(o.maj) ?? 0 };
}
