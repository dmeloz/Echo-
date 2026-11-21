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
