import { Check, Mic, Plus } from "pulsoicon-react";
import { useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import { trembler } from "../lib/gestes";
import { comprendre, type Compris } from "../lib/comprendre";
import { heureFr, libelleJour } from "../lib/dates";
import { NIVEAUX, niveauPropose } from "../lib/importance";
import { demanderEcho, versBrouillon, ErreurEcho, type PropositionEcho, type TacheEcho } from "../lib/assistant";
import { REPETES, type Noms, type Personne } from "../lib/types";
import { ajouter, ajouterTout } from "../data/actions";
import { db } from "../data/db";
import { nomDe, useReglage } from "../data/hooks";

interface Props {
  noms: Noms; proprio: Personne; ouverte: boolean; ecoute: boolean; texte: string; saisie: RefObject<HTMLInputElement | null>;
  onTexte: (t: string) => void; onRanger: () => void; onFinEcoute: () => void; onPlusOptions: (pre: Compris | null) => void;
}

type EtatEcho = null | { etat: "pense" } | { etat: "propose"; p: PropositionEcho };

// La barre d'écriture : rangée derrière l'étoile Echo, elle s'ouvre au toucher et se range après l'envoi.
// On tape (ou on dit) une phrase. Avec le code Echo et internet, l'assistant Echo la comprend et propose ; on confirme.
// Sinon, l'app comprend seule le jour, l'heure et pour qui, comme avant.
export function BarreAjout({ noms, proprio, ouverte, ecoute, texte, saisie, onTexte, onRanger, onFinEcoute, onPlusOptions }: Props) {
  const boite = useRef<HTMLDivElement>(null);
  const code = useReglage<string>("codeEcho", "").trim();
  const actif = useReglage("assistantEcho", true);
  const relie = !!useReglage<unknown>("foyer", null); // relié au foyer : la session suffit, pas besoin du code
  const [echo, setEcho] = useState<EtatEcho>(null);
  const [simple, setSimple] = useState(false); // Echo n'a pas répondu : on reste en mode simple pour cette phrase
  const demande = useRef(0);
  const v = texte.trim();
  const r = v ? comprendre(v, noms, undefined, proprio) : null;
  const n = r ? (r.niveau ?? niveauPropose(r)) : 1;
  const parEcho = actif && (!!code || relie) && !simple;

  const setTexte = (t: string) => { onTexte(t); demande.current++; setEcho(null); setSimple(false); };
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

  const confirmer = (p: PropositionEcho) => enregistrer(() => ajouterTout(p.taches.map(versBrouillon)), texte);

  const demanderA = async () => {
    const num = ++demande.current;
    setEcho({ etat: "pense" });
    try {
      const p = await demanderEcho({ texte: v, code, noms, proprio, taches: await db.taches.toArray() });
      if (num !== demande.current) return;
      setEcho({ etat: "propose", p });
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
      if (echo?.etat === "propose") { if (echo.p.taches.length) confirmer(echo.p); else annulerEcho(); return; }
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
          {echo.p.reponse && <p className="echo-dit">{echo.p.reponse}</p>}
          {echo.p.taches.map((t, i) => <LigneProposee key={i} t={t} noms={noms} />)}
          <div className="pied-ap">
            <button type="button" className="bouton-texte" onPointerDown={(e) => e.preventDefault()} onClick={annulerEcho}>{echo.p.taches.length ? "Annuler" : "D'accord"}</button>
            {echo.p.taches.length === 1 && (
              <button type="button" className="bouton-texte" onPointerDown={(e) => e.preventDefault()} onClick={() => {
                const { note: _note, ...pre } = versBrouillon(echo.p.taches[0]);
                onPlusOptions(pre);
                setTexte("");
              }}>Modifier</button>
            )}
            {echo.p.taches.length > 0 && (
              <button type="button" className="bouton echo-ok" onPointerDown={(e) => e.preventDefault()} onClick={() => confirmer(echo.p)}>
                {echo.p.taches.length > 1 ? `Ajouter les ${echo.p.taches.length}` : "Ajouter"}
              </button>
            )}
          </div>
        </div>
      )}
      {r && ouverte && !ecoute && !echo && (
        <div className="apercu g">
          {parEcho ? (
            <div className="pied-ap"><span>Touche ✓ : Echo comprend ta phrase et te propose quoi ajouter.</span></div>
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
        <button className="envoyer" type="submit" aria-label={echo?.etat === "propose" ? "Ajouter" : parEcho ? "Envoyer à Echo" : "Ajouter"} disabled={!v || echo?.etat === "pense"}>
          <Check size={20} strokeWidth={2.4} autoAnimated={false} play={!!v} />
        </button>
      </div>
    </form>
  );
}

function LigneProposee({ t, noms }: { t: TacheEcho; noms: Noms }) {
  return (
    <div className="ligne-ap">
      <b>{t.titre}</b>
      <span className="tag">{libelleJour(t.jour)}</span>
      {t.heure && <span className="tag">{heureFr(t.heure)}{t.fin ? ` – ${heureFr(t.fin)}` : ""}</span>}
      <span className="tag">{nomDe(noms, t.qui)}</span>
      {t.evenement && <span className="tag">rendez-vous</span>}
      {t.repete && <span className="tag">{REPETES[t.repete]}</span>}
      {t.important && <span className="tag imp">{NIVEAUX[2]}</span>}
      {t.etapes.length > 0 && <span className="tag">{t.etapes.length} étape{t.etapes.length > 1 ? "s" : ""}</span>}
    </div>
  );
}
