import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Table } from "dexie";
import { toast } from "sonner";
import { NOMS_DEFAUT, db } from "../data/db";
import { CODES, type Horaire } from "../lib/horaires";
import type { Noms, Personne, Tache } from "../lib/types";
import { nettoyerNoms, nettoyerTache } from "../lib/valider";
import { supa } from "./client";
import { autrePrenom } from "../lib/types";
import { GENRES, TABLES_MODULES } from "./genres";
import { annoncer, motDeLAutre } from "../lib/echo/discussions";
import { cleHoraire, garderBases, lireBases, lireFile, marquerDistante, noter, poserBase, retirer, surChangement, viderFile } from "./file";
import { fusionner3, pareil } from "./fusion";
import { rattacherRappels } from "../data/rappels";

// La synchro du foyer. Chaque téléphone garde toutes les données chez lui (Echo marche hors ligne)
// et échange ses changements avec le serveur : il envoie ce qui a changé ici, il reçoit ce qui a changé ailleurs.
// Si les deux changent la même tâche chacun de son côté, les changements sont fusionnés champ par champ (fusion.ts) ;
// pour le même champ, le dernier arrivé au serveur gagne, et celui qui l'envoie est prévenu.

export interface Foyer { id: string; userId: string }
export interface Membre { userId: string; prenom: string; place: Personne }
type Ligne = { genre: string; cle: string; data: unknown; supprime: boolean; par: string | null; maj: string };

const CURSEUR = "echo-curseur"; // l'heure (serveur) du dernier changement reçu
const CONNUS = "echo-genres"; // les genres que cette version sait lire
// Une version plus ancienne laisse passer les genres qu'elle ne connaît pas, et son curseur avance quand même.
// Quand une nouvelle version sait en lire de nouveaux (un module de plus), on relit tout le foyer une fois.
export function relireSiNouveauxGenres(genres = Object.keys(GENRES)) {
  const liste = [...genres].sort().join(",");
  try {
    if (localStorage.getItem(CONNUS) === liste) return false;
    localStorage.setItem(CONNUS, liste); // d'abord la liste : si elle ne peut pas être gardée, on ne relit pas tout à chaque fois
    localStorage.removeItem(CURSEUR);
    return true;
  } catch { return false; }
}
let foyer: Foyer | null = null;
let canal: RealtimeChannel | null = null;

// Une seule opération de synchro à la fois, dans l'ordre.
let chaine: Promise<unknown> = Promise.resolve();
const enFile = (fn: () => Promise<unknown>) => (chaine = chaine.then(fn).catch((e) => console.warn("[Echo synchro]", e)));
// Pour les tests : attendre que la synchro en cours soit finie.
export const synchroFinie = () => chaine;
// Regrouper les changements rapprochés : un minuteur par opération (envoyer ne doit pas annuler recevoir).
const minuteries = new Map<() => Promise<unknown>, ReturnType<typeof setTimeout>>();
const bientot = (fn: () => Promise<unknown>, ms = 700) => {
  clearTimeout(minuteries.get(fn));
  minuteries.set(fn, setTimeout(() => { minuteries.delete(fn); enFile(fn); }, ms));
};

export const lireFoyer = async () => ((await db.reglages.get("foyer"))?.valeur as Foyer | undefined) ?? null;

/* ---------- Connexion : pas d'e-mail, un compte anonyme par téléphone, relié au foyer par un code ---------- */

const MESSAGES: Record<string, string> = {
  anonymous_provider_disabled: "Le serveur d'Echo n'accepte pas encore les téléphones. Dis-le à Claude : il y a un réglage à faire.",
  over_request_rate_limit: "Trop d'essais. Réessaie dans un moment.",
  code_invalide: "Ce code est faux ou n'est plus valable (il dure 1 heure). Demande un nouveau code.",
  trop_essais: "Trop d'essais ratés pour l'instant. Attends un moment (jusqu'à une heure) et réessaie, avec un nouveau code si besoin.",
  deja_membre: "Ce téléphone est déjà dans un autre foyer.",
  complet: "Ce foyer est déjà complet.",
};
function dire(e: { code?: string; message?: string } | null): string {
  if (!navigator.onLine) return "Pas de connexion internet. Réessaie quand tu as du réseau.";
  const cle = Object.keys(MESSAGES).find((k) => e?.code === k || e?.message?.includes(k));
  return cle ? MESSAGES[cle] : "Ça n'a pas marché. Réessaie dans un instant.";
}

