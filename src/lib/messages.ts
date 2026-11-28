import { toast } from "sonner";

// La durée par défaut d'un message (le Toaster de App.tsx l'utilise).
export const DUREE_MESSAGE = 4000;
// La marque d'une confirmation courte (« Enregistré ») : la seule sorte de message qu'un message plus récent peut remplacer.
export const REMPLACABLE = "remplacable";
// Une confirmation courte, sans bouton : le message suivant la remplace au lieu de s'empiler dessus (src/components/UnMessage.tsx).
export const confirmer = (texte: string) => toast(texte, { className: REMPLACABLE });
