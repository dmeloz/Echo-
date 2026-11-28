// Le mouvement des pages, tenu à un seul endroit (rien à écrire dans les modules).
// 1. Le sens : ce qui arrive à l'écran vient du côté où l'on va. Un onglet (ou un jour) plus à droite :
//    la page vient de la droite. Un retour : elle revient de la gauche. Une flèche « mois d'avant » ou « d'après »
//    (data-va sur le bouton) : pareil. html[data-sens] le dit, finitions.css fait le reste.
//    Le sens ne dure que le temps de l'arrivée, puis tout revient au mouvement de base (monter doucement).
// 2. Le chemin du retour : une sous-page s'ouvre en haut, et le retour ramène là où l'on était dans la page d'avant.
export type Sens = "droite" | "gauche" | "retour" | "avant" | "apres";

const DUREE = 700; // la plus longue arrivée (cascade comprise) est finie avant
const GROUPES = ".vues, .bande-jours, .vue-choix"; // les choix posés côte à côte, dans l'ordre de lecture
const CHOISI = '[aria-selected="true"], [aria-pressed="true"]';
const RETOURS = ".retour, .retour-agenda";
let minuterie = 0;

// « avant » : la place de l'onglet quitté, pour que la goutte de verre parte de là même si la barre est redessinée.
export function poserSens(sens: Sens, avant?: number) {
  const racine = document.documentElement;
  racine.dataset.sens = sens;
  if (avant === undefined) racine.style.removeProperty("--i-avant"); else racine.style.setProperty("--i-avant", String(avant));
  clearTimeout(minuterie);
  minuterie = window.setTimeout(() => { delete racine.dataset.sens; racine.style.removeProperty("--i-avant"); }, DUREE);
}

// D'un choix à l'autre dans un groupe : de quel côté part-on ? (null : pas de sens à donner)
export function sensDuChoix(avant: number, apres: number): Sens | null {
  if (avant < 0 || apres < 0 || avant === apres) return null;
  return apres > avant ? "droite" : "gauche";
}

// La mémoire du chemin : pour chaque page quittée vers une sous-page, la hauteur où l'on était.
// Une page se reconnaît à son module et au mot de son bouton retour (rien pour la page de départ).
export interface Etape { page: string; haut: number }
// Au retour : la hauteur à retrouver pour la page où l'on arrive, et ce qui reste du chemin.
export function reprendre(pile: Etape[], page: string): { haut: number | null; pile: Etape[] } {
  const i = pile.map((e) => e.page).lastIndexOf(page);
  return i < 0 ? { haut: null, pile } : { haut: pile[i].haut, pile: pile.slice(0, i) };
}

// À lancer une fois, au démarrage. Écoute en « capture » : le sens est posé avant que la page ne change.
export function suivreMouvement() {
  let pile: Etape[] = [], module = location.hash;
  const defile = () => document.querySelector<HTMLElement>(".defile");
  const bouton = () => document.querySelector(".scene .retour, .scene .retour-agenda");
  const ici = () => `${location.hash}|${bouton()?.textContent?.trim() ?? ""}`;
  // Changer de module efface le chemin : on ne « revient » pas d'un module à l'autre.
  const memeModule = () => { if (location.hash !== module) { module = location.hash; pile = []; } };

  const revenir = () => {
    poserSens("retour");
    memeModule();
    const avant = ici();
    requestAnimationFrame(() => {
      const page = ici();
      if (page === avant) return;
      const suite = reprendre(pile, page);
      pile = suite.pile;
      if (suite.haut !== null) defile()?.scrollTo(0, suite.haut);
    });
  };

  addEventListener("click", (e) => {
    const cible = e.target instanceof Element ? e.target : null;
    if (!cible) return;
    if (cible.closest(RETOURS)) { revenir(); return; }
    // Une flèche « d'avant » ou « d'après » (mois, semaine) le dit elle-même : data-va="avant" ou "apres".
    const va = cible.closest<HTMLElement>("[data-va]")?.dataset.va;
    if (va === "avant" || va === "apres") poserSens(va);
    const choix = cible.closest("button"), groupe = choix?.closest(GROUPES);
    if (choix && groupe) {
      const boutons = [...groupe.querySelectorAll("button")];
      const avant = boutons.findIndex((b) => b.matches(CHOISI));
      const sens = sensDuChoix(avant, boutons.indexOf(choix));
      if (sens) poserSens(sens, groupe.matches(".vues") ? avant : undefined);
    }
    // Ce toucher ouvre-t-il une sous-page ? On le voit à l'image suivante : un bouton retour est apparu (ou a changé de mot).
    memeModule();
    const avant = ici(), haut = defile()?.scrollTop ?? 0;
    requestAnimationFrame(() => {
      if (location.hash !== module || !bouton() || ici() === avant) return;
      pile = [...pile.slice(-7), { page: avant, haut }];
      defile()?.scrollTo(0, 0);
    });
  }, true);
  // Le geste (glisser vers la droite) et le menu envoient « echo-retour » : même chemin que le bouton retour.
  addEventListener("echo-retour", revenir, true);
}