// Le compte de ce téléphone : créé sans rien demander, gardé dans l'app.
async function compte(): Promise<string> {
  const { data } = await supa.auth.getSession();
  if (data.session) return data.session.user.id;
  const r = await supa.auth.signInAnonymously();
  if (r.error || !r.data.user) throw new Error(dire(r.error));
  return r.data.user.id;
}

export async function creerFoyer(prenom: string, place: Personne) {
  const moi = await compte();
  const { data, error } = await supa.rpc("creer_foyer", { p_prenom: prenom, p_place: place });
  if (error) throw new Error(dire(error));
  const { data: m } = await supa.from("membres").select("place").eq("user_id", moi).single();
  await entrer(data as string, (m?.place as Personne) ?? place, moi);
}

export async function rejoindreFoyer(code: string, prenom: string) {
  const moi = await compte();
  const { data, error } = await supa.rpc("rejoindre_foyer", { p_code: code.replace(/\D/g, ""), p_prenom: prenom });
  if (error) throw new Error(dire(error));
  // Aucune ligne : le code est faux ou périmé (le serveur note l'essai sans lever d'erreur).
  const r = (data as Array<{ foyer: string; place: Personne }> | null)?.[0];
  if (!r?.foyer) throw new Error(MESSAGES.code_invalide);
  await entrer(r.foyer, r.place, moi);
}

export async function inviter(): Promise<string> {
  const { data, error } = await supa.rpc("creer_invitation");
  if (error) throw new Error(dire(error));
  return data as string;
}

// Entrer dans le foyer : ce téléphone prend sa place (moi ou elle), puis partage ce qu'il a et que le foyer n'a pas (partager).
const A_PARTAGER = "aPartager";
const inv = (q: Personne): Personne => (q === "moi" ? "elle" : "moi");
async function entrer(foyerId: string, place: Personne, userId: string) {
  const avant = (await db.reglages.get("proprio"))?.valeur as Personne | undefined;
  // Le même foyer qu'avant (téléphone reconnecté) : ses données sont déjà rangées avec les places du foyer, on n'échange rien.
  const memeFoyer = (await lireFoyer())?.id === foyerId;
  // Ce rangement n'est pas un changement à envoyer : vider puis réécrire une table (échange des places) ferait partir
  // des suppressions vers le foyer. Ce qui doit partir est noté juste après (partager), d'après ce que le téléphone contient vraiment.
  await db.transaction("rw", [db.taches, db.horaires, db.photos, db.reglages, db.corbeille, db.cuisine_courses, db.cuisine_gouts, db.cuisine_tickets, db.maison_corvees, db.maison_faits, db.budget_postes, db.budget_depenses, db.budget_apayer], async (tx) => {
    marquerDistante(tx);
    const ex = (await db.taches.filter((t) => !!t.ex).toArray()).map((t) => t.id);
    await db.taches.bulkDelete(ex);
    await db.photos.where("tacheId").anyOf(ex).delete();
    // Les tâches notées « pour moi » sur ce téléphone restent à la bonne personne.
    if (avant && avant !== place && !memeFoyer) {
      const tache = <T extends Pick<Tache, "qui" | "faitPar">>(t: T): T => ({ ...t, ...(t.qui === "nous" ? {} : { qui: inv(t.qui) }), ...(t.faitPar ? { faitPar: inv(t.faitPar) } : {}) });
      const taches = await db.taches.toArray();
      await db.taches.bulkPut(taches.map(tache));
      const corbeille = await db.corbeille.toArray();
      await db.corbeille.bulkPut(corbeille.map((e) => ({ ...e, tache: tache(e.tache) })));
      const horaires = await db.horaires.toArray();
      await db.horaires.clear();
      await db.horaires.bulkPut(horaires.map((h) => ({ ...h, qui: inv(h.qui) })));
      // Cuisine : qui a ajouté ou coché un article, et les goûts de chacun, suivent la personne.
      const courses = await db.cuisine_courses.toArray();
      await db.cuisine_courses.bulkPut(courses.map((a) => ({ ...a, par: a.par === "echo" ? a.par : inv(a.par), ...(a.faitPar ? { faitPar: inv(a.faitPar) } : {}) })));
      const gouts = await db.cuisine_gouts.toArray();
      await db.cuisine_gouts.clear();
      await db.cuisine_gouts.bulkPut(gouts.map((g) => ({ ...g, qui: inv(g.qui) })));
      const tickets = await db.cuisine_tickets.toArray();
      await db.cuisine_tickets.bulkPut(tickets.map((t) => ({ ...t, par: inv(t.par) })));
      // Maison : à qui est la corvée, qui l'a faite la dernière fois, et les lignes « corvée faite » (l'équilibre entre les deux).
      // Les papiers, les réparations, les appareils et les contacts ne sont à personne : rien à échanger.
      const corvees = await db.maison_corvees.toArray();
      await db.maison_corvees.bulkPut(corvees.map((c) => ({ ...c, qui: c.qui === "libre" ? c.qui : inv(c.qui), ...(c.par ? { par: inv(c.par) } : {}) })));
      const faits = await db.maison_faits.toArray();
      await db.maison_faits.bulkPut(faits.map((f) => ({ ...f, par: inv(f.par) })));
      // Budget : le salaire, les charges perso et le virement de chacun suivent la personne (les lignes de départ ont la place dans leur id).
      const postes = await db.budget_postes.toArray();
      await db.budget_postes.clear();
      await db.budget_postes.bulkPut(postes.map((p) => ({ ...p, id: p.id.replace(/-(moi|elle)$/, (_m, q: Personne) => "-" + inv(q)), ...(p.qui ? { qui: inv(p.qui) } : {}), valeurs: p.valeurs.map((v) => ({ ...v, ...(v.par ? { par: inv(v.par) } : {}) })) })));
      const depenses = await db.budget_depenses.toArray();
      await db.budget_depenses.bulkPut(depenses.map((d) => ({ ...d, qui: d.qui === "commun" ? d.qui : inv(d.qui) })));
      const apayer = await db.budget_apayer.toArray();
      await db.budget_apayer.bulkPut(apayer.map((l) => (l.compte === "moi" || l.compte === "elle" ? { ...l, compte: inv(l.compte) } : l)));
    }
    await db.reglages.bulkPut([{ cle: "proprio", valeur: place }, { cle: "foyer", valeur: { id: foyerId, userId } }, { cle: A_PARTAGER, valeur: { memeFoyer } }]);
  });
  // Un autre foyer (ou le premier) : la file d'avant ne vaut plus rien. Ses clés datent d'avant l'échange des places
  // (« horaire:moi|… » effacerait l'horaire de l'autre) et elle passerait devant « le foyer gagne ». C'est partager qui décide.
  if (!memeFoyer) viderFile();
  try { localStorage.removeItem(CURSEUR); } catch { /* rien */ }
  await demarrer();
}

