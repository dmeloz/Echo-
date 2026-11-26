import { createClient } from "@supabase/supabase-js";

// Le serveur d'Echo (Supabase, projet « echo »). La clé publique peut être dans l'app :
// ce sont les règles de la base (chacun ne voit que son foyer) qui protègent les données.
export const supa = createClient(
  "https://ewqvgayhptfwbpkxsaij.supabase.co",
  "sb_publishable_2wPVoYlPZUopFvilGr4-Yg_oak9HOi2",
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "echo-connexion" } },
);

// Les en-têtes pour les fonctions d'IA (echo, lire-horaires) : la session du foyer si le téléphone est relié,
// et le code Echo s'il a été écrit. Le serveur accepte l'un ou l'autre.
export async function entetesIA(code: string): Promise<Record<string, string>> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (code) h["x-echo-code"] = code;
  try {
    const { data } = await supa.auth.getSession();
    if (data.session) h.authorization = `Bearer ${data.session.access_token}`;
  } catch { /* pas de session : le code suffira */ }
  return h;
}
