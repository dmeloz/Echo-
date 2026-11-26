// Qui a le droit d'appeler une fonction d'IA d'Echo, et combien de fois.
// 1. Un membre d'un foyer, connecté (jeton de sa session Echo) : c'est le cas normal, rien à régler.
// 2. Sinon, le code secret du foyer (secret ECHO_CODE), pour un téléphone pas encore relié au foyer.
// Chaque appel est compté (par personne et pour tout le monde) : une fuite ne peut pas vider le crédit d'IA.
import { createClient } from "npm:@supabase/supabase-js@2";

export interface Limites { parPersonne: number; tous: number }
export type Garde = { ok: true } | { ok: false; erreur: "code" | "limite"; statut: number };

function egal(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function garder(req: Request, quoi: string, limites: Limites): Promise<Garde> {
  const base = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  let qui = "";
  const jeton = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (jeton) {
    const { data } = await base.auth.getUser(jeton);
    if (data.user) {
      const { data: m } = await base.from("membres").select("foyer_id").eq("user_id", data.user.id).maybeSingle();
      if (m) qui = `u:${data.user.id}`;
    }
  }
  if (!qui && egal(req.headers.get("x-echo-code") ?? "", Deno.env.get("ECHO_CODE") ?? "")) qui = "code";
  if (!qui) return { ok: false, erreur: "code", statut: 401 };
  const { data: permis, error } = await base.rpc("noter_appel", { p_qui: qui, p_quoi: quoi, p_max_personne: limites.parPersonne, p_max_tous: limites.tous });
  if (error || permis !== true) return { ok: false, erreur: "limite", statut: 429 };
  return { ok: true };
}
