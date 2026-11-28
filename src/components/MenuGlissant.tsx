import { vibrer as vibrerPartout } from "../lib/gestes";
import { useEffect, useRef, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Settings } from "pulsoicon-react";

// Le menu glissant : la page vit devant, le menu derrière, en coulisses.
// Ouvrir le menu = pousser la page vers la gauche ; elle recule, pivote et devient une carte.
// Mécanique reprise de menu-carte.html (ressorts, élan du doigt, parcours au doigt), menu à droite.

export interface EntreeMenu { id: string; libelle: string; bientot?: boolean; pastille?: number }

const MOUVEMENT = {
  panneau: { reponse: 0.52, amorti: 0.88 },
  details: { reponse: 0.5, amorti: 0.62 },
  carte: { decalage: 0.75, echelle: 0.8, pivot: 14 },
  elan: 0.2,
};
const S = -1; // menu à droite, pour le pouce droit
type Ressort = { reponse: number; amorti: number };
const raideur = (r: Ressort) => (2 * Math.PI / r.reponse) ** 2;
const frottement = (r: Ressort) => 4 * Math.PI * r.amorti / r.reponse;

// Le ressort des petits détails, en courbe CSS linear().
(function () {
  if (typeof CSS === "undefined" || !CSS.supports("transition-timing-function", "linear(0, 1)")) return;
  const r = MOUVEMENT.details, k = raideur(r), c = frottement(r), h = 1 / 600;
  let x = 0, v = 0, t = 0; const pts = ["0"];
  while (t < 2) {
    for (let i = 0; i < 10; i++) { v += (-k * (x - 1) - c * v) * h; x += v * h; t += h; }
    pts.push(x.toFixed(4));
    if (Math.abs(x - 1) < 0.002 && Math.abs(v) < 0.05) break;
  }
  pts[pts.length - 1] = "1";
  document.documentElement.style.setProperty("--ressort", `linear(${pts.join(", ")})`);
  document.documentElement.style.setProperty("--ressort-duree", `${t.toFixed(2)}s`);
})();

interface Props {
  entrees: EntreeMenu[];
  active: string;
  nom: string;
  initiale: string;
  onChoisir: (id: string) => void;
  onApercu: (id: string | null) => void;
  onOuvert?: () => void;
  echo?: ReactNode; // l'étoile Echo, sous le menu dans la même capsule
  children: ReactNode;
}

