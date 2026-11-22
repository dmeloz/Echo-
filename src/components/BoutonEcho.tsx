import { Sparkles, X } from "pulsoicon-react";
import { useEffect, useRef, useState } from "react";

interface Props { ouverte: boolean; ecoute: boolean; onToucher: () => void; onMaintenir: () => void }

const APPUI_LONG = 450; // ms : un anneau se remplit sous le doigt, puis Echo écoute

// L'étoile Echo, en bas de la capsule. Toucher : la barre d'écriture s'ouvre ou se range.
// Maintenir : on parle tout de suite (seulement quand la barre est rangée).
export function BoutonEcho({ ouverte, ecoute, onToucher, onMaintenir }: Props) {
  const [appui, setAppui] = useState(false);
  const minuteur = useRef(0);
  const long = useRef(false);
  useEffect(() => () => clearTimeout(minuteur.current), []);

  const lacher = () => { clearTimeout(minuteur.current); setAppui(false); };

  return (
    <button type="button" className={`echo-btn${ouverte ? " actif" : ""}${appui ? " appui" : ""}${ecoute ? " ecoute" : ""}`}
      aria-label={ouverte ? "Ranger la barre d'écriture" : "Écrire une chose (maintenir pour parler)"} aria-expanded={ouverte} aria-controls="barre-ecriture"
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
    </button>
  );
}