// Juste après être entré dans le foyer : ce que ce téléphone a et que le foyer n'a pas part au foyer.
// Ce que le foyer a déjà (même supprimé) gagne : un téléphone qui revient ne renvoie pas ses vieilles copies,
// et une tâche supprimée entre-temps ne revient pas. Seul ce qui attendait déjà d'être envoyé (un vrai changement fait ici) part quand même.
// Si le foyer ne peut pas être lu, rien n'est noté : on réessaie à la prochaine synchro.
async function partager() {
  if (!foyer) return;
  const quoi = (await db.reglages.get(A_PARTAGER))?.valeur as { memeFoyer?: boolean } | undefined;
  if (!quoi) return;
  const auFoyer = new Map<string, boolean>(); // « genre:clé » → supprimée ?
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supa.from("elements").select("genre, cle, supprime").eq("foyer_id", foyer.id).order("genre").order("cle").range(de, de + 999);
    if (error) throw error;
    for (const l of data) auFoyer.set(`${l.genre}:${l.cle}`, l.supprime);
    if (data.length < 1000) break;
  }
  const attente = lireFile();
  const locales: string[] = [];
  for (const t of await db.taches.toArray()) if (!t.ex) locales.push("tache:" + t.id);
  for (const h of await db.horaires.toArray()) locales.push(cleHoraire(h.qui, h.jour));
  for (const [genre, g] of Object.entries(GENRES)) for (const cle of await g.table.toCollection().primaryKeys()) locales.push(`${genre}:${cle}`);
  // Quelques genres gardent quand même la ligne d'ici (une ligne de budget remplie face à une ligne encore vide au foyer).
  const aComparer = Object.keys(GENRES).filter((g) => GENRES[g].garderLocal);
  const gardees = new Set<string>();
  if (aComparer.length && locales.some((c) => auFoyer.get(c) === false && aComparer.includes(c.slice(0, c.indexOf(":"))))) {
    const { data, error } = await supa.from("elements").select("genre, cle, data").eq("foyer_id", foyer.id).in("genre", aComparer).eq("supprime", false);
    if (error) throw error;
    for (const l of data) {
      const g = GENRES[l.genre], ici = await g.table.get(l.cle);
      if (ici && g.garderLocal!(ici, g.nettoyer(l.data))) gardees.add(`${l.genre}:${l.cle}`);
    }
  }
  for (const c of locales) {
    if (c in attente) continue;
    const supprimee = auFoyer.get(c);
    // Une clé « naturelle » (un jour, un produit) supprimée dans un foyer où ce téléphone arrive pour la première fois : ce qu'il apporte est nouveau.
    const nouvelle = supprimee === undefined || (supprimee && !quoi.memeFoyer && !!GENRES[c.slice(0, c.indexOf(":"))]?.naturelle);
    if (nouvelle || gardees.has(c)) noter(c);
  }
  await db.reglages.delete(A_PARTAGER);
}

