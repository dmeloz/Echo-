import { Sparkles } from "pulsoicon-react";
import { useEffect, useRef, useState } from "react";
import { auJour, heureFr, libelleJour, minutes } from "../../lib/dates";
import { autre, type Personne, type Tache } from "../../lib/types";
import { changerHeure, deplacer } from "../../data/actions";
import { initialeDe, nomDe, poserReglage, useHoraires, useReglage, useTaches } from "../../data/hooks";
import type { ContexteModule } from "../contrat";
import { charge, duJour, faitesDuJour, joursAVenir, proposerDeplacement, proposerRepos } from "./semaine";
import { CODES, heuresDe, phraseDe, type Code } from "../../lib/horaires";
import { VueMois } from "./Mois";
import { PageHoraires } from "../horaires/PageHoraires";
import { CalendarClock, ChevronLeft } from "pulsoicon-react";
import { vibrer } from "../../lib/gestes";

type Vue = "jour" | "semaine" | "mois";
const NOM_VUE: Record<Vue, string> = { jour: "Jour", semaine: "Semaine", mois: "Mois" };
const court = (jour: string) => new Date(jour + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "");
const numero = (jour: string) => new Date(jour + "T12:00:00").getDate();
const classeQui = (t: Tache) => (t.qui === "nous" ? "nous" : t.qui);

// Le planning : aujourd'hui et les six jours suivants, jour par jour ou toute la semaine d'un coup.
// Il lit les mêmes tâches que l'accueil (celles qui ont un jour, et une heure si on veut).
export function PagePlanning({ noms, proprio, now, ouvrir }: ContexteModule) {
  const taches = useTaches() ?? [];
  const choix = useReglage<string>("planningVue", "jour");
  const vue: Vue = choix === "semaine" || choix === "mois" ? choix : "jour";
  const [sousPage, setSousPage] = useState(false); // « Mes horaires » : une sous-page de l'Agenda
  const [jour, setJour] = useState(() => auJour(0, now));
  const [refusees, setRefusees] = useState<string[]>([]);
  const jours = joursAVenir(now);
  const today = jours[0];
  // Un jour choisi dans le mois peut être loin : la bande des jours part alors de lui.
  const jourVu = jour < today ? today : jour;
  const bande = jours.includes(jourVu) ? jours : joursAVenir(new Date(jourVu + "T12:00:00"));
  const lautre = autre(proprio);
  const horaires = useHoraires();
  // Le code de travail de celui qui tient le téléphone, jour par jour.
  const travail = new Map(horaires.filter((h) => h.qui === proprio).map((h) => [h.jour, h.code]));
  const choisirJour = (j: string) => { setJour(j); poserReglage("planningVue", "jour"); };

  if (sousPage) return (
    <>
      <button type="button" className="retour-agenda" onClick={() => setSousPage(false)}><ChevronLeft size={18} strokeWidth={2} animated={false} /> Agenda</button>
      <PageHoraires noms={noms} proprio={proprio} now={now} aller={() => {}} ouvrir={ouvrir} />
    </>
  );

  return (
    <>
      <button type="button" className="lien-horaires" onClick={() => setSousPage(true)}><CalendarClock size={16} strokeWidth={1.8} animated={false} /> Mes horaires</button>
      <div className="vue-choix" role="group" aria-label="Vue">
        {(["jour", "semaine", "mois"] as Vue[]).map((v) => (
          <button key={v} type="button" aria-pressed={vue === v} onClick={() => poserReglage("planningVue", v)}>{NOM_VUE[v]}</button>
        ))}
      </div>

      {vue === "mois" ? <VueMois taches={taches} travail={travail} today={today} onJour={choisirJour} /> : <>

      <div className="bande-jours" role="group" aria-label="Choisir le jour">
        {bande.map((j) => {
          const liste = duJour(taches, j, today);
          const nm = charge(liste, "moi"), ne = charge(liste, "elle");
          return (
            <button key={j} type="button" aria-pressed={vue === "jour" && j === jourVu} onClick={() => choisirJour(j)}
              aria-label={`${libelleJour(j, now)} : ${liste.length} chose${liste.length > 1 ? "s" : ""}`}>
              <span>{j === today ? "Auj." : court(j)}</span><b>{numero(j)}</b>
              {travail.get(j) && CODES[travail.get(j)!].court && <em className={`code-mini code-${travail.get(j)!.toLowerCase()}`} aria-hidden="true">{CODES[travail.get(j)!].court}</em>}
              <span className="points" aria-hidden="true">{Array.from({ length: Math.min(3, nm) }, (_, i) => <i key={"m" + i} />)}{Array.from({ length: Math.min(3, ne) }, (_, i) => <i key={"e" + i} className="elle" />)}</span>
            </button>
          );
        })}
      </div>

      <IdeeEcho taches={taches} travail={travail} proprio={proprio} lautre={lautre} noms={noms} now={now} refusees={refusees} onRefuser={(id) => setRefusees((r) => [...r, id])} />

      {vue === "jour"
        ? <VueJour taches={taches} jour={jourVu} today={today} now={now} noms={noms} ouvrir={ouvrir} travail={travail.get(jourVu)} />
        : <VueSemaine taches={taches} jours={jours} today={today} now={now} noms={noms} proprio={proprio} lautre={lautre} travail={travail} onJour={choisirJour} />}
      </>}
    </>
  );
}

