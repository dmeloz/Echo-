import { Sparkles, X } from "pulsoicon-react";
import { useEffect, useRef, useState } from "react";
import { EVT_NON_LU, nonLu } from "../lib/echo/discussions";

interface Props { ouverte: boolean; ecoute: boolean; onToucher: () => void; onMaintenir: () => void }

const APPUI_LONG = 450; // ms : un anneau se remplit sous le doigt, puis Echo écoute

// L'étoile Echo, en bas de la capsule. Toucher : la barre d'écriture s'ouvre ou se range.
// Maintenir : on parle tout de suite (seulement quand la barre est rangée).
export function BoutonEcho({ ouverte, ecoute, onToucher, onMaintenir }: Props) {
  const [appui, setAppui] = useState(false);
  const minuteur = useRef(0);
  const long = useRef(false);
  useEffect(() => () => clearTimeout(minuteur.current), []);
  // Un point quand Echo a écrit de lui-même (un mot le matin, ce que l'autre a fait) et que ce n'est pas encore lu.
  const [nouveau, setNouveau] = useState(nonLu);
  useEffect(() => {
    const suivre = (e: Event) => setNouveau((e as CustomEvent<boolean>).detail);
    window.addEventListener(EVT_NON_LU, suivre);
    return () => window.removeEventListener(EVT_NON_LU, suivre);
  }, []);

  const lacher = () => { clearTimeout(minuteur.current); setAppui(false); };

  return (
    <button type="button" className={`echo-btn${ouverte ? " actif" : ""}${appui ? " appui" : ""}${ecoute ? " ecoute" : ""}`}
      aria-label={ouverte ? "Ranger la barre d'écriture" : nouveau ? "Echo a un message pour toi (maintenir pour parler)" : "Écrire une chose (maintenir pour parler)"} aria-expanded={ouverte} aria-controls="barre-ecriture"
      onPointerDown={() => {
        long.current = false;
        if (ouverte) return;
        setAppui(true);
        minuteur.current = window.setTimeout(() => { long.current = true; setAppui(false); onMaintenir(); }, APPUI_LONG);
      }}
      onPointerUp={lacher} onPointerLeave={lacher} onPointerCancel={lacher}
      onContextMenu={(e) => e.preventDefault()}
      onClick={() => { if (long.current) { long.current = false; return; } onToucher(); }}>
      {ouverte ? <X size={22} strokeWidth={2.2} /> : <Sparkles size={22} strokeWidth={1.9} play={ecoute} />}
      {nouveau && !ouverte && <span className="echo-point" aria-hidden="true" />}
    </button>
  );
}
