import { Check, ListChecks, Search, X } from "pulsoicon-react";
import { useEffect, useRef } from "react";
import { heureFr, libelleJour } from "../lib/dates";
import type { Noms, Tache } from "../lib/types";
import { nomDe } from "../data/hooks";
import { chercherTaches } from "../lib/recherche";

// Le champ, dans l'en-tête : la loupe s'allonge en barre de recherche.
export function ChampRecherche({ valeur, onValeur, onFermer }: { valeur: string; onValeur: (v: string) => void; onFermer: () => void }) {
  const champ = useRef<HTMLInputElement>(null);
  useEffect(() => { champ.current?.focus({ preventScroll: true }); }, []);
  return (
    <div className="loupe ouverte g" role="search">
      <Search size={19} strokeWidth={2} className="loupe-ic" animated={false} />
      <input ref={champ} type="search" enterKeyHint="search" placeholder="Chercher dans Echo" aria-label="Chercher dans Echo" value={valeur}
        onChange={(e) => onValeur(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") onFermer(); }} />
      <button type="button" className="loupe-fermer" aria-label="Fermer la recherche" onClick={onFermer}><X size={18} strokeWidth={2.2} /></button>
    </div>
  );
}

// Les résultats, à la place de la page.
export function ResultatsRecherche({ taches, q, noms, now, onOuvrir, onExemple }: { taches: Tache[]; q: string; noms: Noms; now: Date; onOuvrir: (t: Tache) => void; onExemple: (q: string) => void }) {
  if (!q.trim()) {
    const exemples = [...new Set(taches.filter((t) => !t.fait).map((t) => t.titre.split(" ")[0]).filter((m) => m.length > 2))].slice(0, 5);
    return (
      <section className="resultats" aria-live="polite">
        <p className="phrase-recherche">Cherche une tâche, une note ou une étape.</p>
        {exemples.length > 0 && <div className="suggest">{exemples.map((m) => <button key={m} type="button" className="puce" onClick={() => onExemple(m)}>{m}</button>)}</div>}
      </section>
    );
  }
  const res = chercherTaches(taches, q);
  const ouvertes = res.filter((t) => !t.fait).sort((a, b) => a.jour.localeCompare(b.jour));
  const faites = res.filter((t) => t.fait).sort((a, b) => (b.faitLe ?? "").localeCompare(a.faitLe ?? ""));
  const motif = new RegExp(`(${q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "i");
  const surligner = (s: string) => s.split(motif).map((x, i) => (i % 2 ? <mark key={i}>{x}</mark> : x));
  const groupe = (titre: string, liste: Tache[]) => liste.length > 0 && (
    <div className="res-groupe">
      <h3 className="lab">{titre} · {liste.length}</h3>
      {liste.map((t) => (
        <button key={t.id} type="button" className="res g" onClick={() => onOuvrir(t)}>
          <span className="res-ic" aria-hidden="true">{t.fait ? <Check size={17} strokeWidth={2.2} animated={false} /> : <ListChecks size={17} strokeWidth={1.8} animated={false} />}</span>
          <span className="res-quoi"><b>{surligner(t.titre)}</b>
            <small>{[t.fait ? "Fait" : libelleJour(t.jour, now), t.heure && heureFr(t.heure), nomDe(noms, t.qui)].filter(Boolean).join(" · ")}</small></span>
        </button>
      ))}
    </div>
  );
  return (
    <section className="resultats" aria-live="polite">
      {!res.length ? <p className="phrase-recherche vide-recherche">Rien pour « {q.trim()} ». Écris-la en bas avec l'étoile si c'est une chose à faire.</p>
        : <>{groupe("À faire", ouvertes)}{groupe("Faites", faites)}</>}
    </section>
  );
}
