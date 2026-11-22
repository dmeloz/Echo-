import { Check, Mic, Plus } from "pulsoicon-react";
import { useRef, type RefObject } from "react";
import { toast } from "sonner";
import { trembler } from "../lib/gestes";
import { comprendre, type Compris } from "../lib/comprendre";
import { heureFr, libelleJour } from "../lib/dates";
import { NIVEAUX, niveauPropose } from "../lib/importance";
import type { Noms, Personne } from "../lib/types";
import { ajouter } from "../data/actions";
import { nomDe } from "../data/hooks";

interface Props {
  noms: Noms; proprio: Personne; ouverte: boolean; ecoute: boolean; texte: string; saisie: RefObject<HTMLInputElement | null>;
  onTexte: (t: string) => void; onRanger: () => void; onFinEcoute: () => void; onPlusOptions: (pre: Compris | null) => void;
}

// La barre d'écriture : rangée derrière l'étoile Echo, elle s'ouvre au toucher et se range après l'envoi.
// On tape (ou on dit) une phrase, l'app comprend le jour, l'heure et pour qui.
export function BarreAjout({ noms, proprio, ouverte, ecoute, texte, saisie, onTexte, onRanger, onFinEcoute, onPlusOptions }: Props) {
  const boite = useRef<HTMLDivElement>(null);
  const v = texte.trim();
  const r = v ? comprendre(v, noms, undefined, proprio) : null;
  const n = r ? (r.niveau ?? niveauPropose(r)) : 1;
  const setTexte = onTexte;

  return (
    <form id="barre-ecriture" className={`barre-bas${ouverte ? "" : " ferme"}`} inert={!ouverte} autoComplete="off" onSubmit={(e) => {
      e.preventDefault();
      if (!r) return;
      const garde = texte;
      setTexte("");
      // Si l'enregistrement rate : la barre tremble, la phrase revient, et on dit quoi faire.
      ajouter({ ...r, note: "" }).catch(() => {
        setTexte(garde);
        trembler(boite.current);
        toast("Pas enregistré. Le téléphone manque peut-être de place : libère un peu de stockage, puis réessaie. Ta phrase est gardée : touche l'étoile pour la retrouver.", { duration: 7000 });
      });
      onRanger();
    }}>
      {r && ouverte && !ecoute && (
        <div className="apercu g">
          <div className="ligne-ap">
            <b>{r.titre}</b>
            <span className="tag">{libelleJour(r.jour)}</span>
            {r.heure && <span className="tag">{heureFr(r.heure)}</span>}
            <span className="tag">{nomDe(noms, r.qui)}</span>
            {r.repete && <span className="tag">{r.repete === "jour" ? "chaque jour" : "chaque semaine"}</span>}
            <span className={`tag${n === 2 ? " imp" : ""}`}>{NIVEAUX[n]}</span>
          </div>
          <div className="pied-ap">
            <span>Je comprends le jour, l'heure et pour qui.</span>
            <button type="button" className="bouton-texte" onPointerDown={(e) => e.preventDefault()} onClick={() => { onPlusOptions(r); setTexte(""); }}>Plus d'options</button>
          </div>
        </div>
      )}
      <div className="ajout g" ref={boite}>
        {ecoute ? <Mic size={20} strokeWidth={2.2} className="plus ecoute-ic" play />
          : <Plus size={20} strokeWidth={2.2} className="plus" autoAnimated={false} play={ouverte} />}
        <label className="vh" htmlFor="saisie-rapide">Ajouter une tâche</label>
        <input id="saisie-rapide" ref={saisie} enterKeyHint="done" placeholder={ecoute ? "Je t'écoute…" : "Ajouter une tâche…"} value={texte}
          onChange={(e) => setTexte(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") onRanger(); }} />
        {ecoute && <button type="button" className="bouton-texte arret" onClick={onFinEcoute}>Fini</button>}
        <button className="envoyer" type="submit" aria-label="Ajouter" disabled={!v}><Check size={20} strokeWidth={2.4} autoAnimated={false} play={!!v} /></button>
      </div>
    </form>
  );
}