/* ---------- Envoyer et recevoir ---------- */

async function lireLigne(c: string) {
  const i = c.indexOf(":");
  const genre = c.slice(0, i), cle = c.slice(i + 1);
  if (genre === "tache") {
    const t = await db.taches.get(cle);
    if (t?.ex) return null; // les exemples restent sur ce téléphone
    return { foyer_id: foyer!.id, genre, cle, data: t ?? null, supprime: !t };
  }
  if (genre in GENRES) {
    const x = await GENRES[genre].table.get(cle);
    return { foyer_id: foyer!.id, genre, cle, data: x ?? null, supprime: !x };
  }
  if (genre !== "horaire") return null; // un genre que cette version ne connaît pas
  const [qui, jour] = cle.split("|");
  const h = await db.horaires.get([qui, jour]);
  return { foyer_id: foyer!.id, genre, cle, data: h ?? null, supprime: !h };
}

type Envoi = NonNullable<Awaited<ReturnType<typeof lireLigne>>>;
// Une ligne refusée par le serveur reste dans la file (elle n'est pas écrasée par ce qui arrive), mais n'est renvoyée
// qu'après un nouveau changement, ou au prochain lancement d'Echo : elle ne bloque plus les autres.
const refusees = new Map<string, number>();
// Le serveur refuse la ligne elle-même : une règle de la table (codes Postgres 22… et 23…) ou une ligne trop grosse (413).
// Toute autre erreur (réseau, connexion, serveur qui se recharge) est une panne : on ne trie rien, on réessaiera.
const estRefus = (e: { code?: string }, statut: number) => statut === 413 || /^2[23]/.test(e.code ?? "");

// Envoie un lot. S'il est refusé, on le coupe en deux pour trouver les lignes refusées : les autres partent quand même.
// Rend les lignes refusées. Une panne (réseau, serveur, connexion) lance une erreur : rien n'est retiré de la file.
async function pousser(lignes: Envoi[]): Promise<Envoi[]> {
  if (!lignes.length) return [];
  const { error, status } = await supa.from("elements").upsert(lignes, { onConflict: "foyer_id,genre,cle" });
  if (!error) return [];
  if (!estRefus(error, status)) throw error;
  if (lignes.length === 1) { console.warn("[Echo synchro] ligne refusée par le serveur :", lignes[0].genre, error.message); return lignes; }
  const milieu = lignes.length >> 1;
  return [...(await pousser(lignes.slice(0, milieu))), ...(await pousser(lignes.slice(milieu)))];
}

// Remplace une ligne que le foyer a déjà, seulement si elle n'a pas bougé depuis qu'on l'a lue (maj = l'heure lue).
// « changee » : l'autre a écrit entre la lecture et l'envoi. Rien n'est écrit, on relira et on refusionnera au passage suivant.
async function remplacer(l: Envoi, maj: string): Promise<"ok" | "changee" | "refus"> {
  const { data, error, status } = await supa.from("elements").update({ data: l.data, supprime: l.supprime })
    .eq("foyer_id", l.foyer_id).eq("genre", l.genre).eq("cle", l.cle).eq("maj", maj).select("cle");
  if (error) {
    if (!estRefus(error, status)) throw error;
    console.warn("[Echo synchro] ligne refusée par le serveur :", l.genre, error.message);
    return "refus";
  }
  return data.length ? "ok" : "changee";
}
// Combien de fois de suite une ligne a bougé pendant l'envoi. Après 3, elle part sans condition : mieux vaut « la dernière gagne » qu'une ligne qui ne part jamais.
const bougees = new Map<string, number>();

