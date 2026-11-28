import { supa } from "../sync/client";
import { db } from "./db";

// Les rappels : le téléphone donne son accord, puis le serveur d'Echo envoie la notification à l'heure.
// (Sur iPhone, ça marche seulement quand Echo est installé sur l'écran d'accueil.)

export interface Rappels { actif: boolean; aLHeure: boolean; matin: string | null }
export const RAPPELS_DEFAUT: Rappels = { actif: false, aLHeure: true, matin: "07:30" };

export const rappelsPossibles = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const enOctets = (b64: string) => Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const ranger = (r: Rappels) => db.reglages.put({ cle: "rappels", valeur: r });

async function abonnement(creer: boolean) {
  const reg = await navigator.serviceWorker.ready;
  const deja = await reg.pushManager.getSubscription();
  if (deja || !creer) return deja;
  // La clé publique vient du serveur d'Echo (il a fabriqué la paire lui-même).
  const { data: cle } = await supa.rpc("cle_rappels");
  if (typeof cle !== "string" || !cle) throw new Error("clé absente");
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: enOctets(cle) });
}

// Allumer ou régler les rappels. Lance une erreur avec une phrase à montrer si ça ne peut pas marcher.
export async function reglerRappels(r: Rappels) {
  if (!r.actif) return couperRappels(r);
  if (!rappelsPossibles()) throw new Error("Ce téléphone ne permet pas les notifications ici. Sur iPhone, ouvre Echo depuis l'écran d'accueil.");
  if ((await Notification.requestPermission()) !== "granted") throw new Error("Les notifications sont refusées pour Echo. Autorise-les dans les Réglages du téléphone, puis réessaie.");
  let a: PushSubscriptionJSON;
  try { a = (await abonnement(true))!.toJSON(); }
  catch { throw new Error(navigator.onLine ? "Le téléphone n'a pas pu s'inscrire aux notifications. Ferme Echo, rouvre-le, puis réessaie." : "Pas de réseau. Réessaie quand tu as une connexion."); }
  try { await inscrire(a, r); }
  catch { throw new Error(navigator.onLine ? "Le serveur d'Echo n'a pas pu noter les rappels. Réessaie dans un instant." : "Pas de réseau. Réessaie quand tu as une connexion."); }
  await ranger(r);
  const compte = (await supa.auth.getSession()).data.session?.user.id;
  if (compte) await db.reglages.put({ cle: COMPTE, valeur: compte });
}

// Note l'abonnement de ce téléphone sur le serveur, au nom du compte connecté.
// Si la ligne existe déjà au nom d'un ancien compte de ce téléphone, le serveur la lui redonne d'abord
// (il vérifie les clés de l'abonnement, que seul ce téléphone connaît) : sans ça, l'écriture serait refusée.
async function inscrire(a: PushSubscriptionJSON, r: Rappels) {
  const repris = await supa.rpc("reprendre_abonnement", { p_endpoint: a.endpoint, p_p256dh: a.keys?.p256dh, p_auth: a.keys?.auth });
  if (repris.error) console.warn("[Echo rappels]", repris.error.message);
  const { error } = await supa.from("abonnements").upsert({
    endpoint: a.endpoint, p256dh: a.keys?.p256dh, auth: a.keys?.auth,
    fuseau: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Zurich",
    a_l_heure: r.aLHeure, matin: r.matin, maj: new Date().toISOString(),
  }, { onConflict: "endpoint" });
  if (error) throw error;
}

// Après une reconnexion au foyer, le téléphone a un nouveau compte : ses rappels doivent le suivre,
// sinon le serveur continue de chercher les tâches de l'ancien compte (qui n'est plus dans le foyer) et n'envoie plus rien.
// Appelé à chaque démarrage de la synchro ; ne fait rien tant que le compte n'a pas changé.
const COMPTE = "rappelsCompte";
export async function rattacherRappels(compte: string) {
  const r = (await db.reglages.get("rappels"))?.valeur as Rappels | undefined;
  if (!r?.actif || !rappelsPossibles()) return;
  if ((await db.reglages.get(COMPTE))?.valeur === compte) return;
  const a = (await abonnement(false))?.toJSON();
  if (!a?.endpoint) return;
  await inscrire(a, r);
  await db.reglages.put({ cle: COMPTE, valeur: compte });
}

async function couperRappels(r: Rappels) {
  await ranger({ ...r, actif: false });
  if (!rappelsPossibles()) return;
  const a = await abonnement(false);
  if (!a) return;
  await supa.from("abonnements").delete().eq("endpoint", a.endpoint);
  await a.unsubscribe();
}
