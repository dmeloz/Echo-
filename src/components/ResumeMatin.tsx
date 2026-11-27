import { CalendarDays, LayoutGrid, ListChecks, Moon, Sunrise, User, Volume2, X } from "pulsoicon-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { auJour } from "../lib/dates";
import { construireResume, type SectionResume } from "../lib/resume";
import type { Noms, Personne, Tache } from "../lib/types";
import type { Module } from "../modules/contrat";
import { poserReglage, useHoraires, useReglage } from "../data/hooks";

interface Props { taches: Tache[]; noms: Noms; proprio: Personne; now: Date; modules?: Module[] }
interface DitModule { id: string; libelle: string; phrases: string[] }

const ICONES: Record<SectionResume["id"], typeof Sunrise> = { agenda: CalendarDays, important: ListChecks, autre: User, semaine: CalendarDays };
const parle = () => typeof window !== "undefined" && "speechSynthesis" in window;

// Le résumé du matin : un petit bouton soleil en haut de l'accueil, à côté de la loupe, qui ouvre la journée racontée
// dans une fenêtre. Un point orange le signale le matin tant qu'il n'est pas lu. On peut le couper dans les Réglages.
export function ResumeMatin({ taches, noms, proprio, now, modules = [] }: Props) {
  const actif = useReglage("resumeMatin", true);
  const luLe = useReglage<string | null>("resumeLu", null);
  const [ouvert, setOuvert] = useState(false);
  const [lecture, setLecture] = useState(false);
  const fermer = useRef<HTMLButtonElement>(null);
  const [dits, setDits] = useState<DitModule[]>([]);
  const today = auJour(0, now);
  const lu = luLe === today;
  // Après 18 h, le soleil devient une lune : le résumé raconte demain (on prépare la journée la veille au soir).
  const soir = now.getHours() >= 18;
  const jourResume = soir ? auJour(1, now) : today;
  const travail = useHoraires().find((h) => h.qui === proprio && h.jour === jourResume)?.code;

  useEffect(() => {
    if (!ouvert) return;
    document.documentElement.classList.add("feuille-ouverte");
    fermer.current?.focus();
    const touche = (e: KeyboardEvent) => { if (e.key === "Escape") terminer(); };
    addEventListener("keydown", touche);
    return () => { document.documentElement.classList.remove("feuille-ouverte"); removeEventListener("keydown", touche); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert]);

  // Ce que les modules allumés ont à dire (champ « matin » du contrat) : 2 phrases au plus chacun, lues à l'ouverture.
  const quiParle = modules.filter((m) => m.matin).map((m) => m.id).join(",");
  useEffect(() => {
    if (!ouvert) return;
    let vivant = true;
    Promise.all(modules.filter((m) => m.matin).map(async (m): Promise<DitModule> => {
      const phrases = await m.matin!({ jour: jourResume, demain: soir }).catch(() => []);
      return { id: m.id, libelle: m.libelle, phrases: phrases.filter((p) => typeof p === "string" && p.trim()).slice(0, 2) };
    })).then((d) => { if (vivant) setDits(d.filter((x) => x.phrases.length)); });
    return () => { vivant = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert, jourResume, soir, quiParle]);

  if (!actif) return null;
  const demainMatin = new Date(now); demainMatin.setDate(now.getDate() + 1); demainMatin.setHours(6, 0, 0, 0);
  const r = construireResume(taches, noms, proprio, soir ? demainMatin : now, travail, soir);

  function terminer() {
    if (parle()) speechSynthesis.cancel();
    setLecture(false);
    setOuvert(false);
    if (!lu) poserReglage("resumeLu", today);
  }
  const ecouter = () => {
    if (!parle()) return;
    if (speechSynthesis.speaking) { speechSynthesis.cancel(); setLecture(false); return; }
    const u = new SpeechSynthesisUtterance([r.texteLu, ...dits.map((d) => `${d.libelle} : ${d.phrases.join(" ")}`)].join(" "));
    u.lang = "fr-FR";
    u.onend = () => setLecture(false);
    setLecture(true);
    speechSynthesis.speak(u);
  };
  const date = (soir ? demainMatin : now).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <>
      <button type="button" className={`matin-bouton${!lu && now.getHours() < 12 ? " nouveau" : ""}`} aria-label={soir ? "Ta journée de demain" : lu ? "Revoir le résumé du matin" : "Ouvrir ton résumé du matin"} onClick={() => setOuvert(true)}>
        {soir ? <Moon size={20} strokeWidth={2} /> : <Sunrise size={20} strokeWidth={2} />}
      </button>

      {ouvert && createPortal(
        <>
        <div className="resume-fond" aria-hidden="true" onClick={terminer} />
        <div className="resume" role="dialog" aria-modal="true" aria-labelledby="resume-titre">
          <div className="resume-haut">
            <button ref={fermer} className="rond-fermer" aria-label="Fermer le résumé" onClick={terminer}><X size={20} strokeWidth={2.2} /></button>
          </div>
          <div className="resume-corps">
            <span className="resume-date">{date}</span>
            <h2 id="resume-titre">{soir ? `Demain, ${noms[proprio]}` : `Bonjour ${noms[proprio]}`}</h2>
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
            {dits.map((d, i) => (
              <section key={d.id} className="resume-bloc" style={{ animationDelay: `${120 + (r.sections.length + i) * 70}ms` }}>
                <span className="resume-icone" aria-hidden="true"><LayoutGrid size={18} strokeWidth={1.8} /></span>
                <div>
                  <h3>{d.libelle}</h3>
                  {d.phrases.map((p, k) => <p key={k}>{p}</p>)}
                </div>
              </section>
            ))}
            {!r.sections.length && !dits.length && <p className="resume-vide">{soir ? "Rien d'écrit pour demain. Note une chose avec l'étoile si elle te vient ce soir." : "Rien d'écrit pour aujourd'hui. Note une chose en bas de l'accueil quand elle te vient."}</p>}
          </div>
          <div className="resume-pied">
            {parle() && <button className="bouton second" onClick={ecouter} aria-pressed={lecture}><Volume2 size={18} strokeWidth={2} /> {lecture ? "Arrêter" : "Écouter"}</button>}
            <button className="bouton" onClick={terminer}>{soir ? "Bonne soirée" : "Commencer ma journée"}</button>
          </div>
        </div>
        </>,
        document.body,
      )}
    </>
  );
}