/* ---------- Deux changements sur la même ligne : fusion champ par champ ---------- */

type Obj = Record<string, unknown>;
type Distante = { data: unknown; supprime: boolean; par: string | null; maj: string };
type Conflit = { genre: string; nom: string; par: string | null; champs: string[] | null }; // champs null : effacée ici, gardée
const couper = (c: string): [string, string] => { const i = c.indexOf(":"); return [c.slice(0, i), c.slice(i + 1)]; };
const modele = (genre: string): { table: Table; cle: string; nettoyer: (x: unknown) => unknown } | undefined =>
  genre === "tache" ? { table: db.taches as Table, cle: "id", nettoyer: (x) => nettoyerTache(x) } : GENRES[genre];

// Ce que le foyer a en ce moment pour ces lignes.
async function lireDistantes(cles: string[]): Promise<Map<string, Distante>> {
  const out = new Map<string, Distante>(), parGenre = new Map<string, string[]>();
  for (const c of cles) { const [genre, cle] = couper(c); parGenre.set(genre, [...(parGenre.get(genre) ?? []), cle]); }
  for (const [genre, ks] of parGenre) for (let i = 0; i < ks.length; i += 100) {
    const { data, error } = await supa.from("elements").select("cle, data, supprime, par, maj").eq("foyer_id", foyer!.id).eq("genre", genre).in("cle", ks.slice(i, i + 100));
    if (error) throw error;
    for (const l of data) out.set(`${genre}:${l.cle}`, l);
  }
  return out;
}

// Avant d'envoyer un changement fait ici : si l'autre a changé la même ligne entre-temps, on fusionne.
// garde : la ligne n'est pas envoyée cette fois (effacée ici, mais changée par l'autre : sa version revient).
async function accorder(c: string, base: unknown, d: Distante): Promise<{ garde: boolean; conflit?: Conflit }> {
  const [genre, cle] = couper(c), m = modele(genre);
  if (!m) return { garde: false };
  const la = d.supprime ? null : (m.nettoyer(d.data) as Obj | null), b = m.nettoyer(base) as Obj | null;
  // L'autre n'a rien changé, ou a supprimé la ligne : ce qui a été fait ici part tel quel.
  // Pareil si la dernière écriture au foyer est la nôtre (un envoi arrivé, mais dont la réponse s'est perdue) : ce n'est pas « l'autre ».
  if (!la || !b || la[m.cle] !== cle || d.par === foyer?.userId || pareil(la, b)) return { garde: false };
  const nom = String(la.titre ?? la.nom ?? "");
  // Effacée ici pendant que l'autre la changeait : rien n'est perdu, sa version revient. C'est une écriture d'ici
  // (elle repasse par la file, et un événement repart vers iCloud) ; la base devient la version du foyer.
  let revenue = false;
  await db.transaction("rw", [m.table, db.corbeille], async () => {
    if (await m.table.get(cle)) return; // elle est là (ou revenue entre-temps, « Annuler ») : fusion normale, plus bas
    await m.table.put(la);
    if (genre === "tache") await db.corbeille.delete(cle);
    revenue = true;
  });
  if (revenue) {
    poserBase(c, la);
    return { garde: true, conflit: { genre, nom, par: d.par, champs: null } };
  }
  let conflit: Conflit | undefined;
  await db.transaction("rw", m.table, async (tx) => {
    marquerDistante(tx);
    const maintenant = (await m.table.get(cle)) as Obj | undefined; // relue dans la transaction : un geste fait entre-temps est gardé
    if (!maintenant) return;
    const f = fusionner3(b, maintenant, la);
    const propre = m.nettoyer(f.resultat) as Obj | null;
    if (!propre || propre[m.cle] !== cle) return; // fusion illisible : la ligne d'ici part telle quelle
    if (!pareil(propre, maintenant)) await m.table.put(propre);
    if (f.conflits.length) conflit = { genre, nom: String(propre.titre ?? propre.nom ?? nom), par: d.par, champs: f.conflits };
  });
  return { garde: false, conflit };
}

