// Envoie les rappels d'Echo : à l'heure d'une tâche, et le résumé du matin.
// Appelée chaque minute par la base (pg_cron). Elle refuse tout appel sans le secret echo_cron.
// Les secrets (echo_cron et les clés d'envoi) sont fabriqués et gardés par le serveur, dans le coffre de la base :
// jamais dans l'app ni dans le dépôt.
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { aEnvoyer, type Abonne, type TacheLue } from "./quoi.ts";

interface Ligne { id: string; user_id: string; endpoint: string; p256dh: string; auth: string; fuseau: string; a_l_heure: boolean; matin: string | null }

Deno.serve(async (req) => {
  const base = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  // Les secrets sont dans le coffre de la base (vault) : echo_cron, vapid_publique, vapid_privee.
  const { data: coffre } = await base.rpc("secrets_rappels");
  const secrets = Object.fromEntries(((coffre ?? []) as Array<{ nom: string; valeur: string }>).map((x) => [x.nom, x.valeur]));
  if (!secrets.echo_cron || req.headers.get("x-echo-cron") !== secrets.echo_cron) return new Response("non", { status: 401 });
  // Premier passage : le serveur fabrique lui-même ses clés d'envoi et les range dans le coffre.
  if (!secrets.vapid_publique || !secrets.vapid_privee) {
    const k = webpush.generateVAPIDKeys();
    const { error: e } = await base.rpc("poser_cles_rappels", { p_publique: k.publicKey, p_privee: k.privateKey });
    return Response.json(e ? { erreur: e.message } : { cles: "créées" }, { status: e ? 500 : 200 });
  }
  webpush.setVapidDetails("https://dmeloz.github.io/Echo-/", secrets.vapid_publique, secrets.vapid_privee);
  const now = new Date();

  const { data: abonnes, error } = await base.from("abonnements").select("id, user_id, endpoint, p256dh, auth, fuseau, a_l_heure, matin");
  if (error) return Response.json({ erreur: error.message }, { status: 500 });
  if (!abonnes?.length) return Response.json({ envoyes: 0 });

  const { data: membres } = await base.from("membres").select("user_id, foyer_id, place").in("user_id", [...new Set(abonnes.map((a: Ligne) => a.user_id))]);
  const parUser = new Map((membres ?? []).map((m) => [m.user_id, m]));
  const foyers = [...new Set((membres ?? []).map((m) => m.foyer_id))];
  // Seulement les tâches pas faites, jusqu'à demain (tous fuseaux), lues par pages : pas de limite à 1000 lignes.
  const demain = new Date(now.getTime() + 2 * 86400_000).toISOString().slice(0, 10);
  const elements: Array<{ foyer_id: string; data: unknown }> = [];
  for (let de = 0; ; de += 1000) {
    const { data: page, error: e } = await base.from("elements").select("foyer_id, data")
      .eq("genre", "tache").eq("supprime", false).in("foyer_id", foyers)
      .is("data->>fait", null).lte("data->>jour", demain)
      .order("foyer_id").order("cle").range(de, de + 999);
    if (e) return Response.json({ erreur: e.message }, { status: 500 });
    elements.push(...(page ?? []));
    if (!page || page.length < 1000) break;
  }
  const taches = new Map<string, TacheLue[]>();
  for (const e of elements) {
    const d = e.data as TacheLue | null;
    if (!d || typeof d.titre !== "string" || typeof d.jour !== "string") continue;
    taches.set(e.foyer_id, [...(taches.get(e.foyer_id) ?? []), d]);
  }

  let envoyes = 0;
  for (const l of abonnes as Ligne[]) {
    const m = parUser.get(l.user_id);
    if (!m) continue;
    const a: Abonne = { id: l.id, place: m.place, fuseau: l.fuseau, aLHeure: l.a_l_heure, matin: l.matin };
    const envois = aEnvoyer(a, taches.get(m.foyer_id) ?? [], now);
    if (!envois.length) continue;
    // Une clé déjà notée = déjà envoyé : seules les nouvelles reviennent.
    const { data: nouvelles } = await base.from("rappels_envoyes").upsert(envois.map((e) => ({ cle: e.cle })), { onConflict: "cle", ignoreDuplicates: true }).select("cle");
    const aFaire = new Set((nouvelles ?? []).map((n) => n.cle));
    for (const e of envois.filter((x) => aFaire.has(x.cle))) {
      try {
        await webpush.sendNotification({ endpoint: l.endpoint, keys: { p256dh: l.p256dh, auth: l.auth } }, JSON.stringify({ titre: e.titre, texte: e.texte, tag: e.tag }), { TTL: 3600, urgency: "high" });
        envoyes++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        // Le téléphone a retiré son autorisation : on oublie cet abonnement.
        if (code === 404 || code === 410) await base.from("abonnements").delete().eq("id", l.id);
        else console.warn("[rappels]", code, (err as Error).message);
      }
    }
  }
  // Ménage : les clés de plus de 3 jours ne servent plus.
  await base.from("rappels_envoyes").delete().lt("quand", new Date(now.getTime() - 3 * 86400_000).toISOString());
  return Response.json({ envoyes });
});
