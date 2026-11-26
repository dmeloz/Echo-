import { createClient } from "@supabase/supabase-js";

// Le serveur d'Echo (Supabase, projet « echo »). La clé publique peut être dans l'app :
// ce sont les règles de la base (chacun ne voit que son foyer) qui protègent les données.
export const supa = createClient(
  "https://ewqvgayhptfwbpkxsaij.supabase.co",
  "sb_publishable_2wPVoYlPZUopFvilGr4-Yg_oak9HOi2",
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "echo-connexion" } },
);
