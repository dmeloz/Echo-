import { ArrowRight, CalendarDays, ListChecks, Sunrise, User, Volume2, X } from "pulsoicon-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { auJour } from "../lib/dates";
import { construireResume, type SectionResume } from "../lib/resume";
import type { Noms, Personne, Tache } from "../lib/types";
import { poserReglage, useReglage } from "../data/hooks";

interface Props { taches: Tache[]; noms: Noms; proprio: Personne; now: Date }

const ICONES: Record<SectionResume["id"], typeof Sunrise> = { agenda: CalendarDays, important: ListChecks, autre: User, semaine: CalendarDays };
const parle = () => typeof window !== "undefined" && "speechSynthesis" in window;

// Le résumé du matin : une pastille en haut de l'accueil, qui ouvre la journée racontée en plein écran.
// La pastille reste jusqu'à midi ; une fois lu, elle devient discrète. On peut la couper dans les Réglages.
export function ResumeMatin({ taches, noms, proprio, now }: Props) {
  const actif = useReglage("resumeMatin", true);
  const luLe = useReglage<string | null>("resumeLu", null);
  const [ouvert, setOuvert] = useState(false);
  const [lecture, setLecture] = useState(false);
  const fermer = useRef<HTMLButtonElement>(null);
  const today = auJour(0, now);
  const lu = luLe === today;

  useEffect(() => {
    if (!ouvert) return;
    document.documentElement.classList.add("feuille-ouverte");
    fermer.current?.focus();
    const touche = (e: KeyboardEvent) => { if (e.key === "Escape") terminer(); };
    addEventListener("keydown", touche);
    return () => { document.documentElement.classList.remove("feuille-ouverte"); removeEventListener("keydown", touche); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert]);

  if (!actif || (lu && now.getHours() >= 12)) return null;
  const r = construireResume(taches, noms, proprio, now);

  function terminer() {
    if (parle()) speechSynthesis.cancel();
    setLecture(false);
    setOuvert(false);
    if (!lu) poserReglage("resumeLu", today);
  }
  const ecouter = () => {
    if (!parle()) return;
    if (speechSynthesis.speaking) { speechSynthesis.cancel(); setLecture(false); return; }
    const u = new SpeechSynthesisUtterance(r.texteLu);
    u.lang = "fr-FR";
    u.onend = () => setLecture(false);
    setLecture(true);
    speechSynthesis.speak(u);
  };
  const date = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <button className={`matin${lu ? " lu" : ""}`} onClick={() => setOuvert(true)}>
        <span className="matin-icone" aria-hidden="true"><Sunrise size={lu ? 18 : 22} strokeWidth={1.8} /></span>
        {lu ? <span className="matin-texte"><b>Résumé du matin lu · le revoir</b></span>
          : <span className="matin-texte"><b>Ton résumé du matin</b><small>{r.sections.length ? "Une minute à lire" : "Une journée calme"}</small></span>}
        {!lu && <ArrowRight size={18} strokeWidth={2} />}
      </button>

      {ouvert && createPortal(
        <div className="resume" role="dialog" aria-modal="true" aria-labelledby="resume-titre">
          <div className="resume-haut">
            <button ref={fermer} className="rond-fermer" aria-label="Fermer le résumé" onClick={terminer}><X size={20} strokeWidth={2.2} /></button>
          </div>
          <div className="resume-corps">
            <span className="resume-date">{date}</span>
            <h2 id="resume-titre">Bonjour {noms[proprio]}</h2>
            <p className="resume-phrase">{r.phrase}</p>
            {r.sections.map((s, i) => {
              const Icone = ICONES[s.id];
              return (
                <section key={s.id} className={`resume-bloc${s.id === "autre" ? " elle" : ""}`} style={{ animationDelay: `${120 + i * 70}ms` }}>
                  <span className="resume-icone" aria-hidden="true"><Icone size={18} strokeWidth={1.8} /></span>
                  <div>
                    <h3>{s.titre}</h3>
                    {s.phrase && <p>{s.phrase}</p>}
                    {s.lignes.length > 0 && <ul>{s.lignes.map((l, k) => <li key={k}>{l.heure && <span>{l.heure}</span>}{l.texte}</li>)}</ul>}
                  </div>
                </section>
              );
            })}
            {!r.sections.length && <p className="resume-vide">Rien d'écrit pour aujourd'hui. Note une chose en bas de l'accueil quand elle te vient.</p>}
          </div>
          <div className="resume-pied">
            {parle() && <button className="bouton second" onClick={ecouter} aria-pressed={lecture}><Volume2 size={18} strokeWidth={2} /> {lecture ? "Arrêter" : "Écouter"}</button>}
            <button className="bouton" onClick={terminer}>Commencer ma journée</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
