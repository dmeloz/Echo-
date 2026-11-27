import { Check, Mic, Plus } from "pulsoicon-react";
import { useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import { trembler } from "../lib/gestes";
import { comprendre, type Compris } from "../lib/comprendre";
import { heureFr, libelleJour } from "../lib/dates";
import { NIVEAUX, niveauPropose } from "../lib/importance";
import { appelerServeur, ErreurEcho } from "../lib/assistant";
import { executer, lancerEcho, type Faite, type ResultatEcho } from "../lib/echo/boucle";
import type { Action } from "../lib/echo/outils";
import { REPETES, type Noms, type Personne } from "../lib/types";
import { ajouter } from "../data/actions";
import { nomDe, useReglage } from "../data/hooks";
import { outilsEcho, useModulesActifs } from "../modules/registre";

interface Props {
  noms: Noms; proprio: Personne; ouverte: boolean; ecoute: boolean; texte: string; saisie: RefObject<HTMLInputElement | null>;
  onTexte: (t: string) => void; onRanger: () => void; onFinEcoute: () => void; onPlusOptions: (pre: Compris | null) => void;
}

type EtatEcho = null | { etat: "pense" } | { etat: "propose"; r: ResultatEcho; phrase: string };

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
  const demande = useRef(0);
  const v = texte.trim();
  const r = v ? comprendre(v, noms, undefined, proprio) : null;
  const n = r ? (r.niveau ?? niveauPropose(r)) : 1;
  // Une phrase pour un module (« plus de lait » → les courses) ne devient pas une tâche et ne part pas à l'assistant.
  const { actifs } = useModulesActifs();
  const pour = v && !tache ? actifs.map((m) => (m.etat === "construit" ? m.comprendre?.(v) ?? null : null)).find((x) => x) ?? null : null;
  const parEcho = actif && (!!code || relie) && !simple && !pour;

  const setTexte = (t: string) => { onTexte(t); demande.current++; setEcho(null); setSimple(false); setTache(false); };
  const annulerEcho = () => { demande.current++; setEcho(null); };

  const enregistrer = (faire: () => Promise<unknown>, garde: string) => {
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

  const confirmer = (r: ResultatEcho, phrase: string) => enregistrer(async () => {
    const faites: Faite[] = [];
    for (const a of r.aConfirmer) faites.push(await executer(a, phrase, ctx()));
    proposerAnnuler(faites, faites.length > 1 ? `${faites.length} choses faites` : "C'est fait");
  }, texte);

  const demanderA = async () => {
    const num = ++demande.current;
    const phrase = v;
    setEcho({ etat: "pense" });
    try {
      const r = await lancerEcho(phrase, ctx(), { appeler: appelerServeur(code), outils: outilsEcho(actifs), seul, noter: executer });
      if (num !== demande.current) { if (r.faites.length) proposerAnnuler(r.faites, "Echo a fait des choses pendant ce temps"); return; }
      if (r.faites.length) proposerAnnuler(r.faites, r.faites.length > 1 ? `Echo a fait ${r.faites.length} choses` : "Echo l'a fait");
      if (!r.aConfirmer.length && !r.reponse) { setEcho(null); setTexte(""); onRanger(); return; }
      setEcho({ etat: "propose", r, phrase });
    } catch (e) {
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
      if (echo?.etat === "propose") { if (echo.r.aConfirmer.length) confirmer(echo.r, echo.phrase); else { annulerEcho(); setTexte(""); onRanger(); } return; }
      if (pour) { enregistrer(pour.faire, texte); return; }
      if (parEcho && navigator.onLine) { demanderA(); return; }
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
          {echo.r.reponse && <p className="echo-dit">{echo.r.reponse}</p>}
          {echo.r.faites.map((f, i) => <div key={"f" + i} className="ligne-ap echo-fait"><b>✓ {f.action.libelle}</b>{f.action.details.map((d, j) => <span key={j} className="tag">{d}</span>)}</div>)}
          {echo.r.aConfirmer.map((a, i) => <LigneAction key={i} a={a} />)}
          <div className="pied-ap">
            {echo.r.aConfirmer.length > 0 ? <>
              <button type="button" className="bouton-texte" onPointerDown={(e) => e.preventDefault()} onClick={annulerEcho}>Non</button>
              {echo.r.aConfirmer.length === 1 && echo.r.aConfirmer[0].brouillon && (
                <button type="button" className="bouton-texte" onPointerDown={(e) => e.preventDefault()} onClick={() => {
                  const { note: _note, ...pre } = echo.r.aConfirmer[0].brouillon!;
                  onPlusOptions(pre);
                  setTexte("");
                }}>Modifier</button>
              )}
              <button type="button" className="bouton echo-ok" onPointerDown={(e) => e.preventDefault()} onClick={() => confirmer(echo.r, echo.phrase)}>
                {echo.r.aConfirmer.length > 1 ? `Oui, les ${echo.r.aConfirmer.length}` : "Oui"}
              </button>
            </> : (
              <button type="button" className="bouton-texte" onPointerDown={(e) => e.preventDefault()} onClick={() => { annulerEcho(); setTexte(""); onRanger(); }}>D'accord</button>
            )}
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
            <div className="pied-ap"><span>Touche ✓ : Echo regarde, prépare, et te demande avant de changer quoi que ce soit.</span></div>
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
        <input id="saisie-rapide" ref={saisie} enterKeyHint={parEcho ? "send" : "done"} placeholder={ecoute ? "Je t'écoute…" : parEcho ? "Dis-moi ce qu'il faut noter…" : "Ajouter une tâche…"} value={texte}
          onChange={(e) => setTexte(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") onRanger(); }} />
        {ecoute && <button type="button" className="bouton-texte arret" onClick={onFinEcoute}>Fini</button>}
        <button className="envoyer" type="submit" aria-label={echo?.etat === "propose" ? (echo.r.aConfirmer.length ? "Oui" : "D'accord") : parEcho ? "Envoyer à Echo" : "Ajouter"} disabled={!v || echo?.etat === "pense"}>
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
