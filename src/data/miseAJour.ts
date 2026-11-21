import { useSyncExternalStore } from "react";

// L'état des mises à jour, partagé entre le bandeau et les Réglages.
interface Etat { disponible: boolean; enCours: boolean; reg: ServiceWorkerRegistration | null; installer: (() => Promise<void>) | null }
let etat: Etat = { disponible: false, enCours: false, reg: null, installer: null };
const abonnes = new Set<() => void>();
export const majEtat = (x: Partial<Etat>) => { etat = { ...etat, ...x }; abonnes.forEach((f) => f()); };
export const useMiseAJour = () => useSyncExternalStore((f) => { abonnes.add(f); return () => abonnes.delete(f); }, () => etat);

export async function installer() {
  if (!etat.installer) { location.reload(); return; }
  majEtat({ enCours: true });
  await etat.installer();
  setTimeout(() => location.reload(), 1500); // filet de sécurité si la page ne s'est pas rechargée
}

// Chercher une nouvelle version maintenant. Répond true si une version attend.
export async function chercher(): Promise<boolean> {
  if (!etat.reg) return false;
  try { await etat.reg.update(); } catch { return etat.disponible; }
  await new Promise((ok) => setTimeout(ok, 2500)); // le temps de télécharger la nouvelle version
  return etat.disponible || !!etat.reg.waiting;
}

// Le numéro de version : la date de construction et le code du changement.
export const VERSION = `${__DATE_VERSION__}${__CODE_VERSION__ ? " · " + __CODE_VERSION__ : ""}`;