export function MenuGlissant({ entrees, active, nom, initiale, onChoisir, onApercu, onOuvert, echo, children }: Props) {
  const r = {
    coulisses: useRef<HTMLDivElement>(null), menu: useRef<HTMLElement>(null), liste: useRef<HTMLUListElement>(null),
    point: useRef<HTMLSpanElement>(null), scene: useRef<HTMLDivElement>(null), defile: useRef<HTMLDivElement>(null),
    bascule: useRef<HTMLButtonElement>(null), lumiere: useRef<HTMLDivElement>(null),
  };
  // Les fonctions appelées par les gestes lisent toujours les dernières valeurs.
  const derniers = useRef({ active, onChoisir, onApercu, onOuvert });
  derniers.current = { active, onChoisir, onApercu, onOuvert };
  const api = useRef<{ marquer: (anime: boolean) => void } | null>(null);

  useEffect(() => {
    const racine = document.documentElement;
    const scene = r.scene.current!, coulisses = r.coulisses.current!, menu = r.menu.current!, liste = r.liste.current!;
    const point = r.point.current!, bascule = r.bascule.current!, defile = r.defile.current!, lumiere = r.lumiere.current!;
    const reduit = matchMedia("(prefers-reduced-motion: reduce)");
    const vibrer = (ms = 8) => { try { vibrerPartout(ms); } catch { /* rien */ } };
    const estOuvert = () => racine.classList.contains("menu-ouvert");
    const lignes = () => [...liste.querySelectorAll<HTMLAnchorElement>(".ligne")];
    const morceaux = () => [menu.querySelector<HTMLElement>(".qui")!, ...[...liste.children].filter((e) => e !== point) as HTMLElement[], menu.querySelector<HTMLElement>(".pied")!];

    function marquer(anime: boolean) {
      const a = lignes().find((l) => l.dataset.id === derniers.current.active);
      point.style.opacity = a ? "1" : "0";
      if (!a) return;
      if (!anime) point.style.transition = "none";
      point.style.transform = `translateY(${a.parentElement!.offsetTop + a.offsetHeight / 2}px)`;
      if (!anime) { void point.offsetWidth; point.style.transition = ""; }
    }
    api.current = { marquer };

    let p = 0, v = 0, cible = 0, rafId = 0, tPrec = 0, rafRendu = 0;
    const largeur = () => innerWidth;
    const elastique = (d: number, max = 0.08) => (1 - 1 / (d * 0.55 / max + 1)) * max;
    function rendu() {
      const C = MOUVEMENT.carte, q = Math.max(0, p);
      const tx = q * C.decalage * largeur();
      const s = 1 - Math.min(1, q) * (1 - C.echelle);
      scene.style.transform = q > 0.0005 ? `perspective(1400px) translate3d(${S * tx}px, 0, 0) rotateY(${-S * Math.min(1, q) * C.pivot}deg) scale(${s})` : "";
      scene.classList.toggle("en-carte", q > 0.0005);
      coulisses.style.transform = `scale(${1.06 - Math.min(1, q) * 0.06})`;
      morceaux().forEach((el, i) => {
        const t = Math.min(1, Math.max(0, (q - i * 0.045) / 0.62));
        const e = 1 - (1 - t) ** 3;
        el.style.transform = `translate3d(${(1 - e) * -S * (48 + i * 10)}px, 0, 0)`;
        el.style.opacity = String(e);
      });
    }
    const planifier = () => { if (!rafRendu) rafRendu = requestAnimationFrame(() => { rafRendu = 0; rendu(); }); };
    function pas(t: number) {
      const dt = Math.min(0.05, (t - tPrec) / 1000); tPrec = t;
      const rr = MOUVEMENT.panneau, k = raideur(rr), c = frottement(rr);
      const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
      for (let i = 0; i < n; i++) { v += (-k * (p - cible) - c * v) * h; p += v * h; }
      if (Math.abs(v) < 0.01 && Math.abs(p - cible) < 0.001) { p = cible; v = 0; rendu(); rafId = 0; return; }
      rendu(); rafId = requestAnimationFrame(pas);
    }
    function animer(vers: number, vitesse = v) {
      cible = vers; v = vitesse;
      if (reduit.matches) { p = cible; v = 0; rendu(); return; }
      if (!rafId) { tPrec = performance.now(); rafId = requestAnimationFrame(pas); }
    }
    let auClavier = false;
    function ouvrir(vitesse?: number) {
      if (!estOuvert()) {
        (document.activeElement as HTMLElement | null)?.blur?.();
        racine.classList.add("menu-ouvert");
        derniers.current.onOuvert?.();
        menu.inert = false; defile.inert = true;
        bascule.setAttribute("aria-expanded", "true"); bascule.setAttribute("aria-label", "Fermer le menu");
        vibrer();
        if (auClavier) requestAnimationFrame(() => lignes().find((l) => l.dataset.id === derniers.current.active)?.focus({ preventScroll: true }));
      }
      animer(1, vitesse);
    }
    function fermer(vitesse?: number) {
      if (estOuvert()) {
        const focus = menu.contains(document.activeElement);
        racine.classList.remove("menu-ouvert");
        menu.inert = true; defile.inert = false;
        setTimeout(() => lignes().forEach((l) => l.classList.remove("vise")), 400);
        bascule.setAttribute("aria-expanded", "false"); bascule.setAttribute("aria-label", "Ouvrir le menu");
        if (focus) bascule.focus({ preventScroll: true });
      }
      animer(0, vitesse);
    }
    const choisir = (id: string) => { vibrer(); derniers.current.onApercu(null); derniers.current.onChoisir(id); setTimeout(() => fermer(), 120); };

    const off: Array<() => void> = [];
    const on = <K extends keyof WindowEventMap>(cibleEv: EventTarget, type: K | string, f: (e: never) => void, opts?: AddEventListenerOptions) => {
      cibleEv.addEventListener(type, f as EventListener, opts); off.push(() => cibleEv.removeEventListener(type, f as EventListener, opts));
    };

    on(bascule, "pointerdown", () => { auClavier = false; });
    on(bascule, "keydown", () => { auClavier = true; });
    on(bascule, "click", () => (estOuvert() ? fermer() : ouvrir()));
    on(scene.querySelector(".ombrage")!, "click", () => fermer());
    on(window, "keydown", (e: KeyboardEvent) => {
      if (!estOuvert()) return;
      if (e.key === "Escape") fermer();
      const ls = lignes(), i = ls.indexOf(document.activeElement as HTMLAnchorElement);
      if (e.key === "ArrowDown" && i >= 0) { e.preventDefault(); (ls[i + 1] || ls[0]).focus(); }
      if (e.key === "ArrowUp" && i >= 0) { e.preventDefault(); (ls[i - 1] || ls.at(-1)!).focus(); }
    });
    on(menu, "click", (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest<HTMLAnchorElement>(".ligne, .qui, .pied a");
      if (!a) return;
      e.preventDefault(); choisir(a.dataset.id!);
    });
    // Ouvrir le menu depuis la page (par exemple une tuile « Bientôt ») n'est pas nécessaire : la page navigue elle-même.

    // Parcourir le menu au doigt : la ligne sous le doigt grossit, la carte montre la page en aperçu.
    let parcours: { vise: HTMLAnchorElement | null; bouge: boolean } | null = null;
    const ligneA = (y: number) => lignes().find((l) => { const b = l.getBoundingClientRect(); return y >= b.top - 4 && y <= b.bottom + 4; }) || null;
    const allumer = (t: Touch) => { lumiere.style.left = t.clientX + "px"; lumiere.style.top = t.clientY + "px"; lumiere.style.opacity = "1"; };
    const eteindre = () => { lumiere.style.opacity = ""; };
    function viser(a: HTMLAnchorElement | null) {
      if (!parcours || a === parcours.vise) return;
      parcours.vise?.classList.remove("vise");
      parcours.vise = a;
      if (!a) { derniers.current.onApercu(null); marquer(true); return; }
      a.classList.add("vise");
      point.style.opacity = "1";
      point.style.transform = `translateY(${a.parentElement!.offsetTop + a.offsetHeight / 2}px)`;
      derniers.current.onApercu(a.dataset.id!);
      if (parcours.bouge) vibrer(4);
    }
    on(liste, "touchstart", (e: TouchEvent) => {
      if (!estOuvert() || e.touches.length > 1) return;
      parcours = { vise: null, bouge: false };
      allumer(e.touches[0]); viser(ligneA(e.touches[0].clientY));
      liste.classList.add("parcours");
    }, { passive: true });
    on(liste, "touchmove", (e: TouchEvent) => {
      if (!parcours) return;
      if (e.cancelable) e.preventDefault();
      parcours.bouge = true; allumer(e.touches[0]); viser(ligneA(e.touches[0].clientY));
    }, { passive: false });
    const finParcours = (e: TouchEvent) => {
      if (!parcours) return;
      const a = parcours.vise;
      liste.classList.remove("parcours");
      parcours = null; eteindre();
      if (e.cancelable) e.preventDefault();
      if (a && e.type === "touchend") choisir(a.dataset.id!);
      else { a?.classList.remove("vise"); derniers.current.onApercu(null); marquer(true); }
    };
    on(liste, "touchend", finParcours);
    on(liste, "touchcancel", finParcours);

    // Le geste sur la page : tirer vers la gauche ouvre le menu (sauf là où le doigt a déjà un autre geste :
    // une tâche, la grille des horaires, le résumé du matin, les pastilles des rayons). Tirer vers la droite, menu fermé : retour d'une sous-page, sinon rien.
    let g: { x0: number; y0: number; axe: "x" | "y" | null; base: number; traces: Array<[number, number]>; retour?: [number, number]; cible: HTMLElement } | null = null;
    // Le retour au doigt : la sous-page suit le doigt (en retenue) et s'efface un peu ; au-delà du seuil, un « tic » dit que lâcher fait revenir.
    const SEUIL_RETOUR = 70;
    const sousPage = () => scene.querySelector<HTMLElement>(".cadre.arrivee");
    const calme = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
    let passe = false;
    // Le même test qu'au lâcher : assez loin, et bien horizontal. Le « tic » ne promet que ce que lâcher fera.
    const retourPret = (dx: number, dy: number) => dx > SEUIL_RETOUR && Math.abs(dy) < dx * 0.5;
    const suivreRetour = (dx: number, dy: number) => {
      const el = sousPage();
      if (!el || calme()) return;
      const d = Math.max(0, dx);
      el.style.transition = "none";
      el.style.translate = `${Math.round(d * 0.4)}px 0`;
      el.style.opacity = String(1 - Math.min(d / 320, 0.45));
      if (retourPret(dx, dy) !== passe) { passe = !passe; if (passe) vibrer(4); }
    };
    const lacherRetour = (revenu: boolean) => {
      passe = false;
      const el = sousPage();
      if (!el || !el.style.translate) return;
      // Revenu : la page d'avant arrive seule par la gauche. Sinon : la sous-page reprend sa place en douceur.
      el.style.transition = revenu ? "none" : "translate .3s var(--douce), opacity .3s var(--douce)";
      el.style.translate = ""; el.style.opacity = "";
      setTimeout(() => { el.style.transition = ""; }, revenu ? 0 : 320);
    };
    // Une bande qui défile de côté sous le doigt garde son geste : pas de retour par-dessus.
    const defileDeCote = (el: HTMLElement | null) => {
      for (; el && el !== scene; el = el.parentElement) {
        if (el.scrollWidth > el.clientWidth + 8 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
      }
      return false;
    };
    on(window, "touchstart", (e: TouchEvent) => {
      const cibleT = e.target as HTMLElement;
      // Un deuxième doigt (ou un toucher ailleurs) pendant le retour : la sous-page reprend sa place.
      if (g?.retour) lacherRetour(false);
      if (e.touches.length > 1 || cibleT.closest?.(".capsule, .tache, .barre-bas, .feuille, .grille-mois, .resume, .resume-fond, .rayons, .gouts, input, textarea") || racine.classList.contains("feuille-ouverte")) { g = null; return; }
      if ((estOuvert() || rafId) && menu.contains(cibleT)) { g = null; return; }
      const t = e.touches[0];
      g = { x0: t.clientX, y0: t.clientY, axe: null, base: 0, traces: [], cible: cibleT };
    }, { passive: true });
    on(window, "touchmove", (e: TouchEvent) => {
      if (!g) return;
      const t = e.touches[0];
      if (g.retour) { g.retour = [t.clientX - g.x0, t.clientY - g.y0]; if (e.cancelable) e.preventDefault(); suivreRetour(g.retour[0], g.retour[1]); return; }
      if (!g.axe) {
        const dx = t.clientX - g.x0, dy = t.clientY - g.y0;
        if (Math.hypot(dx, dy) < 10) return;
        g.axe = Math.abs(dx) > Math.abs(dy) * 1.3 ? "x" : "y";
        if (g.axe === "y") { g = null; return; }
        if (!estOuvert() && p < 0.01 && dx * S < 0) {
          // Vers la droite, menu fermé : sur une sous-page (elle montre le bouton retour), c'est le retour ; ailleurs, rien.
          // On attend la fin du geste : seul un vrai glisser (assez long, bien horizontal) compte comme retour.
          if (scene.querySelector(".retour, .retour-agenda, .reglage-page") && !defileDeCote(g.cible)) { g.retour = [dx, dy]; if (e.cancelable) e.preventDefault(); suivreRetour(dx, dy); } else g = null;
          return;
        }
        cancelAnimationFrame(rafId); rafId = 0;
        g.base = p; g.x0 = t.clientX;
      }
      if (e.cancelable) e.preventDefault();
      const span = MOUVEMENT.carte.decalage * largeur();
      g.traces.push([e.timeStamp, t.clientX]);
      while (g.traces.length > 2 && e.timeStamp - g.traces[0][0] > 100) g.traces.shift();
      allumer(t);
      const brut = g.base + S * (t.clientX - g.x0) / span;
      p = brut > 1 ? 1 + elastique(brut - 1) : Math.max(0, brut);
      planifier();
    }, { passive: false });
    const finGeste = (e: TouchEvent) => {
      if (!g) return;
      const { axe, traces, retour } = g; g = null;
      if (retour) {
        // Un geste coupé par le téléphone (appel, bord de l'écran) n'est pas un retour.
        const revenu = e.type === "touchend" && retourPret(retour[0], retour[1]);
        // La page d'avant est dessinée tout de suite : la sous-page ne reprend jamais sa place le temps d'une image.
        if (revenu) flushSync(() => { dispatchEvent(new Event("echo-retour")); });
        lacherRetour(revenu);
        return;
      }
      const span = MOUVEMENT.carte.decalage * largeur();
      const [t0, x0] = traces[0] || [0, 0], [t1, x1] = traces.at(-1) || [0, 0];
      const vitesse = t1 - t0 > 0 ? S * (x1 - x0) / span / (t1 - t0) * 1000 : 0;
      cancelAnimationFrame(rafRendu); rafRendu = 0;
      eteindre();
      if (axe !== "x") return;
      auClavier = false;
      if (p + vitesse * MOUVEMENT.elan > 0.5) ouvrir(vitesse); else fermer(vitesse);
    };
    on(window, "touchend", finGeste);
    on(window, "touchcancel", finGeste);
    on(window, "resize", () => { rendu(); marquer(false); });

    menu.inert = true;
    rendu(); marquer(false);
    return () => { off.forEach((f) => f()); cancelAnimationFrame(rafId); racine.classList.remove("menu-ouvert"); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { api.current?.marquer(true); }, [active, entrees]);

  return (
    <>
      <div className="coulisses" ref={r.coulisses}>
        <div className="lueur l1" /><div className="lueur l2" /><div className="lueur l3" />
        <div className="lumiere" ref={r.lumiere} />
        <nav className="menu" ref={r.menu} aria-label="Menu">
          <a className="qui" href="#reglages" data-id="reglages">
            <span className="avatar" aria-hidden="true">{initiale}</span>
            <span><b>{nom}</b><small>Réglages du foyer</small></span>
          </a>
          <ul className="liste" ref={r.liste}>
            {entrees.map((e) => (
              <li key={e.id}>
                <a className="ligne" href={"#" + e.id} data-id={e.id} aria-current={e.id === active ? "page" : undefined}>
                  {e.libelle}
                  {e.bientot ? <><span className="pastille bientot" aria-hidden="true">bientôt</span><span className="vh">, pas encore construit</span></>
                    : e.pastille ? <span className="pastille" aria-label={`${e.pastille} à faire`}>{e.pastille}</span> : null}
                </a>
              </li>
            ))}
            <span className="point" ref={r.point} aria-hidden="true" />
          </ul>
          <div className="pied">
            <a href="#reglages" data-id="reglages"><Settings size={16} strokeWidth={1.8} />Réglages</a>
          </div>
        </nav>
      </div>

      <div className="scene" ref={r.scene}>
        <div className="defile" ref={r.defile}>{children}</div>
        <button className="ombrage" aria-hidden="true" tabIndex={-1} />
      </div>

      {/* Le givre autour de la capsule : ce qui défile dessous s'efface au lieu de passer sous les boutons. */}
      <div className="halo-capsule" aria-hidden="true" />
      {/* La capsule du pouce : le menu en haut, Echo en bas, un seul objet en verre. */}
      <div className="capsule">
        <button className="bascule" ref={r.bascule} aria-label="Ouvrir le menu" aria-expanded="false">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path className="b1" d="M5 9h14" /><path className="b2" d="M5 15h14" /></svg>
        </button>
        {echo && <div className="zone-echo"><span className="sep" aria-hidden="true" />{echo}</div>}
      </div>
    </>
  );
}
