import { useEffect, useRef } from "react";
import { toast, useSonner } from "sonner";

// Un seul message d'information à la fois près de la capsule : le plus récent remplace les simples informations
// d'avant, pour ne pas empiler des pastilles sur le bas des listes.
// On ne ferme JAMAIS en avance un message qui compte : un « Annuler » encore possible (ou une suite à la fermeture),
// une erreur, un message qui doit rester plus longtemps que d'habitude. Ceux-là restent et se suivent.
export interface Vu { id: number | string; arrive: number; simple: boolean }
const DUREE = 4000; // la durée par défaut des messages (App.tsx)

// Un message « simple » : une information qu'on peut remplacer sans rien perdre.
// eslint-disable-next-line react-refresh/only-export-components
export const estSimple = (t: { action?: unknown; cancel?: unknown; onDismiss?: unknown; duration?: number; type?: string; id: number | string }) =>
  !t.action && !t.cancel && !t.onDismiss && (t.duration ?? DUREE) <= DUREE && t.type !== "error" && t.id !== "erreur";

// Les messages à fermer : les simples, quand un message plus récent est arrivé après eux.
// eslint-disable-next-line react-refresh/only-export-components
export function aFermer(vus: Vu[]): Array<Vu["id"]> {
  if (vus.length < 2) return [];
  const dernier = Math.max(...vus.map((v) => v.arrive));
  return vus.filter((v) => v.simple && v.arrive < dernier).map((v) => v.id);
}

export function UnMessage() {
  const { toasts } = useSonner();
  // L'ordre d'arrivée, tenu ici (un message relancé avec le même id compte comme nouveau quand son texte change).
  const arrivees = useRef(new Map<number | string, { quand: number; titre: unknown }>());
  const fermes = useRef(new Set<number | string>());
  useEffect(() => {
    const vus: Vu[] = [];
    let n = Date.now();
    for (const t of toasts) {
      const avant = arrivees.current.get(t.id);
      if (!avant || avant.titre !== t.title) { arrivees.current.set(t.id, { quand: ++n, titre: t.title }); fermes.current.delete(t.id); }
      if (fermes.current.has(t.id)) continue;
      vus.push({ id: t.id, arrive: arrivees.current.get(t.id)!.quand, simple: estSimple(t) });
    }
    const presents = new Set(toasts.map((t) => t.id));
    for (const id of arrivees.current.keys()) if (!presents.has(id)) { arrivees.current.delete(id); fermes.current.delete(id); }
    for (const id of aFermer(vus)) { fermes.current.add(id); toast.dismiss(id); }
  }, [toasts]);
  return null;
}
