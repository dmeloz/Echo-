import { Check, Mic, Plus, X } from "pulsoicon-react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { toast } from "sonner";
import { trembler } from "../lib/gestes";
import { comprendre, type Compris } from "../lib/comprendre";
import { heureFr, libelleJour } from "../lib/dates";
import { NIVEAUX, niveauPropose } from "../lib/importance";
import { appelerServeur, ErreurEcho } from "../lib/assistant";
import { executer, lancerEcho, type Faite, type ResultatEcho } from "../lib/echo/boucle";
import { aDireBonjour, motDuMatin, noterBonjour } from "../lib/echo/initiative";
import type { Action } from "../lib/echo/outils";
import { anciennes, annoncer, archiver, avecMot, chargerFil, EVT_MOT, EVT_NON_LU, expire, garderFil, MAX_ECHANGES, nouveauFil, oublierAncienne, rappelDe, titreDe, type Ancienne, type Echange, type EtatAction, type Fil, type Mot } from "../lib/echo/discussions";
import { REPETES, type Noms, type Personne } from "../lib/types";
import { ajouter } from "../data/actions";
import { nomDe, useReglage } from "../data/hooks";
import { outilsEcho, useModulesActifs } from "../modules/registre";
import { MAX_PHRASE } from "../../supabase/functions/_shared/echo-outils";

interface Props {
  noms: Noms; proprio: Personne; ouverte: boolean; ecoute: boolean; texte: string; saisie: RefObject<HTMLInputElement | null>;
  onTexte: (t: string) => void; onRanger: () => void; onFinEcoute: () => void; onPlusOptions: (pre: Compris | null) => void;
}

type EtatEcho = null | { etat: "pense"; phrase: string; direct?: string } | { etat: "propose"; r: ResultatEcho; phrase: string };

