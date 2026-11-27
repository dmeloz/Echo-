import { ChevronLeft, ChevronRight } from "pulsoicon-react";
import { useState } from "react";
import type { Tache } from "../../lib/types";
import { CODES, decalageLundi, joursDuMois, moisDe, moisVoisin, type Code } from "../../lib/horaires";

const NOMS_JOURS = ["L", "M", "M", "J", "V", "S", "D"];
const nomMois = (mois: string) => new Date(mois + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

// Le mois en grille : ton code de travail et un point par chose prévue. Toucher un jour l'ouvre en vue Jour.
export function VueMois({ taches, travail, today, onJour }: { taches: Tache[]; travail: Map<string, Code>; today: string; onJour: (j: string) => void }) {
  const [mois, setMois] = useState(() => moisDe(today));
  const jours = joursDuMois(mois);
  const parJour = new Map<string, Tache[]>();
  for (const t of taches) if (!t.fait && t.jour.startsWith(mois)) parJour.set(t.jour, [...(parJour.get(t.jour) ?? []), t]);

  return (
    <section className="g vue-mois" aria-label={`Mois de ${nomMois(mois)}`}>
      <div className="mois-tete">
        <button type="button" className="rond-petit" aria-label="Mois précédent" onClick={() => setMois(moisVoisin(mois, -1))}><ChevronLeft size={18} strokeWidth={2} animated={false} /></button>
        <b>{nomMois(mois)}</b>
        <button type="button" className="rond-petit" aria-label="Mois suivant" onClick={() => setMois(moisVoisin(mois, 1))}><ChevronRight size={18} strokeWidth={2} animated={false} /></button>
      </div>
      <div className="mois-grille">
        {NOMS_JOURS.map((n, i) => <span key={i} className="mg-nom" aria-hidden="true">{n}</span>)}
        {Array.from({ length: decalageLundi(mois) }, (_, i) => <span key={"v" + i} />)}
        {jours.map((j) => {
          const liste = parJour.get(j) ?? [];
          const code = travail.get(j);
          return (
            <button key={j} type="button" className={`mg-jour${j === today ? " auj" : ""}${j < today ? " passe" : ""}`} onClick={() => onJour(j)}
              aria-label={`${new Date(j + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}${code ? ", " + CODES[code].libelle : ""} : ${liste.length ? liste.map((t) => t.titre).join(", ") : "rien de prévu"}`}>
              <b>{Number(j.slice(8))}</b>
              {code && CODES[code].court && <em className={`code-mini code-${code.toLowerCase()}`}>{CODES[code].court}</em>}
              <span className="points" aria-hidden="true">{liste.slice(0, 3).map((t) => <i key={t.id} className={t.qui === "elle" ? "elle" : t.evt ? "evt" : ""} />)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
