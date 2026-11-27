import { Check, Mic, Plus } from "pulsoicon-react";
import { useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import { trembler } from "../lib/gestes";
import { comprendre, type Compris } from "../lib/comprendre";
import { heureFr, libelleJour } from "../lib/dates";
import { NIVEAUX, niveauPropose } from "../lib/importance";
import { appelerServeur, ErreurEcho } from "../lib/assistant";
import { executer, lancerEcho, type Faite, type Message, type ResultatEcho } from "../lib/echo/boucle";
import type { Action } from "../lib/echo/outils";
import { REPETES, type Noms, type Personne } from "../lib/types";
import { ajouter } from "../data/actions";
import { nomDe, useReglage } from "../data/hooks";
import { outilsEcho, useModulesActifs } from "../modules/registre";
import { MAX_PHRASE } from "../../supabase/functions/_shared/echo-outils";

interface Props {
  noms: Noms; proprio: Personne; ouverte: boolean; ecoute: boolean; texte: string; saisie: RefObject<HTMLInputElement | null>;
  onTexte: (t: string) => void; onRanger: () => void; onFinEcoute: () => void; onPlusOptions: (pre: Compris | null) => void;
}

type EtatEcho = null | { etat: "pense" } | { etat: "propose"; r: ResultatEcho; phrase: string };

// La discussion avec Echo : gardée (hors de React) tant que l'app est ouverte, reprise si on revient dans les 15 minutes.
// note : ce que l'app dira à Echo avant la phrase suivante (oui / non à sa dernière proposition).
interface Fil { suite: Message[]; echanges: { moi: string; echo: string }[]; quand: number; note?: string }
const REPRISE = 15 * 60_000;
let filGarde: Fil | null = null;
const filActuel = () => (filGarde && Date.now() - filGarde.quand < REPRISE ? filGarde : null);
// Un « Oui » en cours d'exécution : la phrase suivante l'attend, pour que la note (ce qui a été fait) parte avec elle.
let confirmation: Promise<unknown> = Promise.resolve();

// La barre d'écriture : rangée derrière l'étoile Echo, elle s'ouvre au toucher et se range après l'envoi.
// On tape (ou on dit) une phrase. Avec le code Echo et internet, l'assistant Echo regarde, prépare les actions, et on confirme
// (src/lib/echo/boucle.ts). Avec le réglage « Petites choses sans demander », il fait seul les petites choses (avec Annuler).
// Sinon, l'app comprend seule le jour, l'heure et pour qui, comme avant.
export function BarreAjout({ noms, proprio, ouverte, ecoute, texte, saisie, onTexte, onRanger, onFinEcoute, onPlusOptions }: Props) {
  const boite = useRef<HTMLDivElement>(null);
  const code = useReglage<string>("codeEcho", "").trim();
  const actif = useReglage("assistantEcho", true);
  const relie = !!useReglage<unknown>("foyer", null); // relié au foyer : la session suffit, pas besoin du code
  const seul = useReglage("echoSeul", false); // « Petites choses sans demander »
  const [echo, setEcho] = useState<EtatEcho>(null);
  const [tache, setTache] = useState(false); // « Plutôt une tâche » : la phrase n'est pas pour un module
  const [simple, setSimple] = useState(false); // Echo n'a pas répondu : on reste en mode simple pour cette phrase
  const [filEtat, setFilEtat] = useState<Fil | null>(filActuel);
  const fil = filEtat && Date.now() - filEtat.quand < REPRISE ? filEtat : null; // passé 15 minutes, la discussion repart à neuf
  const setFil = (f: Fil | null) => { filGarde = f; setFilEtat(f); };
  // Une note pour Echo, ajoutée à celles qui attendent la phrase suivante.
  const noter = (note: string) => {
    const f = filActuel();
    setFil({ suite: f?.suite ?? [], echanges: f?.echanges ?? [], quand: Date.now(), note: [f?.note, note].filter(Boolean).join(" ") });
  };
  const nouvelleDiscussion = () => { demande.current++; setFil(null); setEcho(null); };
  const demande = useRef(0);
  const v = texte.trim();
  const r = v ? comprendre(v, noms, undefined, proprio) : null;
  const n = r ? (r.niveau ?? niveauPropose(r)) : 1;
  // Une phrase pour un module (« plus de lait » → les courses) ne devient pas une tâche et ne part pas à l'assistant.
  const { actifs } = useModulesActifs();
  const versEcho = actif && (!!code || relie) && !simple && navigator.onLine;
  // Pendant une discussion avec Echo, tout lui est envoyé (« plus de lait » aussi : il a les courses).
  const pour = v && !tache && !(echo && versEcho) ? actifs.map((m) => (m.etat === "construit" ? m.comprendre?.(v) ?? null : null)).find((x) => x) ?? null : null;
  const parEcho = actif && (!!code || relie) && !simple && !pour;
  const tropLong = parEcho && v.length > MAX_PHRASE;

  // Écrire pendant qu'Echo réfléchit l'interrompt ; sa réponse, elle, reste affichée : on peut lui répondre dessous.
  const setTexte = (t: string) => { onTexte(t); if (echo?.etat === "pense") { demande.current++; setEcho(null); } setSimple(false); setTache(false); };
  const annulerEcho = () => { demande.current++; setEcho(null); };
  const dire = (qui: string, quoi: string) => `${qui} ${quoi}`;
  const refuser = (r: ResultatEcho) => { if (r.aConfirmer.length) noter(dire(noms[proprio], "a dit non : rien de ta proposition n'a été fait.")); annulerEcho(); };
  const fermer = () => { annulerEcho(); onTexte(""); onRanger(); };
  // Echo s'est arrêté en route après avoir fait des choses : il le saura à la phrase suivante.
  const noterFaites = (faites: Faite[]) => noter(`ta réponse précédente a été interrompue, mais ceci a déjà été fait : ${faites.map((f) => f.ligne).join(" ; ")}.`);

  const enregistrer = (faire: () => Promise<unknown>, garde: string) => {
    annulerEcho();
    setTexte("");
    onRanger();
    // Si l'enregistrement rate : la barre tremble, la phrase revient, et on dit quoi faire.
    faire().catch(() => {
      onTexte(garde);
      trembler(boite.current);
      toast("Pas enregistré. Le téléphone manque peut-être de place : libère un peu de stockage, puis réessaie. Ta phrase est gardée : touche l'étoile pour la retrouver.", { duration: 7000 });
    });
  };

  const ctx = () => ({ noms, proprio, now: new Date() });
  // Annuler tout ce qu'Echo vient de faire, dans l'ordre inverse.
  const proposerAnnuler = (faites: Faite[], message: string) => toast(message, {
    duration: 10000,
    action: { label: "Annuler", onClick: async () => { for (const f of [...faites].reverse()) await f.annuler().catch(() => {}); } },
  });

  const confirmer = (r: ResultatEcho, phrase: string) => {
    const enCours = (async () => {
      const faites: Faite[] = [];
      const fait = () => noter(dire(noms[proprio], `a dit oui. Fait : ${faites.map((f) => f.ligne).join(" ; ")}.${faites.length < r.aConfirmer.length ? " Le reste n'a pas pu être fait." : ""}`));
      try {
        for (const a of r.aConfirmer) faites.push(await executer(a, phrase, ctx()));
      } catch (e) {
        // Rien de fait : la phrase revient (enregistrer). Une partie faite : on ne la refait pas, on propose de l'annuler.
        if (!faites.length) { noter(dire(noms[proprio], "a dit oui, mais l'app n'a rien pu faire.")); throw e; }
        fait();
        proposerAnnuler(faites, `${faites.length} sur ${r.aConfirmer.length} fait${faites.length > 1 ? "s" : ""}, la suite n'a pas marché`);
        return;
      }
      fait();
      proposerAnnuler(faites, faites.length > 1 ? `${faites.length} choses faites` : "C'est fait");
    })();
    confirmation = enCours.catch(() => {});
    enregistrer(() => enCours, texte);
  };

  const demanderA = async () => {
    // Une proposition restée sans réponse : on le dit à Echo avec la phrase suivante.
    if (echo?.etat === "propose" && echo.r.aConfirmer.length) noter(dire(noms[proprio], "n'a pas répondu à ta proposition : rien n'en a été fait."));
    const num = ++demande.current;
    const phrase = v;
    setEcho({ etat: "pense" });
    await confirmation;
    if (num !== demande.current) return;
    const avant = filActuel();
    const dejaFaites: Faite[] = [];
    try {
      const r = await lancerEcho(phrase, ctx(), {
        appeler: appelerServeur(code), outils: outilsEcho(actifs), seul, noter: executer, faites: dejaFaites,
        discussion: avant?.suite, note: avant?.note,
      });
      if (num !== demande.current) {
        if (r.faites.length) { proposerAnnuler(r.faites, "Echo a fait des choses pendant ce temps"); noterFaites(r.faites); }
        return;
      }
      if (r.faites.length) proposerAnnuler(r.faites, r.faites.length > 1 ? `Echo a fait ${r.faites.length} choses` : "Echo l'a fait");
      // La discussion continue (ou repart à neuf si Echo s'est arrêté en route). On garde les derniers échanges pour les montrer.
      const echanges = [...(avant?.echanges ?? []), { moi: phrase, echo: r.reponse }].slice(-6);
      setFil({ suite: r.suite ?? [], echanges, quand: Date.now() });
      onTexte(""); // la barre se vide pour répondre ; la réponse d'Echo reste au-dessus
      if (!r.aConfirmer.length && !r.reponse) { setEcho(null); onRanger(); return; }
      setEcho({ etat: "propose", r, phrase });
    } catch (e) {
      // Echo a fait des petites choses avant de s'arrêter : on le dit, avec Annuler, et on ne repasse pas en mode simple (doublons).
      if (dejaFaites.length) {
        noterFaites(dejaFaites);
        proposerAnnuler(dejaFaites, `Echo s'est arrêté en route après ${dejaFaites.length} chose${dejaFaites.length > 1 ? "s" : ""} faite${dejaFaites.length > 1 ? "s" : ""}`);
        if (num === demande.current) fermer();
        return;
      }
      if (num !== demande.current) return;
      setEcho(null); setSimple(true);
      toast(`${e instanceof ErreurEcho ? e.message : "Echo ne répond pas."} Je reprends la version simple : touche ✓ pour ajouter.`, { duration: 6000 });
    }
  };

  return (
    <form id="barre-ecriture" className={`barre-bas${ouverte ? "" : " ferme"}`} inert={!ouverte} autoComplete="off" onSubmit={(e) => {
      e.preventDefault();
      if (!r) return;
      if (echo?.etat === "pense") return;
      if (pour) { enregistrer(pour.faire, texte); return; }
      if (parEcho && navigator.onLine) {
        if (tropLong) { trembler(boite.current); toast(`C'est trop long pour Echo (${v.length} signes, ${MAX_PHRASE} au plus) : coupe en deux messages.`, { duration: 6000 }); return; }
        demanderA(); return;
      }
      enregistrer(() => ajouter({ ...r, note: "" }), texte);
    }}>
      {ouverte && !ecoute && echo?.etat === "pense" && (
        <div className="apercu g echo-pense" role="status">
          <span className="echo-points" aria-hidden="true"><i /><i /><i /></span>
          <span>Echo réfléchit…</span>
        </div>
      )}
      {ouverte && !ecoute && echo?.etat === "propose" && (
        <div className="apercu g echo-propose" role="status">
          {fil && fil.echanges.length > 1 && (
            <div className="echo-avant">
              {fil.echanges.slice(-3, -1).map((x, i) => <p key={i}><b>Toi :</b> {x.moi}{x.echo && <><br /><b>Echo :</b> {x.echo}</>}</p>)}
            </div>
          )}
          {echo.r.reponse && <p className="echo-dit">{echo.r.reponse}</p>}
          {echo.r.faites.map((f, i) => <div key={"f" + i} className="ligne-ap echo-fait"><b>✓ {f.action.libelle}</b>{f.action.details.map((d, j) => <span key={j} className="tag">{d}</span>)}</div>)}
          {echo.r.aConfirmer.map((a, i) => <LigneAction key={i} a={a} />)}
          <div className="pied-ap">
            {echo.r.aConfirmer.length > 0 ? <>
              <button type="button" className="bouton-texte" onPointerDown={(e) => e.preventDefault()} onClick={() => refuser(echo.r)}>Non</button>
              {echo.r.aConfirmer.length === 1 && echo.r.aConfirmer[0].brouillon && (
                <button type="button" className="bouton-texte" onPointerDown={(e) => e.preventDefault()} onClick={() => {
                  const { note: _note, ...pre } = echo.r.aConfirmer[0].brouillon!;
                  noter(dire(noms[proprio], "a préféré modifier ta proposition à la main."));
                  annulerEcho();
                  onPlusOptions(pre);
                  onTexte("");
                }}>Modifier</button>
              )}
              <button type="button" className="bouton echo-ok" onPointerDown={(e) => e.preventDefault()} onClick={() => confirmer(echo.r, echo.phrase)}>
                {echo.r.aConfirmer.length > 1 ? `Oui, les ${echo.r.aConfirmer.length}` : "Oui"}
              </button>
            </> : <>
              <button type="button" className="bouton-texte" onPointerDown={(e) => e.preventDefault()} onClick={nouvelleDiscussion}>Nouvelle discussion</button>
              <button type="button" className="bouton-texte" onPointerDown={(e) => e.preventDefault()} onClick={fermer}>D'accord</button>
            </>}
          </div>
        </div>
      )}
      {r && ouverte && !ecoute && !echo && (
        <div className="apercu g">
          {pour ? (
            <>
              <div className="ligne-ap"><b>{pour.titre}</b><span className="tag">{pour.ou}</span></div>
              <div className="pied-ap">
                <span>Touche ✓ : je l'ajoute, sans créer de tâche.</span>
                <button type="button" className="bouton-texte" onPointerDown={(e) => e.preventDefault()} onClick={() => setTache(true)}>Plutôt une tâche</button>
              </div>
            </>
          ) : parEcho ? (
            fil ? (
              <div className="pied-ap">
                <span>On continue la discussion.</span>
                <button type="button" className="bouton-texte" onPointerDown={(e) => e.preventDefault()} onClick={nouvelleDiscussion}>Nouvelle discussion</button>
              </div>
            ) : <div className="pied-ap"><span>Touche ✓ : Echo regarde, prépare, et te demande avant de changer quoi que ce soit.</span></div>
          ) : (
            <>
              <div className="ligne-ap">
                <b>{r.titre}</b>
                <span className="tag">{libelleJour(r.jour)}</span>
                {r.heure && <span className="tag">{heureFr(r.heure)}</span>}
                <span className="tag">{nomDe(noms, r.qui)}</span>
                {r.repete && <span className="tag">{REPETES[r.repete]}</span>}
                <span className={`tag${n === 2 ? " imp" : ""}`}>{NIVEAUX[n]}</span>
              </div>
              <div className="pied-ap">
                <span>Je comprends le jour, l'heure et pour qui.</span>
                <button type="button" className="bouton-texte" onPointerDown={(e) => e.preventDefault()} onClick={() => { onPlusOptions(r); setTexte(""); }}>Plus d'options</button>
              </div>
            </>
          )}
        </div>
      )}
      <div className="ajout g" ref={boite}>
        {ecoute ? <Mic size={20} strokeWidth={2.2} className="plus ecoute-ic" play />
          : <Plus size={20} strokeWidth={2.2} className="plus" autoAnimated={false} play={ouverte} />}
        <label className="vh" htmlFor="saisie-rapide">{parEcho ? "Écrire à Echo" : "Ajouter une tâche"}</label>
        <input id="saisie-rapide" ref={saisie} enterKeyHint={parEcho ? "send" : "done"} placeholder={ecoute ? "Je t'écoute…" : echo?.etat === "propose" ? "Réponds à Echo…" : parEcho ? "Dis-moi ce qu'il faut faire…" : "Ajouter une tâche…"} value={texte}
          onChange={(e) => setTexte(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") onRanger(); }} />
        {ecoute && <button type="button" className="bouton-texte arret" onClick={onFinEcoute}>Fini</button>}
        <button className="envoyer" type="submit" aria-label={parEcho ? "Envoyer à Echo" : "Ajouter"} disabled={!v || echo?.etat === "pense"}>
          <Check size={20} strokeWidth={2.4} autoAnimated={false} play={!!v} />
        </button>
      </div>
    </form>
  );
}

// Une action préparée par Echo. Ce qui est à l'autre ou qui efface est marqué : c'est toujours demandé.
function LigneAction({ a }: { a: Action }) {
  return (
    <div className="ligne-ap">
      <b>{a.libelle}</b>
      {a.details.map((d, i) => <span key={i} className="tag">{d}</span>)}
      {a.genre === "gros" && <span className="tag imp">à confirmer</span>}
    </div>
  );
}
