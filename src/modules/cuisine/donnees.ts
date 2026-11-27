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
// pour = les jours des repas pour lesquels Echo a mis cet article (il repart avec eux si le repas change).
export interface Article { id: string; nom: string; qte: string; rayon: Rayon; par: Auteur; fait: number | null; faitPar?: Personne; cree: number; pour?: string[] }
// Ce qu'Echo retient d'un produit : son rayon, et quand on l'a acheté (pour le remettre tout seul).
export interface Habitude { cle: string; nom: string; qte: string; rayon: Rayon; achats: number[]; refus: number; pause?: number }
// Le repas du soir d'un jour. Quand Echo le propose : ses ingrédients, s'il vient du congélateur, la gamelle du midi.
// propose = pas encore validé (la barre « Proposition d'Echo »).
export interface Repas { jour: string; plat: string; ingredients?: Lu[]; duStock?: string[]; congele?: boolean; gamelle?: string; propose?: boolean }
export type Lieu = "frigo" | "congelateur" | "placard" | "maison";
export const LIEUX: Array<{ id: Lieu; nom: string }> = [
  { id: "frigo", nom: "Frigo" }, { id: "congelateur", nom: "Congélateur" }, { id: "placard", nom: "Placard" }, { id: "maison", nom: "Maison" },
];
// reste : ce qu'il reste du produit. Absent = plein ; « peu » = presque fini (il est alors remis aux courses).
export type Reste = "moitie" | "peu";
export const RESTES: Array<{ id: Reste | "plein"; nom: string }> = [{ id: "plein", nom: "Plein" }, { id: "moitie", nom: "À moitié" }, { id: "peu", nom: "Presque fini" }];
// repas : pour une boîte du batch, le jour où elle sera mangée.
// nb : le nombre d'unités qu'il reste, quand le produit se compte (6 briques de crème). qte : la taille d'une unité (« 25 cl »).
export interface Produit { id: string; nom: string; lieu: Lieu; avant?: string; reste?: Reste; nb?: number; qte?: string; repas?: string; cree: number }
// « 6 x 25 cl » = 6 unités de 25 cl ; « 6 » = 6 unités ; « 500 g » = une quantité, pas un nombre. Une seule unité ne se compte pas.
export function lireQuantite(texte: string): { nb?: number; qte?: string } {
  const t = texte.replace(/\s+/g, " ").trim().slice(0, 20);
  const m = /^(\d{1,2})(?:\s*[x×*]\s*(.+))?$/i.exec(t);
  if (!m) return t ? { qte: t } : {};
  const n = Number(m[1]);
  return { ...(n >= 2 ? { nb: n } : {}), ...(m[2] ? { qte: m[2].trim() } : {}) };
}
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

/* ---------- La semaine de repas ---------- */

// Ce dont le foyer a besoin un jour donné : combien de portions le soir (une de moins par personne qui travaille le soir),
// et si quelqu'un emporte une gamelle le midi (la personne aux horaires fixes, les jours où elle travaille).
export interface Besoin { jour: string; soir: number; absents: Personne[]; gamelle: Personne | null }
export interface Travail { qui: Personne; jour: string; plages: Array<[string, string]>; fixe: boolean }
export function besoins(jours: string[], travail: Travail[]): Besoin[] {
  return jours.map((jour) => {
    const duJour = travail.filter((t) => t.jour === jour);
    const absents = duJour.filter((t) => t.plages.some(([, fin]) => fin >= "20:00")).map((t) => t.qui);
    const gamelle = duJour.find((t) => t.fixe && t.plages.some(([debut, fin]) => debut <= "12:00" && fin >= "13:00"))?.qui ?? null;
    return { jour, soir: Math.max(0, 2 - new Set(absents).size), absents: [...new Set(absents)], gamelle };
  });
}

// Deux quantités du même produit : on additionne quand l'unité est la même (« 300 g » + « 200 g »), sinon on les écrit côte à côte.
export function additionner(a: string, b: string): string {
  if (!a || !b) return a || b;
  const lire = (q: string) => q.match(/^(\d+(?:,\d+)?)\s*(.*)$/);
  const x = lire(a), y = lire(b);
  if (x && y && x[2].toLowerCase() === y[2].toLowerCase()) {
    const somme = Math.round((Number(x[1].replace(",", ".")) + Number(y[1].replace(",", "."))) * 100) / 100;
    return `${String(somme).replace(".", ",")}${x[2] ? ` ${x[2]}` : ""}`;
  }
  return `${a} + ${b}`.slice(0, 20);
}

