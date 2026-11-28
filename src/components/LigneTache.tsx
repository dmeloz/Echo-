import { useDrag } from "@use-gesture/react";
import { Check, Image, ListChecks, Repeat, StickyNote } from "pulsoicon-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { auJour, heureFr } from "../lib/dates";
import { REPETES, type Niveau, type Noms, type Tache } from "../lib/types";
import { initialeDe, nomDe } from "../data/hooks";
import { DUREE_RESPIRE, vibrer } from "../lib/gestes";

const SEUIL = 72;

interface Props {
  t: Tache;
  n: Niveau;
  noms: Noms;
  onCocher: (t: Tache) => void;
  onOuvrir: (t: Tache) => void;
  onNiveau: (t: Tache, sens: 1 | -1) => void;
  aPhoto?: boolean;
  // Changer l'ordre : rester appuyé, puis monter ou descendre. avantId = la ligne devant laquelle on la pose (null : tout en bas, "haut" : au-dessus de la liste).
  onRanger?: (t: Tache, avantId: string | null) => void;
}

const APPUI = 450; // le même appui long que l'étoile Echo

// Une tâche : toucher le rond = fait ; toucher le texte = modifier ;
// glisser → = plus important ; glisser ← = plus tard ; rester appuyé puis bouger = changer l'ordre.
export function LigneTache({ t, n, noms, onCocher, onOuvrir, onNiveau, aPhoto, onRanger }: Props) {
  const [dx, setDx] = useState(0);
  const [lache, setLache] = useState(true);
  const [cocheeLocale, setCocheeLocale] = useState(false);
  const pretRef = useRef(false);
  const vientDeGlisser = useRef(false);
  const fait = !!t.fait || cocheeLocale;

  const lier = useDrag(({ active, movement: [mx], last, tap }) => {
    if (tap || t.fait || porte.current) return;
    const lim = 120;
    const d = Math.abs(mx) > lim ? Math.sign(mx) * (lim + (Math.abs(mx) - lim) * 0.25) : mx;
    setLache(!active);
    setDx(active ? d : 0);
    const pret = Math.abs(d) >= SEUIL;
    if (pret !== pretRef.current) { pretRef.current = pret; if (pret) vibrer(6); }
    if (last) {
      vientDeGlisser.current = Math.abs(mx) > 8;
      setTimeout(() => (vientDeGlisser.current = false), 60);
      pretRef.current = false;
      if (d >= SEUIL) onNiveau(t, 1);
      else if (d <= -SEUIL) onNiveau(t, -1);
    }
  }, { axis: "x", filterTaps: true });

  // --- Changer l'ordre à la main ---
  const li = useRef<HTMLLIElement>(null);
  const porte = useRef(false);
  const depart = useRef({ x: 0, y: 0 });
  const minuterie = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [dy, setDy] = useState<number | null>(null);
  // Pendant qu'on porte la ligne, la page ne doit pas défiler (l'iPhone demande un écouteur « non passif »).
  useEffect(() => {
    const el = li.current;
    if (!el || !onRanger) return;
    const bloquer = (e: TouchEvent) => { if (porte.current) e.preventDefault(); };
    el.addEventListener("touchmove", bloquer, { passive: false });
    return () => { el.removeEventListener("touchmove", bloquer); clearTimeout(minuterie.current); };
  }, [onRanger]);
  // Où la ligne tomberait : devant quelle voisine (null = tout en bas, "haut" = au-dessus de la liste).
  const cible = (): { avant: HTMLElement | null; id: string | null } => {
    const el = li.current!, r = el.getBoundingClientRect(), milieu = r.top + r.height / 2;
    const liste = el.parentElement!;
    const voisines = [...liste.children].filter((c): c is HTMLElement => c !== el && c instanceof HTMLElement);
    if (milieu < liste.getBoundingClientRect().top - r.height / 2) return { avant: voisines[0] ?? null, id: "haut" };
    const avant = voisines.find((c) => { const b = c.getBoundingClientRect(); return b.top + b.height / 2 > milieu; }) ?? null;
    return { avant, id: avant?.dataset.id ?? null };
  };
  const marquer = (c?: { avant: HTMLElement | null }) => {
    const liste = li.current?.parentElement;
    liste?.querySelectorAll(".ici-avant, .ici-apres").forEach((x) => x.classList.remove("ici-avant", "ici-apres"));
    if (!c || !liste) return;
    if (c.avant) c.avant.classList.add("ici-avant");
    else [...liste.children].filter((x) => x !== li.current).at(-1)?.classList.add("ici-apres");
  };
  const appui = (e: PointerEvent) => {
    if (!onRanger || t.fait || (e.pointerType === "mouse" && e.button !== 0)) return;
    depart.current = { x: e.clientX, y: e.clientY };
    clearTimeout(minuterie.current);
    minuterie.current = setTimeout(() => { porte.current = true; setDx(0); setDy(0); vibrer(12); }, APPUI);
  };
  const bouge = (e: PointerEvent) => {
    if (!porte.current) { if (Math.hypot(e.clientX - depart.current.x, e.clientY - depart.current.y) > 8) clearTimeout(minuterie.current); return; }
    setDy(e.clientY - depart.current.y);
    marquer(cible());
  };
  const lacher = (e: PointerEvent) => {
    clearTimeout(minuterie.current);
    if (!porte.current) return;
    const bouge = Math.abs(e.clientY - depart.current.y) > 8;
    const c = cible();
    marquer(); porte.current = false; setDy(null);
    vientDeGlisser.current = true; setTimeout(() => (vientDeGlisser.current = false), 60);
    if (bouge && e.type === "pointerup") onRanger?.(t, c.id);
  };

  const today = auJour();
  const retard = t.jour < today && !t.fait;
  const sens = dx > 4 ? "vers-haut" : dx < -4 ? "vers-bas" : "";

  return (
    <li ref={li} data-id={t.id} className={`tache n${n}${fait ? " fait" : ""}${cocheeLocale ? " respire" : ""} ${sens}${Math.abs(dx) >= SEUIL ? " pret" : ""}${dy !== null ? " porte" : ""}`}
      style={dy !== null ? { transform: `translateY(${dy}px)` } : undefined}
      {...lier()} onPointerDownCapture={appui} onPointerMoveCapture={bouge} onPointerUpCapture={lacher} onPointerCancelCapture={lacher}>
      <div className="fond" aria-hidden="true"><span className="haut">↑ Important</span><span className="bas">Plus tard ↓</span></div>
      <div className="glisse" style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: lache ? "transform .45s var(--ressort, ease)" : "none", willChange: dx || lache ? "transform" : undefined }}>
        <button
          className="coche"
          aria-label={`${t.fait ? "Marquer comme pas fait" : "Marquer comme fait"} : ${t.titre}`}
          onClick={() => {
            if (vientDeGlisser.current || cocheeLocale) return;
            vibrer(10);
            if (!t.fait) { setCocheeLocale(true); setTimeout(() => { onCocher(t); setCocheeLocale(false); }, DUREE_RESPIRE); }
            else onCocher(t);
          }}
        >
          <Check size={14} strokeWidth={3.2} autoAnimated={false} play={fait} />
        </button>
        <button className="corps" onClick={() => { if (!vientDeGlisser.current) onOuvrir(t); }}>
          <span className="titre">{t.titre}</span>
          {(retard || t.repete || t.note || !!t.etapes?.length || aPhoto) && (
            <span className="meta">
              {retard && <span className="retard">{t.jour === auJour(-1) ? "d'hier" : "en retard"}</span>}
              {t.repete && <span className="ic-meta" title={REPETES[t.repete]}><Repeat size={13} strokeWidth={2.2} animated={false} /></span>}
              {!!t.etapes?.length && <span className="ic-meta etapes-meta" title="étapes"><ListChecks size={13} strokeWidth={2.2} animated={false} />{t.etapes.filter((e) => e.fait).length}/{t.etapes.length}</span>}
              {t.note && <span className="ic-meta" title="note"><StickyNote size={13} strokeWidth={2.2} animated={false} /></span>}
              {aPhoto && <span className="ic-meta" title="photo"><Image size={13} strokeWidth={2.2} animated={false} /></span>}
            </span>
          )}
        </button>
        {t.heure && <span className="heure">{heureFr(t.heure)}</span>}
        <span className={`pour ${t.qui}`} aria-label={`Pour ${nomDe(noms, t.qui)}`}>
          {t.qui === "nous" ? <><i>{initialeDe(noms, "moi")}</i><i>{initialeDe(noms, "elle")}</i></> : <i>{initialeDe(noms, t.qui)}</i>}
        </span>
      </div>
    </li>
  );
}