const CHAMPS: Record<string, string> = {
  titre: "le titre", jour: "le jour", heure: "l'heure", fin: "l'heure de fin", niveau: "l'importance", ordre: "l'ordre", note: "la note",
  qui: "pour qui", repete: "la répétition", etapes: "les étapes", fait: "la case", nom: "le nom", qte: "la quantité",
};
// Les champs qui vont avec un autre (cocher change aussi le jour et l'auteur) : on ne les nomme pas.
const DISCRETS = new Set(["faitLe", "faitPar", "suite", "ical", "par"]);
function liste(mots: string[]) { return mots.length < 2 ? mots.join("") : mots.slice(0, -1).join(", ") + " et " + mots[mots.length - 1]; }
export function phraseConflit(k: Conflit, prenom: string): string {
  const quoi = k.nom ? `« ${k.nom} »` : "une ligne";
  if (!k.champs) return `${prenom} a changé ${quoi} pendant que tu l'effaçais : c'est gardé.`;
  const mots = [...new Set(k.champs.filter((x) => !DISCRETS.has(x)).map((x) => CHAMPS[x] ?? "autre chose"))];
  return `${prenom} a aussi changé ${liste(mots.length ? mots : ["la même chose"])} de ${quoi}. C'est ta version qui est gardée.`;
}
async function direConflits(conflits: Conflit[]) {
  const membres = ((await db.reglages.get("membres"))?.valeur as Membre[] | undefined) ?? [];
  for (const k of conflits.slice(0, 3)) toast(phraseConflit(k, membres.find((m) => m.userId === k.par)?.prenom ?? "L'autre"), { duration: 9000 });
}

async function envoyer() {
  if (!foyer || !navigator.onLine) return;
  const file = lireFile();
  const cles = Object.keys(file).filter((c) => refusees.get(c) !== file[c]);
  const conflits: Conflit[] = [];
  try {
    for (let i = 0; i < cles.length; i += 200) {
      const lot = cles.slice(i, i + 200);
      // Les lignes que le foyer connaissait déjà : on regarde d'abord si l'autre les a changées.
      const bases = lireBases();
      const connues = lot.filter((c) => c in bases);
      const distantes = connues.length ? await lireDistantes(connues) : new Map<string, Distante>();
      const gardees = new Set<string>();
      for (const c of connues) {
        const d = distantes.get(c);
        if (!d) continue;
        const r = await accorder(c, bases[c], d);
        if (r.garde) gardees.add(c);
        if (r.conflit) conflits.push(r.conflit);
      }
      const lignes = (await Promise.all(lot.filter((c) => !gardees.has(c)).map(lireLigne))).filter((l) => l !== null);
      // Une ligne que le foyer a déjà n'est remplacée que si elle n'a pas bougé depuis la lecture ; les autres partent en un lot.
      const cleDe = (l: Envoi) => `${l.genre}:${l.cle}`;
      const lues = lignes.filter((l) => distantes.has(cleDe(l)) && (bougees.get(cleDe(l)) ?? 0) < 3);
      const refus = new Set((await pousser(lignes.filter((l) => !lues.includes(l)))).map(cleDe));
      const changees = new Set<string>();
      for (let j = 0; j < lues.length; j += 8) {
        await Promise.all(lues.slice(j, j + 8).map(async (l) => {
          const c = cleDe(l), r = await remplacer(l, distantes.get(c)!.maj);
          if (r === "refus") refus.add(c);
          else if (r === "changee") { changees.add(c); bougees.set(c, (bougees.get(c) ?? 0) + 1); }
        }));
      }
      for (const c of refus) refusees.set(c, file[c]);
      // Encore changée ici pendant l'envoi : elle reste dans la file, et sa base devient ce qui vient de partir.
      const apres = lireFile();
      for (const l of lignes) {
        const c = cleDe(l);
        if (refus.has(c) || changees.has(c)) continue;
        bougees.delete(c);
        if (apres[c] !== file[c]) poserBase(c, l.supprime ? undefined : l.data);
      }
      retirer(Object.fromEntries(lot.filter((c) => !refus.has(c) && !gardees.has(c) && !changees.has(c)).map((c) => [c, file[c]])));
      if (changees.size) bientot(envoyer, 300);
    }
  } finally {
    if (conflits.length) await direConflits(conflits);
  }
}