// Ce qu'il faut acheter pour des repas : leurs ingrédients, sans ce qui est déjà au stock. Un produit commun à plusieurs
// repas n'apparaît qu'une fois, avec les quantités ajoutées et les jours concernés.
export interface Achat extends Lu { jours: string[] }
export function manquants(repas: Repas[], stock: Produit[]): Achat[] {
  const auStock = new Set(stock.map((p) => cleDe(p.nom)));
  const vus = new Map<string, Achat>();
  for (const r of repas) for (const i of r.ingredients ?? []) {
    const cle = cleDe(i.nom), deja = vus.get(cle);
    if (!cle || auStock.has(cle)) continue;
    if (deja) { deja.qte = additionner(deja.qte, i.qte); if (!deja.jours.includes(r.jour)) deja.jours.push(r.jour); }
    else vus.set(cle, { nom: i.nom.charAt(0).toUpperCase() + i.nom.slice(1), qte: i.qte, jours: [r.jour] });
  }
  return [...vus.values()];
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
    fait: nb(o.fait), ...(personne(o.faitPar) ? { faitPar: o.faitPar } : {}), cree: nb(o.cree) ?? Date.now(),
    ...(Array.isArray(o.pour) && o.pour.length ? { pour: o.pour.filter((j): j is string => typeof j === "string" && JOUR_ISO.test(j)).slice(0, 7) } : {}) };
}
export function nettoyerHabitude(x: unknown): Habitude | null {
  const o = obj(x), cle = txt(o.cle, 80), nom = txt(o.nom, 60).trim();
  if (!cle || !nom) return null;
  const achats = (Array.isArray(o.achats) ? o.achats : []).filter((n): n is number => nb(n) !== null).slice(-8);
  const pause = nb(o.pause);
  return { cle, nom, qte: txt(o.qte, 20), rayon: estRayon(o.rayon) ? o.rayon : "autre", achats, refus: Math.max(0, Math.min(9, nb(o.refus) ?? 0)), ...(pause ? { pause } : {}) };
}
export function nettoyerRepas(x: unknown): Repas | null {
  const o = obj(x), jour = txt(o.jour, 10), plat = txt(o.plat, 80).trim(), gamelle = txt(o.gamelle, 80).trim();
  if (!JOUR_ISO.test(jour) || !plat) return null;
  const ingredients = (Array.isArray(o.ingredients) ? o.ingredients : []).slice(0, 20)
    .map((i) => ({ nom: txt(obj(i).nom, 60).trim(), qte: txt(obj(i).qte, 20).trim() })).filter((i) => i.nom);
  const duStock = (Array.isArray(o.duStock) ? o.duStock : []).slice(0, 12).map((n) => txt(n, 60).trim()).filter(Boolean);
  return { jour, plat, ...(ingredients.length ? { ingredients } : {}), ...(duStock.length ? { duStock } : {}), ...(o.congele === true ? { congele: true } : {}), ...(gamelle ? { gamelle } : {}), ...(o.propose === true ? { propose: true } : {}) };
}
export function nettoyerProduit(x: unknown): Produit | null {
  const o = obj(x), id = txt(o.id, 80), nom = txt(o.nom, 60).trim(), avant = txt(o.avant, 10);
  if (!id || !nom || !LIEUX.some((l) => l.id === o.lieu)) return null;
  const reste = (["moitie", "peu"] as const).find((r) => r === o.reste);
  const n = nb(o.nb), qte = txt(o.qte, 20).trim(), repas = txt(o.repas, 10);
  return { id, nom, lieu: o.lieu as Lieu, ...(JOUR_ISO.test(avant) ? { avant } : {}), ...(reste ? { reste } : {}),
    ...(n !== null && Number.isInteger(n) && n >= 1 && n <= 99 ? { nb: n } : {}), ...(qte ? { qte } : {}), ...(JOUR_ISO.test(repas) ? { repas } : {}), cree: nb(o.cree) ?? Date.now() };
}
export function nettoyerGouts(x: unknown): Gouts | null {
  const o = obj(x);
  if (!personne(o.qui)) return null;
  const aime = (Array.isArray(o.aime) ? o.aime : []).filter((s): s is string => typeof s === "string").slice(0, 30).map((s) => s.slice(0, 30));
  const rechauffe = (["oui", "non", "pas"] as const).find((r) => r === o.rechauffe) ?? "";
  return { qui: o.qui, aime, evite: txt(o.evite, 200), rechauffe, maj: nb(o.maj) ?? 0 };
}

/* ---------- Le ticket de caisse (lu par photo) ---------- */