// Une seule idée d'Echo à la fois, en une phrase : d'abord profiter d'un jour de repos, sinon alléger le jour le plus chargé.
// Le calcul reste caché ; on ne voit que la proposition, Oui ou Non.
interface PropsIdee { taches: Tache[]; travail: Map<string, Code>; proprio: Personne; lautre: Personne; noms: ContexteModule["noms"]; now: Date; refusees: string[]; onRefuser: (id: string) => void }
function IdeeEcho({ taches, travail, proprio, lautre, noms, now, refusees, onRefuser }: PropsIdee) {
  const libre = (t: Tache) => !refusees.includes(t.id);
  const jourDe = (j: string) => libelleJour(j, now).split(" ")[0];
  const minus = (j: string) => jourDe(j).toLowerCase();
  const repos = proposerRepos(taches.filter(libre), travail, proprio, now);
  const allege = repos ? null : proposerDeplacement(taches.filter(libre), [proprio, lautre], now);
  const idee = repos ? { tache: repos.tache, vers: repos.vers, texte: <><b>{jourDe(repos.vers)}</b> tu es en repos. J'y mets « {repos.tache.titre} » ?</> }
    : allege ? { tache: allege.tache, vers: allege.vers, texte: <><b>{jourDe(allege.de)}</b> est chargé{allege.pour === proprio ? "" : ` pour ${noms[allege.pour]}`}. Je mets « {allege.tache.titre} » à {minus(allege.vers)} ?</> }
    : null;
  if (!idee) return null;
  return (
    <section className="g idee" aria-label="Une idée d'Echo">
      <p><Sparkles size={15} strokeWidth={1.8} animated={false} aria-hidden="true" /> {idee.texte}</p>
      <div className="rangee">
        <button className="bouton petit" onClick={() => deplacer(idee.tache, idee.vers)}>Oui</button>
        <button className="bouton-texte" onClick={() => onRefuser(idee.tache.id)}>Non</button>
      </div>
    </section>
  );
}

// Glisser pour changer l'heure : garder le doigt une seconde sur une chose à heure, puis monter ou descendre
// (un cran = 15 minutes). La page ne défile pas pendant ce geste ; un toucher simple ouvre toujours la feuille.
const CRAN = 18, ATTENTE = 350;
function BlocGlissable({ t, children }: { t: Tache; children: React.ReactNode }) {
  const [decalage, setDecalage] = useState<number | null>(null);
  const ref = useRef<HTMLUListElement>(null);
  const geste = useRef<{ y: number; minuteur?: ReturnType<typeof setTimeout>; actif: boolean; crans: number }>({ y: 0, actif: false, crans: 0 });
  const bloque = !t.heure || !!t.ical?.serie || !!t.fait;
  const heureA = (crans: number) => {
    const m = Math.min(23 * 60 + 45, Math.max(0, Math.round(minutes(t.heure) / 15) * 15 + crans * 15));
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };
  // Pendant le geste, le défilement de la page est retenu (écouteur non passif).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const retenir = (e: TouchEvent) => { if (geste.current.actif) e.preventDefault(); };
    el.addEventListener("touchmove", retenir, { passive: false });
    return () => el.removeEventListener("touchmove", retenir);
  }, []);
  const fin = () => { clearTimeout(geste.current.minuteur); geste.current.actif = false; setDecalage(null); };
  return (
    <ul ref={ref} className={decalage !== null ? "glisse-heure" : undefined} style={decalage !== null ? { transform: `translateY(${decalage * CRAN}px)` } : undefined}
      onPointerDown={(e) => {
        if (bloque) return;
        geste.current = { y: e.clientY, actif: false, crans: 0, minuteur: setTimeout(() => { geste.current.actif = true; vibrer(8); setDecalage(0); }, ATTENTE) };
      }}
      onPointerMove={(e) => {
        const g = geste.current;
        if (!g.actif) { if (Math.abs(e.clientY - g.y) > 8) clearTimeout(g.minuteur); return; }
        const crans = Math.round((e.clientY - g.y) / CRAN);
        if (crans !== g.crans) { g.crans = crans; vibrer(4); setDecalage(crans); }
      }}
      onPointerUp={() => {
        const g = geste.current;
        if (g.actif && g.crans) void changerHeure(t, heureA(g.crans));
        if (g.actif) { const bloquer = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); }; addEventListener("click", bloquer, { capture: true, once: true }); setTimeout(() => removeEventListener("click", bloquer, { capture: true }), 50); }
        fin();
      }}
      onPointerCancel={fin}
      onContextMenu={(e) => { if (!bloque) e.preventDefault(); }}>
      {children}
      {decalage !== null && <li className="heure-glisse" aria-live="polite">{heureFr(heureA(decalage))}</li>}
    </ul>
  );
}

