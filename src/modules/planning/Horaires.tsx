import { ChevronLeft, ChevronRight } from "pulsoicon-react";
import { useState } from "react";
import { toast } from "sonner";
import { auJour } from "../../lib/dates";
import { vibrer } from "../../lib/gestes";
import type { Personne } from "../../lib/types";
import { poserHoraire, remplirHoraires } from "../../data/actions";
import { useHoraires } from "../../data/hooks";
import { bilanMois, CODES, CODES_COURANTS, CODES_RARES, decalageLundi, heuresDe, joursDuMois, lireSuite, moisDe, moisVoisin, type Code } from "../../lib/horaires";

const nomMois = (mois: string) => { const s = new Date(mois + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); return s.charAt(0).toUpperCase() + s.slice(1); };
const ENTETES = ["L", "M", "M", "J", "V", "S", "D"];
const classeCode = (c: Code) => "code-" + c.toLowerCase();

// Mes horaires : le mois en grille. On choisit un code, puis on touche les jours.
// Toucher un jour qui a déjà ce code le vide. On peut aussi écrire tout le mois d'un coup.
export function VueHoraires({ proprio, now }: { proprio: Personne; now: Date }) {
  const today = auJour(0, now);
  const [mois, setMois] = useState(() => moisDe(today));
  const [pinceau, setPinceau] = useState<Code>("C5");
  const [autres, setAutres] = useState(false);
  const [suite, setSuite] = useState("");
  const tous = useHoraires();
  const miens = tous.filter((h) => h.qui === proprio);
  const parJour = new Map(miens.map((h) => [h.jour, h.code]));
  const jours = joursDuMois(mois);
  const b = bilanMois(miens, mois);
  const vide = Array.from({ length: decalageLundi(mois) });

  const toucher = (jour: string) => {
    vibrer(6);
    poserHoraire(proprio, jour, parJour.get(jour) === pinceau ? null : pinceau).catch(() => toast("Pas enregistré. Réessaie."));
  };
  const remplir = () => {
    const r = lireSuite(suite, mois);
    if (!r.jours.length) { toast("Je n'ai reconnu aucun code. Écris par exemple : C5 C6 C1 R R"); return; }
    remplirHoraires(proprio, r.jours).then(() => {
      setSuite("");
      if (r.inconnus.length) toast(`Pas compris : ${r.inconnus.slice(0, 4).join(", ")}. Ces jours sont restés comme avant.`, { duration: 6000 });
    });
  };
  const choix = (c: Code) => (
    <button key={c} type="button" className={`pinceau ${classeCode(c)}`} aria-pressed={pinceau === c} onClick={() => setPinceau(c)}>
      <b>{CODES[c].court}</b><small>{heuresDe(c) || CODES[c].libelle}</small>
    </button>
  );

  return (
    <section className="g horaires" aria-labelledby="lab-horaires">
      <div className="mois-tete">
        <button type="button" className="rond-petit" aria-label="Mois précédent" onClick={() => setMois(moisVoisin(mois, -1))}><ChevronLeft size={20} strokeWidth={2} /></button>
        <h2 id="lab-horaires">{nomMois(mois)}</h2>
        <button type="button" className="rond-petit" aria-label="Mois suivant" onClick={() => setMois(moisVoisin(mois, 1))}><ChevronRight size={20} strokeWidth={2} /></button>
      </div>
      <p className="bilan-mois">
        {b.travail || b.vacances || b.repos
          ? <>{b.travail} jour{b.travail > 1 ? "s" : ""} de travail{b.heures ? ` (${String(b.heures).replace(".", ",")} h)` : ""}{b.vacances ? `, ${b.vacances} de vacances` : ""}{b.repos ? `, ${b.repos} de repos` : ""}.</>
          : "Choisis un code, puis touche les jours."}
      </p>

      <div className="pinceaux" role="group" aria-label="Code à poser">
        {CODES_COURANTS.map(choix)}
        {autres && CODES_RARES.map(choix)}
        <button type="button" className="pinceau plus-codes" aria-expanded={autres} onClick={() => setAutres((a) => !a)}><b>{autres ? "Moins" : "Autres"}</b><small>{autres ? "codes rares" : "C2, C3, C4…"}</small></button>
      </div>

      <div className="grille-mois" role="grid" aria-label={`Horaires de ${nomMois(mois)}`}>
        {ENTETES.map((e, i) => <span key={i} className="gm-entete" aria-hidden="true">{e}</span>)}
        {vide.map((_, i) => <span key={"v" + i} aria-hidden="true" />)}
        {jours.map((j) => {
          const c = parJour.get(j);
          const n = Number(j.slice(8));
          const libelle = new Date(j + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric" });
          return (
            <button key={j} type="button" className={`gm-jour${c ? " " + classeCode(c) : ""}${j === today ? " auj" : ""}`} onClick={() => toucher(j)}
              aria-label={`${libelle} : ${c ? CODES[c].libelle + (heuresDe(c) ? ", " + heuresDe(c) : "") : "rien"}`}>
              <span>{n}</span>{c && <b>{CODES[c].court}</b>}
            </button>
          );
        })}
      </div>

      <details className="suite">
        <summary>Écrire tout le mois d'un coup</summary>
        <p className="aide-champ">Les codes dans l'ordre, du 1er au {jours.length}, séparés par des espaces. R pour repos, V pour vacances, un tiret pour laisser un jour comme il est.</p>
        <textarea value={suite} rows={3} placeholder="C5 C6 C1 R R R C5 …" aria-label="Codes du mois, dans l'ordre" onChange={(e) => setSuite(e.target.value)} />
        <div className="rangee"><button type="button" className="bouton petit" disabled={!suite.trim()} onClick={remplir}>Remplir {nomMois(mois).split(" ")[0].toLowerCase()}</button></div>
      </details>
      <p className="aide-champ">Tes horaires apparaissent dans le planning et dans ton résumé du matin.</p>
    </section>
  );
}
