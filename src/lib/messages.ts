import { toast } from "sonner";

// La durée par défaut d'un message (le Toaster de App.tsx l'utilise).
export const DUREE_MESSAGE = 4000;
// La marque d'une confirmation courte (« Enregistré ») : la seule sorte de message qu'un message plus récent peut remplacer.
export const REMPLACABLE = "remplacable";
// Une confirmation courte, sans bouton : le message suivant la remplace au lieu de s'empiler dessus (src/components/UnMessage.tsx).
export const confirmer = (texte: string) => toast(texte, { className: REMPLACABLE });

// Confirmer seulement une fois que c'est vraiment fait : on attend l'écriture, et on dit l'échec s'il y en a un.
export const ECHEC_ECRITURE = "Pas enregistré. Libère un peu de place sur le téléphone, puis réessaie.";
export async function quandFait(travail: Promise<unknown>, texte: string, echec = ECHEC_ECRITURE) {
  try { await travail; } catch { toast(echec, { duration: 7000 }); return false; }
  confirmer(texte);
  return true;
}