// La discussion avec Echo (src/lib/echo/discussions.ts) : gardée sur le téléphone, même si l'app se ferme.
// Elle reste « en cours » 15 minutes après le dernier message ; ensuite elle part chez les anciennes, qu'on peut relire et reprendre.
// note : ce que l'app dira à Echo avant la phrase suivante (oui / non à sa dernière proposition).
let filGarde: Fil | null | undefined;
// Après « Nouvelle », la phrase suivante part sans rappel de la discussion quittée.
let sansRappel = false;
const filActuel = (qui?: string) => {
  if (filGarde === undefined) filGarde = chargerFil(Date.now(), qui);
  if (filGarde && expire(filGarde)) { archiver(filGarde); garderFil(null); filGarde = null; }
  return filGarde;
};
const ligneDe = (a: Action) => [a.libelle, ...a.details].join(" · ");
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
  const [filEtat, setFilEtat] = useState<Fil | null>(() => filActuel(noms[proprio]));
  const fil = filEtat && !expire(filEtat) ? filEtat : null; // passé 15 minutes, la discussion repart à neuf (sauf un mot d'Echo pas encore lu)
  const setFil = (f: Fil | null) => {
    filGarde = f; garderFil(f); setFilEtat(f);
    window.dispatchEvent(new CustomEvent(EVT_NON_LU, { detail: !!f?.nouveau })); // le point sur l'étoile Echo
  };
  // Les anciennes discussions : la liste, ou l'une d'elles ouverte pour la relire.
  const [vueAnciennes, setVueAnciennes] = useState<null | "liste" | Ancienne>(null);
  // Relue seulement quand la discussion change ou qu'on ouvre la liste (pas à chaque lettre tapée).
  const liste = useMemo(() => anciennes(), [fil?.id, vueAnciennes]); // eslint-disable-line react-hooks/exhaustive-deps
  const texteRef = useRef(texte);
  texteRef.current = texte;
  // Une note pour Echo, ajoutée à celles qui attendent la phrase suivante.
  const noter = (note: string) => {
    const f = filActuel() ?? nouveauFil();
    setFil({ ...f, quand: Date.now(), note: [f.note, note].filter(Boolean).join(" ") });
  };
  // Les lignes d'action d'un échange (repéré par la discussion et sa place), si la discussion est toujours là.
  const poserActions = (id: string, i: number, actions: (a: NonNullable<Echange["actions"]>) => NonNullable<Echange["actions"]>) => {
    const f = filActuel();
    const x = f?.id === id ? f.echanges[i] : undefined;
    if (!f || !x?.actions) return;
    setFil({ ...f, echanges: f.echanges.map((e, j) => (j === i ? { ...x, actions: actions(x.actions!) } : e)) });
  };
  // Ce qu'est devenue la proposition du dernier échange (non, modifiée à la main…).
  const marquer = (etat: EtatAction) => {
    const f = filActuel();
    if (f?.echanges.length) poserActions(f.id, f.echanges.length - 1, (l) => l.map((a) => (a.etat === "propose" ? { ...a, etat } : a)));
  };
  const nouvelleDiscussion = () => { demande.current++; archiver(filActuel()); sansRappel = true; setFil(null); setEcho(null); setVueAnciennes(null); };
  const reprendreAncienne = (a: Ancienne) => {
    setVueAnciennes(null);
    const f = filActuel();
    if (f?.id === a.id) return; // c'est déjà la discussion en cours (plus récente que sa copie)
    demande.current++;
    archiver(f);
    oublierAncienne(a.id); // elle redevient la discussion en cours ; elle sera rangée de nouveau ensuite
    // Echo reçoit un rappel de cette discussion avec la phrase suivante ; l'écran la remontre telle quelle.
    setFil({ ...nouveauFil(), id: a.id, debut: a.debut, echanges: a.echanges, note: rappelDe(a, Date.now(), 1500, true) });
    setEcho(null);
    saisie.current?.focus({ preventScroll: true });
  };
  const demande = useRef(0);
  const v = texte.trim();
  const r = v ? comprendre(v, noms, undefined, proprio) : null;
  const n = r ? (r.niveau ?? niveauPropose(r)) : 1;
  // Une phrase pour un module (« plus de lait » → les courses) ne devient pas une tâche et ne part pas à l'assistant.
  const { actifs } = useModulesActifs();
  const versEcho = actif && (!!code || relie) && !simple && navigator.onLine;
  // Pendant une discussion avec Echo, tout lui est envoyé (« plus de lait » aussi : il a les courses).
  const pour = v && !tache && !((echo || fil) && versEcho) ? actifs.map((m) => (m.etat === "construit" ? m.comprendre?.(v) ?? null : null)).find((x) => x) ?? null : null;
  const parEcho = actif && (!!code || relie) && !simple && !pour;
  const tropLong = parEcho && v.length > MAX_PHRASE;
  // L'écran de discussion, comme dans l'app Claude : dès qu'Echo travaille, ou qu'une discussion est en cours.
  const ecran = ouverte && versEcho && !tache && (!!echo || !!fil?.echanges.length || !!vueAnciennes || (!v && !!fil));
  const defile = useRef<HTMLDivElement>(null);
  const nbEchanges = fil?.echanges.length ?? 0;
  const ecrit = echo?.etat === "pense" ? echo.direct : undefined; // la réponse qui s'écrit
  useEffect(() => {
    const d = defile.current;
    if (d && !vueAnciennes) d.scrollTop = d.scrollHeight;
  }, [nbEchanges, echo?.etat, vueAnciennes, ecran, ecrit]);

  // Echo prend l'initiative (src/lib/echo/initiative.ts) : son mot entre dans la discussion, quand il ne coupe rien
  // (pas pendant qu'il réfléchit ou attend un oui : le mot attend son tour).
  const mots = useRef<Mot[]>([]);
  const [motsEnAttente, setMotsEnAttente] = useState(0);
  useEffect(() => {
    const recevoir = (e: Event) => { mots.current.push((e as CustomEvent<Mot>).detail); setMotsEnAttente((n) => n + 1); };
    window.addEventListener(EVT_MOT, recevoir);
    return () => window.removeEventListener(EVT_MOT, recevoir);
  }, []);
  useEffect(() => {
    if (echo || !mots.current.length) return;
    let f = filActuel();
    for (const m of mots.current.splice(0)) f = avecMot(f, m);
    setFil(f);
  }, [echo, motsEnAttente]); // eslint-disable-line react-hooks/exhaustive-deps
  // Le petit mot du matin : la première fois qu'on ouvre l'app entre 5 h et midi.
  const initiative = useReglage("echoInitiative", true);
  useEffect(() => {
    if (!actif || !initiative || !(code || relie)) return;
    const essayer = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine || !aDireBonjour()) return;
      noterBonjour();
      motDuMatin(ctx(), appelerServeur(code), outilsEcho(actifs)).then((m) => { if (m) annoncer(m); }).catch(() => { /* pas de mot ce matin */ });
    };
    essayer();
    document.addEventListener("visibilitychange", essayer);
    return () => document.removeEventListener("visibilitychange", essayer);
  }, [actif, initiative, code, relie, actifs]); // eslint-disable-line react-hooks/exhaustive-deps
  // Ouvert sous les yeux : c'est lu (la discussion reprend ses 15 minutes à partir de maintenant).
  useEffect(() => {
    if (ecran && !vueAnciennes && fil?.nouveau) setFil({ ...fil, nouveau: false, quand: Date.now() });
  }, [ecran, vueAnciennes, fil?.nouveau]); // eslint-disable-line react-hooks/exhaustive-deps

  // On peut préparer la phrase suivante pendant qu'Echo réfléchit ; on l'envoie quand il a répondu.
  const setTexte = (t: string) => { onTexte(t); setSimple(false); setTache(false); };
  const annulerEcho = () => { demande.current++; setEcho(null); };
  const dire = (qui: string, quoi: string) => `${qui} ${quoi}`;
  const refuser = (r: ResultatEcho) => { if (r.aConfirmer.length) { marquer("non"); noter(dire(noms[proprio], "a dit non : rien de ta proposition n'a été fait.")); } annulerEcho(); };
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
    // L'échange de cette proposition (le dernier), pour y écrire ce qui a vraiment été fait.
    const f = filActuel();
    const id = f?.id ?? "", i = (f?.echanges.length ?? 0) - 1;
    const avant = f?.echanges[i]?.actions;
    // Les propositions passent à « fait » tout de suite ; s'il en manque, la suite passe à « pas fait ».
    const resultat = (n: number) => poserActions(id, i, (l) => { let k = 0; return l.map((a) => (a.etat === "propose" ? { ...a, etat: k++ < n ? "oui" as const : "non" as const } : a)); });
    resultat(r.aConfirmer.length);
    annulerEcho();
    const num = demande.current;
    const enCours = (async () => {
      const faites: Faite[] = [];
      const fait = () => noter(dire(noms[proprio], `a dit oui. Fait : ${faites.map((f) => f.ligne).join(" ; ")}.${faites.length < r.aConfirmer.length ? " Le reste n'a pas pu être fait." : ""}`));
      try {
        for (const a of r.aConfirmer) faites.push(await executer(a, phrase, ctx()));
      } catch {
        if (!faites.length) {
          // Rien de fait : la proposition revient telle quelle, avec ses boutons, pour réessayer.
          if (avant) poserActions(id, i, () => avant);
          if (num === demande.current) setEcho({ etat: "propose", r, phrase });
          trembler(boite.current);
          toast("Pas enregistré. Le téléphone manque peut-être de place : libère un peu de stockage, puis réessaie.", { duration: 7000 });
          return;
        }
        // Une partie faite : on ne la refait pas, on propose de l'annuler.
        resultat(faites.length);
        fait();
        proposerAnnuler(faites, `${faites.length} sur ${r.aConfirmer.length} fait${faites.length > 1 ? "s" : ""}, la suite n'a pas marché`);
        return;
      }
      fait();
      proposerAnnuler(faites, faites.length > 1 ? `${faites.length} choses faites` : "C'est fait");
    })();
    confirmation = enCours.catch(() => {});
  };

  const demanderA = async () => {
    // Une proposition restée sans réponse : on le dit à Echo avec la phrase suivante.
    if (echo?.etat === "propose" && echo.r.aConfirmer.length) { marquer("non"); noter(dire(noms[proprio], "n'a pas répondu à ta proposition : rien n'en a été fait.")); }
    const num = ++demande.current;
    const phrase = v;
    setVueAnciennes(null);
    setEcho({ etat: "pense", phrase });
    onTexte(""); // la phrase part tout de suite dans la discussion (elle revient si Echo ne répond pas)
    await confirmation;
    if (num !== demande.current) return;
    const avant = filActuel();
    // Une nouvelle discussion peu après la précédente : Echo en reçoit un court rappel (« et pour demain soir ? »),
    // sauf si on vient de toucher « Nouvelle » pour changer de sujet.
    const rappel = avant?.echanges.length || sansRappel ? "" : rappelDe(anciennes()[0]);
    sansRappel = false;
    const dejaFaites: Faite[] = [];
    try {
      const r = await lancerEcho(phrase, ctx(), {
        appeler: appelerServeur(code), outils: outilsEcho(actifs), seul, noter: executer, faites: dejaFaites,
        discussion: avant?.suite, note: [rappel, avant?.note].filter(Boolean).join(" "),
        // La réponse s'écrit sous les yeux, comme dans l'app Claude.
        enDirect: (t) => { if (num === demande.current) setEcho({ etat: "pense", phrase, direct: t }); },
      });
      if (num !== demande.current) {
        if (r.faites.length) { proposerAnnuler(r.faites, "Echo a fait des choses pendant ce temps"); noterFaites(r.faites); }
        return;
      }
      if (r.faites.length) proposerAnnuler(r.faites, r.faites.length > 1 ? `Echo a fait ${r.faites.length} choses` : "Echo l'a fait");
      // La discussion continue (ou repart à neuf côté Echo s'il s'est arrêté en route ; l'écran garde tout).
      const echange: Echange = {
        moi: phrase, echo: r.reponse,
        actions: [...r.faites.map((f) => ({ texte: f.ligne, etat: "fait" as const })), ...r.aConfirmer.map((a) => ({ texte: ligneDe(a), etat: "propose" as const }))],
      };
      const base = filActuel() ?? avant ?? nouveauFil();
      setFil({ ...base, suite: r.suite ?? [], echanges: [...base.echanges, echange].slice(-MAX_ECHANGES), quand: Date.now(), note: undefined });
      setEcho(r.aConfirmer.length ? { etat: "propose", r, phrase } : null);
    } catch (e) {
      // Echo a fait des petites choses avant de s'arrêter : on le dit, avec Annuler, et on ne repasse pas en mode simple (doublons).
      if (dejaFaites.length) {
        noterFaites(dejaFaites);
        proposerAnnuler(dejaFaites, `Echo s'est arrêté en route après ${dejaFaites.length} chose${dejaFaites.length > 1 ? "s" : ""} faite${dejaFaites.length > 1 ? "s" : ""}`);
        if (num === demande.current) annulerEcho();
        return;
      }
      if (num !== demande.current) return;
      setEcho(null); setSimple(true);
      if (!texteRef.current.trim()) onTexte(phrase); // la phrase revient, sans écraser ce qui a été tapé depuis
      toast(`${e instanceof ErreurEcho ? e.message : "Echo ne répond pas."} Je reprends la version simple : touche ✓ pour ajouter.`, { duration: 6000 });
    }
  };

  return (
    <form id="barre-ecriture" className={`barre-bas${ouverte ? "" : " ferme"}`} inert={!ouverte} autoComplete="off" onSubmit={(e) => {
      e.preventDefault();
      if (!r) return;
      if (echo?.etat === "pense") { trembler(boite.current); toast("Echo réfléchit encore : envoie ta phrase quand il a répondu.", { duration: 3000 }); return; }
      if (pour) { enregistrer(pour.faire, texte); return; }
      if (parEcho && navigator.onLine) {
        if (tropLong) { trembler(boite.current); toast(`C'est trop long pour Echo (${v.length} signes, ${MAX_PHRASE} au plus) : coupe en deux messages.`, { duration: 6000 }); return; }
        demanderA(); return;
      }
      enregistrer(() => ajouter({ ...r, note: "" }), texte);
    }}>
      {ecran && (
        <div className="echo-ecran g" role="log" aria-label="Discussion avec Echo">
          <div className="echo-tete">
            {vueAnciennes ? (
              <button type="button" className="bouton-texte" onPointerDown={(e) => e.preventDefault()} onClick={() => setVueAnciennes(vueAnciennes === "liste" ? null : "liste")}>Retour</button>
            ) : <b>Echo</b>}
            <span className="echo-tete-actions">
              {!vueAnciennes && liste.length > 0 && (
                <button type="button" className="bouton-texte" onPointerDown={(e) => e.preventDefault()} onClick={() => setVueAnciennes("liste")}>Discussions</button>
              )}
              {!vueAnciennes && !!fil?.echanges.length && (
                <button type="button" className="bouton-texte" onPointerDown={(e) => e.preventDefault()} onClick={nouvelleDiscussion}>Nouvelle</button>
              )}
              <button type="button" className="echo-fermer" aria-label="Fermer" onPointerDown={(e) => e.preventDefault()} onClick={() => { setVueAnciennes(null); onRanger(); }}>
                <X size={18} strokeWidth={2.2} autoAnimated={false} />
              </button>
            </span>
          </div>
          <div className="echo-fil" ref={defile}>
            {vueAnciennes === "liste" ? (
              <ul className="echo-anciennes">
                {liste.map((a) => (
                  <li key={a.id}>
                    <button type="button" onPointerDown={(e) => e.preventDefault()} onClick={() => setVueAnciennes(a)}>
                      <b>{titreDe(a)}</b><span>{quandDe(a.quand)} · {a.echanges.length} message{a.echanges.length > 1 ? "s" : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : vueAnciennes ? (
              <>
                {vueAnciennes.echanges.map((x, i) => <Bulles key={i} x={x} />)}
                <div className="echo-reprendre">
                  <button type="button" className="bouton-texte" onPointerDown={(e) => e.preventDefault()} onClick={() => { oublierAncienne(vueAnciennes.id); setVueAnciennes("liste"); }}>Effacer</button>
                  <button type="button" className="bouton" onPointerDown={(e) => e.preventDefault()} onClick={() => reprendreAncienne(vueAnciennes)}>Reprendre</button>
                </div>
              </>
            ) : <>
              {!fil?.echanges.length && echo?.etat !== "pense" && (
                <p className="echo-vide">Demande-moi n'importe quoi : organiser demain, ajouter des courses, retenir quelque chose, ou juste un conseil.</p>
              )}
              {fil?.echanges.map((x, i) => <Bulles key={i} x={x} />)}
              {echo?.etat === "pense" && <>
                <p className="bulle-moi">{echo.phrase}</p>
                {echo.direct ? <p className="echo-dit" aria-live="polite">{echo.direct}</p> : (
                  <div className="echo-pense" role="status">
                    <span className="echo-points" aria-hidden="true"><i /><i /><i /></span>
                    <span>Echo réfléchit…</span>
                  </div>
                )}
              </>}
            </>}
          </div>
          {!vueAnciennes && echo?.etat === "propose" && echo.r.aConfirmer.length > 0 && (
            <div className="pied-ap echo-choix">
              <button type="button" className="bouton-texte" onPointerDown={(e) => e.preventDefault()} onClick={() => refuser(echo.r)}>Non</button>
              {echo.r.aConfirmer.length === 1 && echo.r.aConfirmer[0].brouillon && (
                <button type="button" className="bouton-texte" onPointerDown={(e) => e.preventDefault()} onClick={() => {
                  const { note: _note, ...pre } = echo.r.aConfirmer[0].brouillon!;
                  marquer("non");
                  noter(dire(noms[proprio], "a préféré modifier ta proposition à la main."));
                  annulerEcho();
                  onPlusOptions(pre);
                  onTexte("");
                }}>Modifier</button>
              )}
              <button type="button" className="bouton echo-ok" onPointerDown={(e) => e.preventDefault()} onClick={() => confirmer(echo.r, echo.phrase)}>
                {echo.r.aConfirmer.length > 1 ? `Oui, les ${echo.r.aConfirmer.length}` : "Oui"}
              </button>
            </div>
          )}
        </div>
      )}
      {r && ouverte && !ecoute && !ecran && (
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

const ETATS: Record<EtatAction, string> = { fait: "fait", propose: "à confirmer", oui: "fait", non: "pas fait", annule: "annulé" };
const quandDe = (ms: number) => {
  const d = new Date(ms), auj = new Date();
  const h = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === auj.toDateString() ? `aujourd'hui ${h}` : `${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} ${h}`;
};

// Un échange : la phrase, la réponse d'Echo, et ce qu'il a fait ou proposé.
function Bulles({ x }: { x: Echange }) {
  return (
    <>
      {x.moi && <p className="bulle-moi">{x.moi}</p>}
      {x.echo && <p className="echo-dit">{x.echo}</p>}
      {x.actions?.map((a, i) => (
        <div key={i} className={`echo-action ${a.etat}`}>
          <span>{a.etat === "fait" || a.etat === "oui" ? "✓ " : ""}{a.texte}</span>
          <span className={`tag${a.etat === "propose" ? " imp" : ""}`}>{ETATS[a.etat]}</span>
        </div>
      ))}
    </>
  );
}