export type Rangement = Lieu | "aucun"; // « aucun » = ne va pas au stock (sac, consigne…)
export interface LigneTicket { nom: string; qte: string; prix: number; lieu: Rangement; jours: number; course: string; sur: boolean }
export interface LectureTicket { lisible: boolean; magasin: string; date: string; total: number; monnaie: "CHF" | "EUR"; lignes: LigneTicket[]; remarque: string }
// Le ticket gardé : le magasin, le jour, le total et les prix (pour le budget, plus tard).
export interface Ticket { id: string; magasin: string; date: string; total: number; monnaie: "CHF" | "EUR"; lignes: Array<{ nom: string; qte: string; prix: number }>; par: Personne; cree: number }

// Une vraie date du calendrier (« 2026-11-31 » n'en est pas une).
export function vraiJour(j: string) {
  const d = JOUR_ISO.test(j) ? new Date(j + "T12:00:00Z") : null;
  return !!d && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === j;
}
const prix = (x: unknown) => { const n = nb(x); return n !== null && n > 0 && n < 100_000 ? Math.round(n * 100) / 100 : 0; };
const monnaie = (x: unknown) => (x === "EUR" ? "EUR" : "CHF");

// La réponse du serveur n'est pas crue sur parole : tailles bornées, lieux connus, un article de la liste coché une seule fois.
export function nettoyerLecture(x: unknown, courses: string[]): LectureTicket {
  const o = obj(x), libres = new Set(courses), date = txt(o.date, 10);
  const brutes = Array.isArray(o.lignes) ? o.lignes : [];
  const lignes = brutes.slice(0, 80).flatMap((l): LigneTicket[] => {
    const i = obj(l), nom = txt(i.nom, 40).trim();
    if (!nom) return [];
    const lieu: Rangement = LIEUX.find((k) => k.id === i.lieu)?.id ?? "aucun";
    const j = nb(i.jours);
    const course = typeof i.course === "string" && libres.delete(i.course) ? i.course : "";
    return [{ nom, qte: txt(i.qte, 20).trim(), prix: prix(i.prix), lieu, jours: lieu === "frigo" && j !== null && Number.isInteger(j) && j > 0 && j <= 60 ? j : 0, course, sur: i.sur !== false }];
  });
  return { lisible: o.lisible === true && lignes.length > 0, magasin: txt(o.magasin, 40).trim(), date: vraiJour(date) ? date : "", total: prix(o.total), monnaie: monnaie(o.monnaie), lignes,
    remarque: brutes.length > 80 ? "Ticket très long : seules les 80 premières lignes sont lues." : txt(o.remarque, 200).trim() };
}

export function nettoyerTicket(x: unknown): Ticket | null {
  const o = obj(x), id = txt(o.id, 80), date = txt(o.date, 10);
  if (!id || !vraiJour(date) || !personne(o.par)) return null;
  const lignes = (Array.isArray(o.lignes) ? o.lignes : []).slice(0, 80)
    .map((l) => ({ nom: txt(obj(l).nom, 40).trim(), qte: txt(obj(l).qte, 20).trim(), prix: prix(obj(l).prix) })).filter((l) => l.nom);
  return { id, magasin: txt(o.magasin, 40).trim(), date, total: prix(o.total), monnaie: monnaie(o.monnaie), lignes, par: o.par, cree: nb(o.cree) ?? Date.now() };
}

export const montant = (n: number, m: "CHF" | "EUR") => (m === "EUR" ? `${n.toFixed(2).replace(".", ",")} €` : `${n.toFixed(2)} CHF`);

/* ---------- Le batch du dimanche ---------- */

export interface Etape { texte: string; minutes: number; fait?: boolean }
// Un plan de cuisson par semaine (clé : le lundi). fini = le moment où les boîtes ont été rangées.
export interface Batch { semaine: string; etapes: Etape[]; duree: number; astuce?: string; fini?: number; cree: number }
export interface Boite { jour: string; plat: string; portions: number; lieu: "frigo" | "congelateur" }

