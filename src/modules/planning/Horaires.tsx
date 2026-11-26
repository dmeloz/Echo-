import { Camera, ChevronLeft, ChevronRight, KeyRound } from "pulsoicon-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { auJour } from "../../lib/dates";
import { vibrer } from "../../lib/gestes";
import { bilanMois, CODES, CODES_COURANTS, CODES_RARES, decalageLundi, heuresDe, joursDuMois, lireSuite, moisDe, moisVoisin, type Code } from "../../lib/horaires";
import { ErreurLecture, lireFiche, preparerPhoto, propositions } from "../../lib/lecture";
import type { Personne } from "../../lib/types";
import { poserHoraire, remplirHoraires } from "../../data/actions";
import { poserReglage, useHoraires, useReglage } from "../../data/hooks";

const nomMois = (mois: string) => { const s = new Date(mois + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); return s.charAt(0).toUpperCase() + s.slice(1); };
const ENTETES = ["L", "M", "M", "J", "V", "S", "D"];
const classeCode = (c: Code) => "code-" + c.toLowerCase();

interface Apercu { jours: Map<string, { code: Code; sur: boolean }>; remarque: string; concorde: boolean }

// Mes horaires : le mois en grille, un code par jour.
// Trois façons de remplir : prendre la fiche en photo (Echo la lit), toucher ou glisser sur les jours, ou écrire le mois d'un coup.
export function VueHoraires({ proprio, now }: { proprio: Personne; now: Date }) {
  const today = auJour(0, now);
  const [mois, setMois] = useState(() => moisDe(today));
  const [pinceau, setPinceau] = useState<Code>("C5");
  const [autres, setAutres] = useState(false);
  const [suite, setSuite] = useState("");
  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [lit, setLit] = useState(false);
  const [reglagesPhoto, setReglagesPhoto] = useState(false);
  const nomFiche = useReglage<string>("nomFiche", "");
  const codeEcho = useReglage<string>("codeEcho", "");
  const relie = !!useReglage<unknown>("foyer", null); // relié au foyer : la session suffit, pas besoin du code
  const photo = useRef<HTMLInputElement>(null);
  const tous = useHoraires();
  const miens = tous.filter((h) => h.qui === proprio);
  const parJour = new Map(miens.map((h) => [h.jour, h.code]));
  const jours = joursDuMois(mois);
  const b = bilanMois(miens, mois);
  const vide = Array.from({ length: decalageLundi(mois) });
  const aVerifier = apercu ? [...apercu.jours].filter(([, v]) => !v.sur).map(([j]) => Number(j.slice(8))) : [];

  const changerMois = (n: number) => { if (apercu) return; setMois(moisVoisin(mois, n)); };

  // Poser un code sur un jour : dans l'aperçu de la photo, ou directement dans les horaires.
  const peindre = (jour: string, code: Code | null) => {
    if (apercu) {
      const j = new Map(apercu.jours);
      if (code) j.set(jour, { code, sur: true }); else j.delete(jour);
      setApercu({ ...apercu, jours: j });
      return;
    }
    poserHoraire(proprio, jour, code).catch(() => toast("Pas enregistré. Réessaie."));
  };
  const codeDe = (jour: string) => (apercu ? apercu.jours.get(jour)?.code : parJour.get(jour));

  // Glisser le doigt sur la grille pose le même code sur tous les jours traversés.
  const trace = useRef<{ efface: boolean; vus: Set<string> } | null>(null);
  const jourSous = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>(".gm-jour")?.dataset.jour;
  const debut = (e: React.PointerEvent) => {
    const jour = (e.target as HTMLElement).closest<HTMLElement>(".gm-jour")?.dataset.jour;
    if (!jour) return;
    const efface = codeDe(jour) === pinceau;
    trace.current = { efface, vus: new Set([jour]) };
    vibrer(6);
    peindre(jour, efface ? null : pinceau);
  };
  const suivre = (e: React.PointerEvent) => {
    const t = trace.current;
    if (!t) return;
    const jour = jourSous(e.clientX, e.clientY);
    if (!jour || t.vus.has(jour)) return;
    t.vus.add(jour);
    vibrer(4);
    peindre(jour, t.efface ? null : pinceau);
  };
  const fin = () => { trace.current = null; };

  const remplir = () => {
    const r = lireSuite(suite, mois);
    if (!r.jours.length) { toast("Je n'ai reconnu aucun code. Écris par exemple : C5 C6 C1 R R"); return; }
    remplirHoraires(proprio, r.jours).then(() => {
      setSuite("");
      if (r.inconnus.length) toast(`Pas compris : ${r.inconnus.slice(0, 4).join(", ")}. Ces jours sont restés comme avant.`, { duration: 6000 });
    });
  };

  const prendrePhoto = () => {
    if (!nomFiche.trim() || (!codeEcho.trim() && !relie)) { setReglagesPhoto(true); return; }
    photo.current?.click();
  };
  const lirePhoto = async (fichier: File | undefined) => {
    if (!fichier) return;
    setLit(true);
    try {
      const { data, type } = await preparerPhoto(fichier);
      const l = await lireFiche({ data, type, nom: nomFiche.trim(), mois, code: codeEcho.trim() });
      if (!l.ligne_trouvee) { toast(`Je n'ai pas trouvé « ${nomFiche} » sur la photo. Vérifie ton nom, ou reprends la photo avec toute la fiche.`, { duration: 7000 }); return; }
      const p = propositions(l, mois);
      if (!p.length) { toast("Je n'ai lu aucun jour sur cette photo. Reprends-la bien à plat.", { duration: 6000 }); return; }
      vibrer(12);
      setApercu({ jours: new Map(p.map((x) => [x.jour, { code: x.code, sur: x.sur }])), remarque: l.remarque, concorde: l.mois_concorde });
    } catch (e) {
      toast(e instanceof ErreurLecture ? e.message : "La photo n'a pas pu être préparée. Réessaie.", { duration: 7000 });
    } finally {
      setLit(false);
      if (photo.current) photo.current.value = "";
    }
  };
  const valider = () => {
    if (!apercu) return;
    remplirHoraires(proprio, [...apercu.jours].map(([j, v]) => [j, v.code] as [string, Code])).then(() => setApercu(null));
  };

  const choix = (c: Code) => (
    <button key={c} type="button" className={`pinceau ${classeCode(c)}`} aria-pressed={pinceau === c} onClick={() => setPinceau(c)}>
      <b>{CODES[c].court}</b><small>{heuresDe(c) || CODES[c].libelle}</small>
    </button>
  );

  return (
    <section className="g horaires" aria-labelledby="lab-horaires">
      <div className="mois-tete">
        <button type="button" className="rond-petit" aria-label="Mois précédent" disabled={!!apercu} onClick={() => changerMois(-1)}><ChevronLeft size={20} strokeWidth={2} /></button>
        <h2 id="lab-horaires">{nomMois(mois)}</h2>
        <button type="button" className="rond-petit" aria-label="Mois suivant" disabled={!!apercu} onClick={() => changerMois(1)}><ChevronRight size={20} strokeWidth={2} /></button>
      </div>

      {apercu ? (
        <div className="apercu-photo" role="status">
          <b>Lu sur ta photo : {apercu.jours.size} jour{apercu.jours.size > 1 ? "s" : ""}</b>
          <span>
            {aVerifier.length ? `À vérifier (cases en pointillés) : le ${aVerifier.join(", ")}. ` : "Tout était net. "}
            Touche un jour pour le corriger, puis enregistre.
          </span>
          {!apercu.concorde && <span className="alerte-mois">Cette fiche ne ressemble pas à {nomMois(mois).toLowerCase()} : vérifie le mois avant d'enregistrer.</span>}
          {apercu.remarque && <span>{apercu.remarque}</span>}
          <div className="rangee">
            <button type="button" className="bouton petit" onClick={valider}>Enregistrer le mois</button>
            <button type="button" className="bouton-texte" onClick={() => setApercu(null)}>Annuler</button>
          </div>
        </div>
      ) : (
        <>
          <button type="button" className={`bouton-photo${lit ? " lit" : ""}`} onClick={prendrePhoto} disabled={lit}>
            <Camera size={22} strokeWidth={1.9} play={lit} />
            <span><b>{lit ? "Echo lit ta fiche…" : "Prendre la fiche en photo"}</b>
              <small>{lit ? "Ça prend environ une demi-minute." : `Echo trouve ta ligne et remplit ${nomMois(mois).split(" ")[0].toLowerCase()}.`}</small></span>
          </button>
          <input ref={photo} type="file" accept="image/*" capture="environment" hidden onChange={(e) => lirePhoto(e.target.files?.[0])} />
          <p className="bilan-mois">
            {b.travail || b.vacances || b.repos
              ? <>{b.travail} jour{b.travail > 1 ? "s" : ""} de travail{b.heures ? ` (${String(b.heures).replace(".", ",")} h)` : ""}{b.vacances ? `, ${b.vacances} de vacances` : ""}{b.repos ? `, ${b.repos} de repos` : ""}.</>
              : "Ou choisis un code, puis touche les jours (glisse le doigt pour en faire plusieurs)."}
          </p>
        </>
      )}

      {(reglagesPhoto) && (
        <div className="reglages-photo">
          <span className="lab"><KeyRound size={15} strokeWidth={1.8} animated={false} /> Réglages de la photo</span>
          <label className="champ">Ton nom sur la fiche
            <input defaultValue={nomFiche} placeholder="NOM Prénom, comme sur la fiche" autoComplete="off" onBlur={(e) => poserReglage("nomFiche", e.target.value.trim())} />
          </label>
          {!relie && (
            <label className="champ">Code Echo
              <input defaultValue={codeEcho} type="password" placeholder="Le code secret du foyer" autoComplete="off" onBlur={(e) => poserReglage("codeEcho", e.target.value.trim())} />
            </label>
          )}
          <p className="aide-champ">{relie ? "Gardé sur ce téléphone seulement. Ce téléphone est relié au foyer : pas besoin de code." : "Gardés sur ce téléphone seulement. Le code empêche quelqu'un d'autre d'utiliser la lecture par photo."}</p>
          <div className="rangee"><button type="button" className="bouton petit" onClick={() => setReglagesPhoto(false)}>C'est bon</button></div>
        </div>
      )}

      <div className="pinceaux" role="group" aria-label="Code à poser">
        {CODES_COURANTS.map(choix)}
        {autres && CODES_RARES.map(choix)}
        <button type="button" className="pinceau plus-codes" aria-expanded={autres} onClick={() => setAutres((a) => !a)}><b>{autres ? "Moins" : "Autres"}</b><small>{autres ? "codes rares" : "C2, C3, C4"}</small></button>
      </div>

      <div className={`grille-mois${apercu ? " en-apercu" : ""}`} role="grid" aria-label={`Horaires de ${nomMois(mois)}`}
        onPointerDown={debut} onPointerMove={suivre} onPointerUp={fin} onPointerCancel={fin} onPointerLeave={fin}>
        {ENTETES.map((e, i) => <span key={i} className="gm-entete" aria-hidden="true">{e}</span>)}
        {vide.map((_, i) => <span key={"v" + i} aria-hidden="true" />)}
        {jours.map((j) => {
          const c = codeDe(j);
          const douteux = apercu?.jours.get(j)?.sur === false;
          const n = Number(j.slice(8));
          const libelle = new Date(j + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" });
          return (
            <button key={j} type="button" data-jour={j} className={`gm-jour${c ? " " + classeCode(c) : ""}${j === today ? " auj" : ""}${douteux ? " douteux" : ""}`}
              onClick={(e) => { if (e.detail === 0) peindre(j, codeDe(j) === pinceau ? null : pinceau); }}
              aria-label={`${libelle} : ${c ? CODES[c].libelle + (heuresDe(c) ? ", " + heuresDe(c) : "") : "rien"}${douteux ? ", à vérifier" : ""}`}>
              <span>{n}</span>{c && <b>{CODES[c].court}</b>}
            </button>
          );
        })}
      </div>

      {!apercu && (
        <details className="suite">
          <summary>Écrire tout le mois d'un coup</summary>
          <p className="aide-champ">Les codes dans l'ordre, du 1er au {jours.length}, séparés par des espaces. R pour repos, V pour vacances, C pour congé, un tiret pour laisser un jour comme il est.</p>
          <textarea value={suite} rows={3} placeholder="C5 C6 C1 R R R C5 …" aria-label="Codes du mois, dans l'ordre" onChange={(e) => setSuite(e.target.value)} />
          <div className="rangee"><button type="button" className="bouton petit" disabled={!suite.trim()} onClick={remplir}>Remplir {nomMois(mois).split(" ")[0].toLowerCase()}</button></div>
        </details>
      )}
      <p className="aide-champ">
        Tes horaires apparaissent dans l'agenda et dans ton résumé du matin.{" "}
        {!reglagesPhoto && <button type="button" className="bouton-texte lien-petit" onClick={() => setReglagesPhoto(true)}>Réglages de la photo</button>}
      </p>
    </section>
  );
}
