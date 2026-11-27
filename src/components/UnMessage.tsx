import { useEffect } from "react";
import { toast, useSonner } from "sonner";

// Un seul message à la fois près de la capsule : le plus récent remplace les précédents, pour ne pas empiler
// des pastilles sur le bas des listes. Seule exception : un message qui porte « Annuler » reste visible si le
// suivant n'a pas de bouton (on ne perd pas l'annulation à cause d'une simple information).
// Les messages à fermer, du plus récent au plus ancien (le premier de la liste est celui qui vient d'arriver).
// eslint-disable-next-line react-refresh/only-export-components
export function aFermer<T extends { id: number | string; action?: unknown }>(vivants: T[]): Array<T["id"]> {
  if (vivants.length < 2) return [];
  const [dernier, ...anciens] = vivants;
  let garde = false; // au plus un ancien message gardé, le plus récent qui porte un bouton
  return anciens.filter((a) => { if (a.action && !dernier.action && !garde) { garde = true; return false; } return true; }).map((a) => a.id);
}

export function UnMessage() {
  const { toasts } = useSonner();
  useEffect(() => {
    // sonner range le plus récent en premier
    for (const id of aFermer(toasts.filter((t) => !t.delete))) toast.dismiss(id);
  }, [toasts]);
  return null;
}
