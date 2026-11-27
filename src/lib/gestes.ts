import { useEffect } from "react";
// Les quatre gestes d'Echo (voir docs/REGLES-UI.md). Durées tenues dans styles.css (--m-*).
export const DUREE_RESPIRE = 420;

// « Elle tremble » : c'est raté. Rejoue l'animation même si elle vient d'avoir lieu.
export function trembler(el: Element | null) {
  if (!el) return;
  el.classList.remove("tremble");
  void (el as HTMLElement).offsetWidth;
  el.classList.add("tremble");
  setTimeout(() => el.classList.remove("tremble"), 340);
}

// La vibration vient sous le doigt, au moment du toucher.
export const vibrer = (ms = 8) => navigator.vibrate?.(ms);

// Garder l'écran allumé tant que la page est ouverte (si le téléphone le permet), et repartir du haut.
export function useEcranAllume() {
  useEffect(() => {
    let verrou: { release: () => Promise<void> } | null = null, parti = false;
    const prendre = () => (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock
      ?.request("screen").then((v) => { if (parti) v.release(); else verrou = v; }).catch(() => {});
    const retour = () => { if (!document.hidden) prendre(); };
    prendre();
    document.addEventListener("visibilitychange", retour);
    document.querySelector(".defile")?.scrollTo(0, 0);
    return () => { parti = true; verrou?.release().catch(() => {}); document.removeEventListener("visibilitychange", retour); };
  }, []);
}