async function recevoir() {
  if (!foyer || !navigator.onLine) return;
  if (await db.reglages.get(A_PARTAGER)) return; // juste entré dans le foyer : on partage d'abord, sinon ce qui arrive écraserait ce qu'il faut comparer
  relireSiNouveauxGenres();
  let curseur: string | null = null;
  try { curseur = localStorage.getItem(CURSEUR); } catch { /* rien */ }
  const premier = !curseur;
  // On repart un peu avant le curseur : un changement enregistré au même moment n'est jamais manqué.
  let depuis = curseur ? new Date(Date.parse(curseur) - 10_000).toISOString() : "1970-01-01T00:00:00Z";
  for (;;) {
    const { data, error } = await supa.from("elements").select("genre, cle, data, supprime, par, maj")
      .eq("foyer_id", foyer.id).gt("maj", depuis).order("maj").limit(500);
    if (error) throw error;
    if (!data.length) break;
    await appliquer(data as Ligne[], premier);
    depuis = data[data.length - 1].maj;
    if (!curseur || Date.parse(depuis) > Date.parse(curseur)) curseur = depuis;
    if (data.length < 500) break;
  }
  if (curseur) try { localStorage.setItem(CURSEUR, curseur); } catch { /* rien */ }
}

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
function nettoyerHoraire(x: unknown): Horaire | null {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  if ((o.qui !== "moi" && o.qui !== "elle") || typeof o.jour !== "string" || !JOUR.test(o.jour) || typeof o.code !== "string" || !(o.code in CODES)) return null;
  return { qui: o.qui, jour: o.jour, code: o.code as Horaire["code"] };
}

// Applique les changements reçus. Ce qui attend encore d'être envoyé depuis ce téléphone n'est pas écrasé.
export async function appliquer(lignes: Ligne[], premier: boolean, moi = foyer?.userId) {
  const nouvelles: Array<{ par: string; texte: string }> = [];
  const membres = ((await db.reglages.get("membres"))?.valeur as Membre[] | undefined) ?? [];
  await db.transaction("rw", [db.taches, db.horaires, db.photos, db.corbeille, ...TABLES_MODULES], async (tx) => {
    marquerDistante(tx);
    // La file est lue ici, une fois la transaction vraiment ouverte (après une première lecture) : un geste fait juste avant
    // a fini de s'écrire et il est dans la file ; un geste fait pendant attend la fin de ce lot. Lue plus tôt, il serait écrasé.
    await db.taches.count();
    const attente = lireFile();
    for (const l of lignes) {
      if (`${l.genre}:${l.cle}` in attente) continue;
      if (l.genre === "tache") {
        const avant = await db.taches.get(l.cle);
        if (l.supprime) {
          if (!avant) continue;
          await db.taches.delete(l.cle);
          // Effacée par l'autre : elle va aussi dans la corbeille d'ici (sauf un ajout aussitôt annulé).
          if (!premier && l.par !== moi && avant.cree < Date.now() - 60_000) {
            await db.corbeille.put({ id: l.cle, tache: avant, par: membres.find((m) => m.userId === l.par)?.prenom ?? "", quand: Date.parse(l.maj) || Date.now() });
          } else await db.photos.where("tacheId").equals(l.cle).delete();
          continue;
        }
        const t = nettoyerTache(l.data);
        if (!t || t.id !== l.cle) continue; // une tâche abîmée est ignorée, jamais appliquée
        await db.taches.put(t);
        await db.corbeille.delete(l.cle); // remise par l'autre : elle quitte la corbeille d'ici
        if (premier || !l.par || l.par === moi) continue;
        if (!avant) nouvelles.push({ par: l.par, texte: `a ajouté « ${t.titre} »` });
        else if (!avant.fait && t.fait) nouvelles.push({ par: l.par, texte: `a terminé « ${t.titre} »` });
      } else if (l.genre in GENRES) {
        // Les données d'un module : la ligne nettoyée remplace celle d'ici ; abîmée, elle est ignorée.
        const g = GENRES[l.genre];
        if (l.supprime) { await g.table.delete(l.cle); continue; }
        const x = g.nettoyer(l.data) as Record<string, unknown> | null;
        if (x && x[g.cle] === l.cle) await g.table.put(x);
      } else if (l.genre === "horaire") {
        const [qui, jour] = l.cle.split("|");
        if (l.supprime) { await db.horaires.delete([qui, jour]); continue; }
        // Un horaire abîmé est ignoré, comme une tâche abîmée : il n'efface pas celui d'ici.
        const h = nettoyerHoraire(l.data);
        if (h && h.qui === qui && h.jour === jour) await db.horaires.put(h);
      }
    }
  });
  if (nouvelles.length) await prevenir(nouvelles);
}

