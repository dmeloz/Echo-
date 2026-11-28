import { toast } from "sonner";

// La durée par défaut d'un message (le Toaster de App.tsx l'utilise).
export const DUREE_MESSAGE = 4000;
// La marque d'une confirmation courte (« Enregistré ») : la seule sorte de message qu'un message plus récent peut remplacer.
export const REMPLACABLE = "remplacable";
// Une confirmation courte, sans bouton : le message suivant la remplace au lieu de s'empiler dessus (src/components/UnMessage.tsx).
export const confirmer = (texte: string) => toast(texte, { className: REMPLACABLE });

// Confirmer seulement une fois que c'est vraiment fait : on attend l'écriture, et on dit l'échec s'il y en a un.
// Le conseil « libère de la place » seulement quand c'est bien le stockage qui est plein.
const plein = (e: unknown, n = 0): boolean => {
  if (!e || typeof e !== "object" || n > 3) return false;
  const x = e as { name?: string; inner?: unknown; failures?: unknown[] };
  return x.name === "QuotaExceededError" || plein(x.inner, n + 1) || (Array.isArray(x.failures) && x.failures.some((f) => plein(f, n + 1)));
};
export const echecEcriture = (e: unknown) =>
  plein(e) ? "Pas enregistré : le téléphone manque de place. Libère un peu de stockage, puis réessaie." : "Pas enregistré. Réessaie.";
// travail rend false quand il n'y avait rien à faire : on le dit au lieu de confirmer.
export async function quandFait(travail: Promise<unknown>, texte: string, echec?: string, rien?: string) {
  let r: unknown;
  try { r = await travail; } catch (e) { toast(echec ?? echecEcriture(e), { duration: 7000 }); return false; }
  if (r === false) { if (rien) toast(rien); return false; }
  confirmer(texte);
  return true;
}
