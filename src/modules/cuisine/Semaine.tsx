import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { db } from "../../data/db";
import { auJour, plusJours } from "../../lib/dates";
import type { ContexteModule } from "../contrat";
import { poserRepas } from "./actions";

// La semaine du lundi au dimanche. Lot 1 : on écrit soi-même le repas du soir, un jour = une ligne.
// (La proposition d'Echo arrive avec le lot 2.)
export function Semaine({ now }: ContexteModule) {
  const today = auJour(0, now);
  const lundi = plusJours(today, -((now.getDay() + 6) % 7));
  const jours = Array.from({ length: 7 }, (_, i) => plusJours(lundi, i));
  const repas = useLiveQuery(() => db.cuisine_repas.where("jour").between(jours[0], jours[6], true, true).toArray(), [lundi], []);
  const [ecrit, setEcrit] = useState<string | null>(null);
  const court = (j: string, o: Intl.DateTimeFormatOptions) => new Date(j + "T12:00:00").toLocaleDateString("fr-FR", o).replace(".", "");

  return (
    <>
      <div className="semaine-dates">{court(jours[0], { day: "numeric", month: "short" })} – {court(jours[6], { day: "numeric", month: "short" })} · repas du soir</div>
      <section className="g semaine-repas">
        {jours.map((j) => {
          const plat = repas.find((r) => r.jour === j)?.plat ?? "";
          return ecrit === j ? (
            <form key={j} className="jour-repas ecrit" onSubmit={(e) => { e.preventDefault(); (e.currentTarget.elements.namedItem("plat") as HTMLInputElement).blur(); }}>
              <label htmlFor="plat-jour" className={j === today ? "auj" : ""}>{court(j, { weekday: "short" })}</label>
              <input id="plat-jour" name="plat" className="saisie" autoFocus defaultValue={plat} placeholder="Le repas du soir" maxLength={80} enterKeyHint="done"
                onBlur={(e) => { if (e.target.value.trim() !== plat) poserRepas(j, e.target.value); setEcrit(null); }} />
            </form>
          ) : (
            <button key={j} type="button" className="jour-repas" onClick={() => setEcrit(j)} aria-label={`${court(j, { weekday: "long" })} : ${plat || "rien de prévu"}`}>
              <span className={j === today ? "auj" : ""}>{court(j, { weekday: "short" })}</span>
              <b className={plat ? "" : "libre"}>{plat || "Rien de prévu"}</b>
            </button>
          );
        })}
      </section>
      <p className="note-donnees">Touche un jour pour écrire le repas. Bientôt, Echo proposera la semaine selon vos horaires et vos goûts.</p>
    </>
  );
}
