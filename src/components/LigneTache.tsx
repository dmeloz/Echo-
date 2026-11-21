import { useDrag } from "@use-gesture/react";
import { Check, Repeat, StickyNote } from "pulsoicon-react";
import { useRef, useState } from "react";
import { auJour, heureFr } from "../lib/dates";
import type { Niveau, Noms, Tache } from "../lib/types";
import { initialeDe, nomDe } from "../data/hooks";

const SEUIL = 72;

interface Props {
  t: Tache;
  n: Niveau;
  noms: Noms;
  onCocher: (t: Tache) => void;
  onOuvrir: (t: Tache) => void;
  onNiveau: (t: Tache, sens: 1 | -1) => void;
}

// Une tâche : toucher le rond = fait ; toucher le texte = modifier ;
// glisser → = plus important ; glisser ← = plus tard.
export function LigneTache({ t, n, noms, onCocher, onOuvrir, onNiveau }: Props) {
  const [dx, setDx] = useState(0);
  const [lache, setLache] = useState(true);
  const [cocheeLocale, setCocheeLocale] = useState(false);
  const pretRef = useRef(false);
  const vientDeGlisser = useRef(false);
  const fait = !!t.fait || cocheeLocale;

  const lier = useDrag(({ active, movement: [mx], last, tap }) => {
    if (tap || t.fait) return;
    const lim = 120;
    const d = Math.abs(mx) > lim ? Math.sign(mx) * (lim + (Math.abs(mx) - lim) * 0.25) : mx;
    setLache(!active);
    setDx(active ? d : 0);
    const pret = Math.abs(d) >= SEUIL;
    if (pret !== pretRef.current) { pretRef.current = pret; if (pret) navigator.vibrate?.(6); }
    if (last) {
      vientDeGlisser.current = Math.abs(mx) > 8;
      setTimeout(() => (vientDeGlisser.current = false), 60);
      pretRef.current = false;
      if (d >= SEUIL) onNiveau(t, 1);
      else if (d <= -SEUIL) onNiveau(t, -1);
    }
  }, { axis: "x", filterTaps: true });

  const today = auJour();
  const retard = t.jour < today && !t.fait;
  const sens = dx > 4 ? "vers-haut" : dx < -4 ? "vers-bas" : "";

  return (
    <li className={`tache n${n}${fait ? " fait" : ""} ${sens}${Math.abs(dx) >= SEUIL ? " pret" : ""}`} {...lier()}>
      <div className="fond" aria-hidden="true"><span className="haut">↑ Important</span><span className="bas">Plus tard ↓</span></div>
      <div className="glisse" style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: lache ? "transform .45s var(--ressort, ease)" : "none" }}>
        <button
          className="coche"
          aria-label={`${t.fait ? "Marquer comme pas fait" : "Marquer comme fait"} : ${t.titre}`}
          onClick={() => {
            if (vientDeGlisser.current) return;
            if (!t.fait) { setCocheeLocale(true); setTimeout(() => { onCocher(t); setCocheeLocale(false); }, 420); }
            else onCocher(t);
          }}
        >
          <Check size={14} strokeWidth={3.2} autoAnimated={false} play={fait} />
        </button>
        <button className="corps" onClick={() => { if (!vientDeGlisser.current) onOuvrir(t); }}>
          <span className="titre">{t.titre}</span>
          {(retard || t.repete || t.note) && (
            <span className="meta">
              {retard && <span className="retard">{t.jour === auJour(-1) ? "d'hier" : "en retard"}</span>}
              {t.repete && <span className="ic-meta" title={t.repete === "jour" ? "chaque jour" : "chaque semaine"}><Repeat size={13} strokeWidth={2.2} animated={false} /></span>}
              {t.note && <span className="ic-meta" title="note"><StickyNote size={13} strokeWidth={2.2} animated={false} /></span>}
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
