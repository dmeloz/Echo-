import type { RealtimeChannel } from "@supabase/supabase-js";
import { toast } from "sonner";
import { NOMS_DEFAUT, db } from "../data/db";
import { CODES, type Horaire } from "../lib/horaires";
import type { Noms, Personne } from "../lib/types";
import { nettoyerNoms, nettoyerTache } from "../lib/valider";
import { supa } from "./client";
import { autrePrenom } from "../lib/types";
import { GENRES, TABLES_MODULES } from "./genres";
import { annoncer, motDeLAutre } from "../lib/echo/discussions";
import { cleHoraire, lireFile, marquerDistante, noter, retirer, surChangement } from "./file";

// La synchro du foyer. Chaque téléphone garde toutes les données chez lui (Echo marche hors ligne)
// et échange ses changements avec le serveur : il envoie ce qui a changé ici, il reçoit ce qui a changé ailleurs.
// Si les deux changent la même tâche, le dernier changement arrivé au serveur gagne.

export interface Foyer { id: string; userId: string }
export interface Membre { userId: string; prenom: string; place: Personne }
type Ligne = { genre: string; cle: string; data: unknown; supprime: boolean; par: string | null; maj: string };

const CURSEUR = "echo-curseur"; // l'heure (serveur) du dernier changement reçu
let foyer: Foyer | null = null;
let canal: RealtimeChannel | null = null;

// Une seule opération de synchro à la fois, dans l'ordre.
let chaine: Promise<unknown> = Promise.resolve();
const enFile = (fn: () => Promise<unknown>) => (chaine = chaine.then(fn).catch((e) => console.warn("[Echo synchro]", e)));
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

