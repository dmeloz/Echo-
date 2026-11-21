import { Check, Plus } from "pulsoicon-react";
import { useState } from "react";
import { comprendre, type Compris } from "../lib/comprendre";
import { heureFr, libelleJour } from "../lib/dates";
import { NIVEAUX, niveauPropose } from "../lib/importance";
import type { Noms, Personne } from "../lib/types";
import { ajouter } from "../data/actions";
import { nomDe } from "../data/hooks";

// La barre sous le pouce : on tape une phrase, l'app comprend le jour, l'heure et pour qui.
export function BarreAjout({ noms, proprio, onPlusOptions }: { noms: Noms; proprio: Personne; onPlusOptions: (pre: Compris | null) => void }) {
  const [texte, setTexte] = useState("");
  const [focus, setFocus] = useState(false);
  const v = texte.trim();
  const r = v ? comprendre(v, noms, undefined, proprio) : null;
  const n = r ? (r.niveau ?? niveauPropose(r)) : 1;

  return (
    <form className="barre-bas" autoComplete="off" onSubmit={(e) => {
      e.preventDefault();
      if (!r) return;
      ajouter({ ...r, note: "" });
      setTexte("");
      (document.activeElement as HTMLElement | null)?.blur();
    }}>
      {r && focus && (
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
      <div className="ajout g">
        <Plus size={20} strokeWidth={2.2} className="plus" autoAnimated={false} play={focus} />
        <label className="vh" htmlFor="saisie-rapide">Ajouter une tâche</label>
        <input id="saisie-rapide" enterKeyHint="done" placeholder="Ajouter une tâche…" value={texte}
          onChange={(e) => setTexte(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)} />
        <button className="envoyer" type="submit" aria-label="Ajouter" disabled={!v}><Check size={20} strokeWidth={2.4} autoAnimated={false} play={!!v} /></button>
      </div>
    </form>
  );
}
