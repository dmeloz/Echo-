// Le clavier de l'iPhone se pose par-dessus la page sans la raccourcir : la barre d'écriture serait cachée dessous.
// On mesure la place qu'il prend (la partie visible de l'écran rétrécit) et on remonte la barre et la capsule d'autant.
export function suivreClavier() {
  const vv = window.visualViewport;
  if (!vv) return;
  const racine = document.documentElement;
  let image = 0;
  const mesurer = () => {
    image = 0;
    const cache = Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop));
    // Moins de 80 px : c'est la barre d'outils de Safari, pas le clavier.
    racine.style.setProperty("--clavier", cache > 80 ? `${cache}px` : "0px");
    racine.classList.toggle("clavier-ouvert", cache > 80);
  };
  const planifier = () => { if (!image) image = requestAnimationFrame(mesurer); };
  vv.addEventListener("resize", planifier);
  vv.addEventListener("scroll", planifier);
  // iOS fait parfois défiler toute la page pour montrer le champ : on la remet en place.
  addEventListener("focusin", (e) => {
    if ((e.target as Element).closest?.(".barre-bas")) setTimeout(() => { scrollTo(0, 0); planifier(); }, 50);
  });
  mesurer();
}