// Entrer dans le foyer : ce téléphone prend sa place (moi ou elle), et tout ce qu'il contient part au foyer.
async function entrer(foyerId: string, place: Personne, userId: string) {
  const avant = (await db.reglages.get("proprio"))?.valeur as Personne | undefined;
  // Ce rangement n'est pas un changement à envoyer : vider puis réécrire une table (échange des places) ferait partir
  // des suppressions vers le foyer. Ce qui doit partir est noté juste après, d'après ce que le téléphone contient vraiment.
  await db.transaction("rw", [db.taches, db.horaires, db.photos, db.reglages, db.cuisine_courses, db.cuisine_gouts, db.cuisine_tickets, db.budget_postes, db.budget_depenses, db.budget_apayer], async (tx) => {
    marquerDistante(tx);
    const ex = (await db.taches.filter((t) => !!t.ex).toArray()).map((t) => t.id);
    await db.taches.bulkDelete(ex);
    await db.photos.where("tacheId").anyOf(ex).delete();
    // Les tâches notées « pour moi » sur ce téléphone restent à la bonne personne.
    if (avant && avant !== place) {
      const inv = (q: Personne): Personne => (q === "moi" ? "elle" : "moi");
      const taches = await db.taches.toArray();
      await db.taches.bulkPut(taches.map((t) => ({ ...t, ...(t.qui === "nous" ? {} : { qui: inv(t.qui) }), ...(t.faitPar ? { faitPar: inv(t.faitPar) } : {}) })));
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
      // Budget : le salaire, les charges perso et le virement de chacun suivent la personne (les lignes de départ ont la place dans leur id).
      const postes = await db.budget_postes.toArray();
      await db.budget_postes.clear();
      await db.budget_postes.bulkPut(postes.map((p) => ({ ...p, id: p.id.replace(/-(moi|elle)$/, (_m, q: Personne) => "-" + inv(q)), ...(p.qui ? { qui: inv(p.qui) } : {}), valeurs: p.valeurs.map((v) => ({ ...v, ...(v.par ? { par: inv(v.par) } : {}) })) })));
      const depenses = await db.budget_depenses.toArray();
      await db.budget_depenses.bulkPut(depenses.map((d) => ({ ...d, qui: d.qui === "commun" ? d.qui : inv(d.qui) })));
      const apayer = await db.budget_apayer.toArray();
      await db.budget_apayer.bulkPut(apayer.map((l) => (l.compte === "moi" || l.compte === "elle" ? { ...l, compte: inv(l.compte) } : l)));
    }
    await db.reglages.bulkPut([{ cle: "proprio", valeur: place }, { cle: "foyer", valeur: { id: foyerId, userId } }]);
  });
  for (const t of await db.taches.toArray()) noter("tache:" + t.id);
  for (const h of await db.horaires.toArray()) noter(cleHoraire(h.qui, h.jour));
  // Les données des modules. Pour une clé « naturelle » (un produit, un jour, une personne), ce que le foyer a déjà gagne :
  // le téléphone qui arrive ne remplace pas l'historique d'achats ou les goûts des autres.
  const naturels = Object.keys(GENRES).filter((g) => GENRES[g].naturelle);
  const { data: dejaLa, error } = await supa.from("elements").select("genre, cle").eq("foyer_id", foyerId).in("genre", naturels).eq("supprime", false);
  const pris = new Set((dejaLa ?? []).map((l) => `${l.genre}:${l.cle}`));
  // Quelques genres gardent quand même la ligne d'ici (une ligne de budget remplie face à une ligne encore vide au foyer).
  const aComparer = naturels.filter((g) => GENRES[g].garderLocal);
  if (!error && aComparer.length && pris.size) {
    const { data: lignes } = await supa.from("elements").select("genre, cle, data").eq("foyer_id", foyerId).in("genre", aComparer).eq("supprime", false);
    for (const l of lignes ?? []) {
      const g = GENRES[l.genre], ici = await g.table.get(l.cle);
      if (ici && g.garderLocal!(ici, g.nettoyer(l.data))) pris.delete(`${l.genre}:${l.cle}`);
    }
  }
  for (const [genre, g] of Object.entries(GENRES)) {
    if (g.naturelle && error) continue; // foyer illisible pour l'instant : on n'écrase rien
    for (const cle of await g.table.toCollection().primaryKeys()) if (!pris.has(`${genre}:${cle}`)) noter(`${genre}:${cle}`);
  }
  try { localStorage.removeItem(CURSEUR); } catch { /* rien */ }
  await demarrer();
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

async function envoyer() {
  if (!foyer || !navigator.onLine) return;
  const file = lireFile();
  const cles = Object.keys(file);
  for (let i = 0; i < cles.length; i += 200) {
    const lot = cles.slice(i, i + 200);
    const lignes = (await Promise.all(lot.map(lireLigne))).filter((l) => l !== null);
    if (lignes.length) {
      const { error } = await supa.from("elements").upsert(lignes, { onConflict: "foyer_id,genre,cle" });
      if (error) throw error;
    }
    retirer(Object.fromEntries(lot.map((c) => [c, file[c]])));
  }
}

async function recevoir() {
  if (!foyer || !navigator.onLine) return;
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
  const attente = lireFile();
  const nouvelles: Array<{ par: string; texte: string }> = [];
  const membres = ((await db.reglages.get("membres"))?.valeur as Membre[] | undefined) ?? [];
  await db.transaction("rw", [db.taches, db.horaires, db.photos, db.corbeille, ...TABLES_MODULES], async (tx) => {
    marquerDistante(tx);
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
        const h = l.supprime ? null : nettoyerHoraire(l.data);
        if (h) await db.horaires.put(h);
        else await db.horaires.delete([qui, jour]);
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

const synchroniser = () => enFile(async () => { await envoyer(); await recevoir(); await chargerMembres(); });

/* ---------- Démarrage ---------- */

export async function demarrer() {
  foyer = await lireFoyer();
  if (!foyer) return;
  const { data } = await supa.auth.getSession();
  if (!data.session) return; // plus connecté : les Réglages proposent de reconnecter ce téléphone
  synchroniser();
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