// « Sarah a terminé … » : un petit message quand l'autre ajoute ou termine quelque chose.
async function prevenir(nouvelles: Array<{ par: string; texte: string }>) {
  const membres = ((await db.reglages.get("membres"))?.valeur as Membre[] | undefined) ?? [];
  const prenom = (id: string) => membres.find((m) => m.userId === id)?.prenom ?? "L'autre";
  // Echo le dit aussi dans sa discussion (réglage « Echo prend l'initiative ») : on le retrouve en ouvrant Echo, et Echo le sait.
  const initiative = (await db.reglages.get("echoInitiative"))?.valeur !== false && (await db.reglages.get("assistantEcho"))?.valeur !== false;
  if (initiative) {
    for (const par of new Set(nouvelles.map((n) => n.par))) {
      const mot = motDeLAutre(prenom(par), nouvelles.filter((n) => n.par === par).map((n) => n.texte));
      if (mot) annoncer(mot);
    }
  }
  if (nouvelles.length > 3) { toast(`${prenom(nouvelles[0].par)} a fait ${nouvelles.length} changements`); return; }
  for (const n of nouvelles) toast(`${prenom(n.par)} ${n.texte}`, { duration: 5000 });
}

// Les prénoms viennent du foyer : chacun a donné le sien au premier lancement.
async function chargerMembres() {
  if (!foyer) return;
  const { data, error } = await supa.from("membres").select("user_id, prenom, place").eq("foyer_id", foyer.id);
  if (error) throw error;
  const membres: Membre[] = data.map((m) => ({ userId: m.user_id, prenom: m.prenom, place: m.place }));
  const noms: Noms = nettoyerNoms((await db.reglages.get("noms"))?.valeur, NOMS_DEFAUT);
  for (const m of membres) noms[m.place] = m.prenom;
  // Place encore libre : on y met le prénom de l'autre attendu, jamais un ancien prénom resté sur ce téléphone.
  const moi = membres.find((m) => m.userId === foyer!.userId);
  for (const place of ["moi", "elle"] as Personne[]) if (moi && !membres.some((m) => m.place === place)) noms[place] = autrePrenom(moi.prenom);
  await db.reglages.bulkPut([{ cle: "membres", valeur: membres }, { cle: "noms", valeur: noms }]);
}

// Une étape qui échoue n'empêche pas les suivantes (sauf recevoir, qui attend que partager ait réussi).
const synchroniser = () => enFile(async () => {
  const rate: unknown[] = [];
  for (const etape of [partager, envoyer, recevoir, chargerMembres]) await etape().catch((e) => rate.push(e));
  if (rate.length) throw rate[0];
});

/* ---------- Démarrage ---------- */

export async function demarrer() {
  foyer = await lireFoyer();
  garderBases(!!foyer);
  if (!foyer) return;
  const { data } = await supa.auth.getSession();
  if (!data.session) return; // plus connecté : les Réglages proposent de reconnecter ce téléphone
  synchroniser();
  // Les rappels suivent le compte de ce téléphone (il change quand on le reconnecte).
  void rattacherRappels(data.session.user.id).catch((e) => console.warn("[Echo rappels]", e));
  if (canal) supa.removeChannel(canal);
  canal = supa.channel("foyer-" + foyer.id)
    .on("postgres_changes", { event: "*", schema: "public", table: "elements", filter: `foyer_id=eq.${foyer.id}` }, () => bientot(recevoir, 300))
    .on("postgres_changes", { event: "*", schema: "public", table: "membres", filter: `foyer_id=eq.${foyer.id}` }, () => enFile(chargerMembres))
    .subscribe();
}

let ecoute = false;
export function suivre() {
  if (ecoute || typeof window === "undefined") return;
  ecoute = true;
  surChangement(() => bientot(envoyer));
  addEventListener("online", () => foyer && synchroniser());
  document.addEventListener("visibilitychange", () => { if (!document.hidden && foyer) synchroniser(); });
  demarrer().catch((e) => console.warn("[Echo synchro]", e));
}

// Pour les Réglages : ce téléphone est-il encore connecté ?
export const estConnecte = async () => !!(await supa.auth.getSession()).data.session;
