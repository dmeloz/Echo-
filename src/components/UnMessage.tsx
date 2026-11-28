import { useEffect, useRef } from "react";
import { toast, useSonner, type ToastT } from "sonner";

// Un seul petit message de confirmation à la fois près de la capsule : « Enregistré », « Ordre changé »…
// Le plus récent remplace les confirmations d'avant, pour ne pas empiler des pastilles sur le bas des listes.
// Tout le reste n'est JAMAIS fermé en avance : un « Annuler » encore possible, une suite à la fermeture,
// un échec (« Pas enregistré. Réessaie. »), une explication à lire, un message qui doit rester plus longtemps.
export interface Vu { id: number | string; arrive: number; simple: boolean }
const DUREE = 4000; // la durée par défaut des messages (App.tsx)
const ECHEC = /pas |n'a |n'ai |r[ée]essaie|impossible|erreur|ne peu/i;

// Une confirmation courte qu'on peut remplacer sans rien perdre.
// eslint-disable-next-line react-refresh/only-export-components
export function estSimple(t: Partial<ToastT> & { id: number | string }) {
  if (t.action || t.cancel || t.onDismiss || t.onAutoClose || t.jsx || t.promise || t.dismissible === false) return false;
  if ((t.duration ?? DUREE) > DUREE || (t.type && t.type !== "default" && t.type !== "normal" && t.type !== "success") || t.id === "erreur") return false;
  const texte = typeof t.title === "string" ? t.title : "";
  return !!texte && texte.length <= 40 && !t.description && !ECHEC.test(texte);
}

// Les messages à fermer : les confirmations simples, quand un message plus récent est arrivé après elles.
// eslint-disable-next-line react-refresh/only-export-components
export function aFermer(vus: Vu[]): Array<Vu["id"]> {
  if (vus.length < 2) return [];
  const dernier = Math.max(...vus.map((v) => v.arrive));
  return vus.filter((v) => v.simple && v.arrive < dernier).map((v) => v.id);
}

export function UnMessage() {
  const { toasts } = useSonner();
  // L'ordre d'arrivée, tenu ici avec un compteur : un message relancé (même id, nouvel objet) compte comme nouveau.
  const compteur = useRef(0);
  const arrivees = useRef(new Map<number | string, { n: number; objet: ToastT }>());
  const fermes = useRef(new Set<number | string>());
  useEffect(() => {
    const vus: Vu[] = [];
    for (const t of [...toasts].reverse()) { // sonner range le plus récent en premier : on numérote du plus ancien au plus récent
      const avant = arrivees.current.get(t.id);
      if (!avant || avant.objet !== t) { arrivees.current.set(t.id, { n: ++compteur.current, objet: t }); fermes.current.delete(t.id); }
      if (fermes.current.has(t.id)) continue;
      vus.push({ id: t.id, arrive: arrivees.current.get(t.id)!.n, simple: estSimple(t) });
    }
    const presents = new Set(toasts.map((t) => t.id));
    for (const id of [...arrivees.current.keys()]) if (!presents.has(id)) { arrivees.current.delete(id); fermes.current.delete(id); }
    for (const id of aFermer(vus)) { fermes.current.add(id); toast.dismiss(id); }
  }, [toasts]);
  return null;
}