// Les boîtes à remplir : une par repas cuisiné, avec les portions du soir, plus une si le lendemain quelqu'un emporte une gamelle.
// tous = les besoins de la semaine ET du lundi suivant (pour la gamelle après le dimanche).
export function boites(repas: Repas[], tous: Besoin[]): Boite[] {
  return repas.filter((r) => !r.propose).sort((a, b) => a.jour.localeCompare(b.jour)).flatMap((r) => {
    const i = tous.findIndex((b) => b.jour === r.jour);
    if (i < 0) return [];
    const portions = tous[i].soir + (tous[i + 1]?.gamelle ? 1 : 0);
    return portions > 0 ? [{ jour: r.jour, plat: r.plat, portions, lieu: r.congele ? "congelateur" as const : "frigo" as const }] : [];
  });
}
// Les produits du stock que ces repas utilisent (pour les décompter après le batch). Le nom du produit ou de l'ingrédient
// peut être plus long que l'autre (« crème » et « crème entière ») ; les boîtes déjà rangées ne comptent pas.
// sur = le produit porte le nom de l'ingrédient (« crème entière » pour « crème »). Dans l'autre sens (« lait » pour
// « lait de coco »), c'est peut-être un autre produit : on le montre, mais sans rien décompter d'office.
export interface Servi { produit: Produit; sur: boolean }
export function utilises(repas: Repas[], stock: Produit[]): Servi[] {
  const cles = repas.flatMap((r) => [...(r.ingredients ?? []).map((i) => i.nom), ...(r.duStock ?? [])]).map((n) => ` ${cleDe(n)} `).filter((c) => c.trim());
  return stock.flatMap((p): Servi[] => {
    const c = ` ${cleDe(p.nom)} `;
    if (p.repas || p.lieu === "maison" || !c.trim()) return [];
    if (cles.some((k) => c.includes(k))) return [{ produit: p, sur: true }];
    return cles.some((k) => k.includes(c)) ? [{ produit: p, sur: false }] : [];
  });
}
// Ce qu'on dit d'un produit utilisé : fini (il sort du stock, ou une unité de moins), il en reste, pas touché.
export type Usage = "fini" | "reste" | "rien";
export const usageProbable = ({ produit: p, sur }: Servi): Usage => (!sur ? "rien" : p.lieu === "frigo" || p.nb ? "fini" : "reste");
export const duree = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, "0")}` : ""}` : `${min} min`);

export function nettoyerBatch(x: unknown): Batch | null {
  const o = obj(x), semaine = txt(o.semaine, 10), astuce = txt(o.astuce, 200).trim(), fini = nb(o.fini);
  if (!vraiJour(semaine)) return null;
  const etapes = (Array.isArray(o.etapes) ? o.etapes : []).slice(0, 30).flatMap((e): Etape[] => {
    const i = obj(e), texte = txt(i.texte, 240).trim(), m = nb(i.minutes);
    return texte ? [{ texte, minutes: m !== null && m > 0 && m <= 240 ? Math.round(m) : 0, ...(i.fait === true ? { fait: true } : {}) }] : [];
  });
  if (!etapes.length && fini === null) return null; // sans plan d'Echo, il reste au moins « rangé »
  const d = nb(o.duree);
  return { semaine, etapes, duree: d !== null && d > 0 && d <= 600 ? Math.round(d) : etapes.reduce((s, e) => s + e.minutes, 0), ...(astuce ? { astuce } : {}), ...(fini !== null ? { fini } : {}), cree: nb(o.cree) ?? Date.now() };
}

/* ---------- Le livre de recettes ---------- */

// Un plat noté après le repas (clé : son nom simplifié). dernier = le jour du dernier avis, precedent = celui d'avant (pour défaire). avis 1 = on a aimé (il entre dans le livre), -1 = Echo ne le repropose plus.
export interface Recette { cle: string; plat: string; ingredients?: Lu[]; congele?: boolean; avis: 1 | -1; fois: number; dernier: string; precedent?: string; maj: number }
export function nettoyerRecette(x: unknown): Recette | null {
  const o = obj(x), plat = txt(o.plat, 80).trim(), cle = txt(o.cle, 80), dernier = txt(o.dernier, 10), precedent = txt(o.precedent, 10), f = nb(o.fois);
  if (!plat || !cle || cle !== cleDe(plat) || (o.avis !== 1 && o.avis !== -1)) return null;
  const ingredients = (Array.isArray(o.ingredients) ? o.ingredients : []).slice(0, 20)
    .map((i) => ({ nom: txt(obj(i).nom, 60).trim(), qte: txt(obj(i).qte, 20).trim() })).filter((i) => i.nom);
  return { cle, plat, ...(ingredients.length ? { ingredients } : {}), ...(o.congele === true ? { congele: true } : {}), avis: o.avis, fois: f !== null && f >= 1 ? Math.round(f) : 1, dernier: JOUR_ISO.test(dernier) ? dernier : "", ...(JOUR_ISO.test(precedent) ? { precedent } : {}), maj: nb(o.maj) ?? 0 };
}
