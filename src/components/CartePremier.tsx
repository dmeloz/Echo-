import { CalendarArrowRight, Check, ListChecks, Pencil, RotateCcw, User } from "pulsoicon-react";
import { useEffect, useRef, useState } from "react";
import { auJour, heureFr } from "../lib/dates";
import { vibrer } from "../lib/gestes";
import { autre, type Noms, type Personne, type Tache } from "../lib/types";
import { aDemain, basculerEtape, donnerA } from "../data/actions";
import { nomDe } from "../data/hooks";

interface Props { t: Tache; noms: Noms; proprio: Personne; now: Date; respire: boolean; onFait: (t: Tache) => void; onOuvrir: (t: Tache) => void }

const DEMI_TOUR = 170; // ms : la carte tourne jusqu'à la tranche, change de face, puis revient
const peuDeMouvement = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// La carte « En premier » se retourne (idée de Kora) : devant la tâche, au dos ses étapes, sa note
// et deux gestes rapides (À demain, Pour l'autre). C'est la seule carte de l'accueil qui se retourne.
// L'accueil lui donne key={tâche.id} : une nouvelle tâche en premier repart de l'avant.
export function CartePremier({ t, noms, proprio, now, respire, onFait, onOuvrir }: Props) {
  const [dos, setDos] = useState(false);
  const [tourne, setTourne] = useState<"" | "sort" | "entre">("");
  const [dejaTournee, setDejaTournee] = useState(false); // l'animation d'arrivée ne doit pas rejouer après un demi-tour
  const minuteur = useRef<number>(0);
  const today = auJour(0, now);
  const etapes = t.etapes ?? [];
  const faites = etapes.filter((e) => e.fait).length;
  const lautre = autre(proprio);
  const versQui = t.qui === lautre ? proprio : lautre; // donner à l'autre, ou la reprendre

  useEffect(() => () => clearTimeout(minuteur.current), []);

  const retourner = () => {
    vibrer(6);
    setDejaTournee(true);
    if (peuDeMouvement()) { setDos((d) => !d); return; }
    setTourne("sort");
    minuteur.current = window.setTimeout(() => {
      setDos((d) => !d);
      setTourne("entre");
      minuteur.current = window.setTimeout(() => setTourne(""), 320);
    }, DEMI_TOUR);
  };
  const surFond = (e: React.MouseEvent) => { if (!(e.target as Element).closest("button, input, label, a")) retourner(); };

  return (
    <section className={`g focus${respire ? " respire" : ""}${tourne ? " tourne-" + tourne : ""}${dos ? " dos" : ""}${dejaTournee ? " deja-tournee" : ""}`} aria-labelledby="lab-focus" onClick={surFond}>
      <div className="focus-haut">
        <span className="lab" id="lab-focus">{dos ? "Au dos" : "En premier"}</span>
        <button className="tourner" aria-label={dos ? "Revenir à l'avant de la carte" : "Retourner la carte : étapes et gestes rapides"} onClick={retourner}>
          <RotateCcw size={18} strokeWidth={1.8} play={!!tourne} />
        </button>
      </div>

      {!dos ? (
        <>
          <button className="focus-titre" onClick={() => onOuvrir(t)}>{t.titre}</button>
          <span className="focus-quand">
            {t.jour < today && <b className="retard">{t.jour === auJour(-1, now) ? "D'hier" : "En retard"}</b>}
            {[t.heure && heureFr(t.heure), t.qui === "nous" ? "à faire à deux" : `pour ${nomDe(noms, t.qui)}`].filter(Boolean).join(" · ")}
          </span>
          {etapes.length > 0 && <span className="focus-etapes"><ListChecks size={15} strokeWidth={1.8} animated={false} /> {faites} sur {etapes.length} étapes</span>}
          <div className="focus-pied">
            <button className="bouton-texte" onClick={() => aDemain(t)}>À demain</button>
            <button className="bouton petit" onClick={() => onFait(t)}><Check size={16} strokeWidth={2.6} play={respire} /> C'est fait</button>
          </div>
          <i className="trace-respire" aria-hidden="true" />
        </>
      ) : (
        <>
          <h3 className="dos-titre">{t.titre}</h3>
          {etapes.length > 0 ? (
            <ul className="dos-etapes">
              {etapes.map((e) => (
                <li key={e.id} className={e.fait ? "fait" : undefined}>
                  <label><input type="checkbox" checked={e.fait} onChange={() => { vibrer(8); basculerEtape(t.id, e.id); }} /><span>{e.texte}</span></label>
                </li>
              ))}
            </ul>
          ) : <p className="dos-vide">Pas encore d'étapes. <button className="bouton-texte" onClick={() => onOuvrir(t)}>En ajouter</button></p>}
          {t.note && <p className="dos-note">{t.note}</p>}
          <div className="dos-gestes">
            <button className="puce" onClick={() => aDemain(t)}><CalendarArrowRight size={16} strokeWidth={1.8} /> À demain</button>
            {t.qui !== "nous" && <button className="puce" onClick={() => donnerA(t, versQui, versQui === proprio ? "toi" : noms[versQui])}><User size={16} strokeWidth={1.8} /> {versQui === proprio ? "Je la reprends" : `Pour ${noms[versQui]}`}</button>}
            <button className="puce" onClick={() => onOuvrir(t)}><Pencil size={16} strokeWidth={1.8} /> Modifier</button>
          </div>
        </>
      )}
    </section>
  );
}