// Le bandeau du jour de travail, en haut de la vue Jour.
function BandeauTravail({ code }: { code: Code }) {
  const c = CODES[code];
  return (
    <div className={`bandeau-travail code-${code.toLowerCase()}`}>
      <b>{c.travail ? (heuresDe(code) ? `Travail${c.court ? " " + c.court : ""}` : c.libelle) : c.libelle}</b>
      {c.travail && heuresDe(code) && <span>{heuresDe(code)}</span>}
    </div>
  );
}

function VueJour({ taches, jour, today, now, noms, ouvrir, travail }: { taches: Tache[]; jour: string; today: string; now: Date; noms: ContexteModule["noms"]; ouvrir: (t: Tache) => void; travail?: Code }) {
  const liste = duJour(taches, jour, today);
  const avecHeure = liste.filter((t) => t.heure && t.jour === jour);
  const sansHeure = liste.filter((t) => !t.heure || t.jour !== jour);
  const faites = faitesDuJour(taches, jour);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const iMaintenant = jour === today ? avecHeure.findIndex((t) => minutes(t.heure) > nowMin) : -1;
  const ligne = (t: Tache) => (
    <li key={t.id}>
      <button className={`bloc-p ${classeQui(t)}${t.fait ? " fait" : ""}${t.evt ? " evt" : ""}`} onClick={() => ouvrir(t)}>
        <b>{t.titre}</b>
        <small>{[t.evt ? (t.heure ? (t.fin ? `Jusqu'à ${heureFr(t.fin)}` : "") : "Toute la journée") : "", t.jour < today ? (t.jour === auJour(-1, now) ? "D'hier" : "En retard") : "", t.qui === "nous" ? "À deux" : `Pour ${nomDe(noms, t.qui)}`, t.etapes?.length ? `${t.etapes.filter((e) => e.fait).length}/${t.etapes.length} étapes` : ""].filter(Boolean).join(" · ")}</small>
      </button>
    </li>
  );

  return (
    <section className="g planning-jour" aria-labelledby="lab-jour">
      <h2 className="jour-titre" id="lab-jour">{libelleJour(jour, now)}</h2>
      {travail && <BandeauTravail code={travail} />}
      {!liste.length && !faites.length && (
        <div className="vide-jour"><b>Rien de prévu ce jour-là</b><span>Écris une chose en bas, par exemple « dentiste {jour === today ? "à 15 h" : court(jour) + " 9 h"} ».</span></div>
      )}
      {avecHeure.length > 0 && (
        <ol className="ligne-temps">
          {avecHeure.map((t, i) => (
            <li key={t.id} className="lt-rang">
              {i === iMaintenant && <span className="maintenant-p" aria-label={`Il est ${heureFr(`${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`)}`} />}
              <span className="lt-heure">{heureFr(t.heure)}</span>
              <BlocGlissable t={t}>{ligne(t)}</BlocGlissable>
            </li>
          ))}
          {jour === today && iMaintenant === -1 && <li className="lt-rang fin"><span className="maintenant-p" aria-hidden="true" /></li>}
        </ol>
      )}
      {sansHeure.length > 0 && (
        <>
          <span className="lab">Sans heure</span>
          <ul className="sans-heure">{sansHeure.map(ligne)}</ul>
        </>
      )}
      {faites.length > 0 && <details className="faites"><summary>{faites.length} fait{faites.length > 1 ? "s" : ""}</summary><ul className="sans-heure">{faites.map(ligne)}</ul></details>}
      <p className="aide-champ">Touche une chose pour la changer. Garde le doigt dessus puis glisse vers le haut ou le bas pour changer son heure.</p>
    </section>
  );
}

interface PropsSemaine { travail: Map<string, Code>; taches: Tache[]; jours: string[]; today: string; now: Date; noms: ContexteModule["noms"]; proprio: Personne; lautre: Personne; onJour: (j: string) => void }

function VueSemaine({ travail, taches, jours, today, now, noms, onJour }: PropsSemaine) {

  return (
    <>
      <ul className="semaine-liste">
        {jours.map((j) => {
          const liste = duJour(taches, j, today);
          const montres = liste.slice(0, 5);
          return (
            <li key={j}>
              <button className={`jour-rang${j === today ? " auj" : ""}`} onClick={() => onJour(j)}
                aria-label={`${libelleJour(j, now)} : ${liste.length ? liste.map((t) => t.titre).join(", ") : "libre"}`}>
                <span className="jr-date"><span>{j === today ? "Auj." : court(j)}</span><b>{numero(j)}</b></span>
                <span className="jr-corps">
                  {travail.get(j) && <span className={`jr-travail code-${travail.get(j)!.toLowerCase()}`}>{phraseDe(travail.get(j)!)}</span>}
                  {liste.length ? (
                    <>
                      <span className="jr-charge">
                        <i className="moi"><em>{initialeDe(noms, "moi")}</em>{charge(liste, "moi")}</i>
                        <i className="elle"><em>{initialeDe(noms, "elle")}</em>{charge(liste, "elle")}</i>
                      </span>
                      <span className="jr-puces">
                        {montres.map((t) => <span key={t.id} className={`jr-puce ${classeQui(t)}`}>{t.heure && t.jour === j ? heureFr(t.heure) + " " : ""}{t.titre}</span>)}
                        {liste.length > montres.length && <span className="jr-puce plus">+ {liste.length - montres.length}</span>}
                      </span>
                    </>
                  ) : travail.get(j) && CODES[travail.get(j)!].travail ? null : <span className="jr-libre">Journée libre</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="aide-champ">Les points sous chaque jour : bleu pour {noms.moi}, turquoise pour {noms.elle}. Ce qui est à deux compte pour les deux.</p>
    </>
  );
}
