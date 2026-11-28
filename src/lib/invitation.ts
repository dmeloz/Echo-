import { useSyncExternalStore } from "react";

// Le lien d'invitation au foyer : https://…/Echo-/#rejoindre=123456.
// Le code est dans le « # » : il n'est jamais envoyé au serveur des pages, seul le téléphone qui ouvre le lien le lit.
// Il attend ici jusqu'à ce que ce téléphone rejoigne le foyer, en crée un, ou dise « Plus tard ».
const FORME = /^#rejoindre=(\d{6})$/;

export const codeDuLien = (hash: string): string | null => FORME.exec(hash)?.[1] ?? null;

// L'adresse d'Echo (celle où l'app est ouverte), avec le code.
export const lienInvitation = (code: string, adresse = location.href) => {
  const u = new URL(adresse);
  u.search = "";
  u.hash = `rejoindre=${code}`;
  return u.href;
};

// Echo ouvert dans Safari, sur iPhone ou iPad (pas depuis l'écran d'accueil) : il vaut mieux l'installer avant
// de rejoindre le foyer, car l'app de l'écran d'accueil ne voit rien de ce qui a été fait dans Safari.
export const dansSafariIos = (n: Navigator = navigator, installe = matchMedia("(display-mode: standalone)").matches) => {
  const ios = /iPhone|iPad|iPod/.test(n.userAgent) || (/Macintosh/.test(n.userAgent) && n.maxTouchPoints > 1);
  return ios && !installe && !(n as Navigator & { standalone?: boolean }).standalone;
};

let code = typeof location === "undefined" ? null : codeDuLien(location.hash);
const abonnes = new Set<() => void>();
const prevenir = () => abonnes.forEach((f) => f());

function suivre(f: () => void) {
  abonnes.add(f);
  const lu = () => { const c = codeDuLien(location.hash); if (c && c !== code) { code = c; prevenir(); } };
  addEventListener("hashchange", lu);
  return () => { abonnes.delete(f); removeEventListener("hashchange", lu); };
}

export const useInvitation = () => useSyncExternalStore(suivre, () => code, () => null);

// Le code a servi (ou n'est plus voulu) : on l'oublie, et il quitte l'adresse.
export function oublierInvitation() {
  if (codeDuLien(location.hash)) history.replaceState(null, "", location.pathname + location.search);
  if (code === null) return;
  code = null;
  prevenir();
}
