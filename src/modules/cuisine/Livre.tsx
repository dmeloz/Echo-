import { useLiveQuery } from "dexie-react-hooks";
import { BookOpen, ChevronLeft, Snowflake } from "pulsoicon-react";
import { useEffect, useState } from "react";
import { db } from "../../data/db";
import { libelleJour } from "../../lib/dates";
import type { ContexteModule } from "../contrat";
import { oublierRecette } from "./actions";
import type { Recette } from "./donnees";
import { prevoirRecette } from "./semaineEcho";

// Le livre de recettes : les plats qu'on a aimés (pouce en haut après le repas). On en remet un dans la semaine d'un toucher.
// En bas, ce qu'Echo ne propose plus (pouce en bas), pour pouvoir changer d'avis.
export function Livre({ now, onQuitter }: ContexteModule & { onQuitter: () => void }) {
  const toutes = useLiveQuery(() => db.cuisine_recettes.toArray(), [], undefined);
  const [ouvert, setOuvert] = useState<string | null>(null);
  useEffect(() => {
    addEventListener("echo-retour", onQuitter);
    return () => removeEventListener("echo-retour", onQuitter);
  }, [onQuitter]);
  const aimees = (toutes ?? []).filter((r) => r.avis === 1).sort((a, b) => b.dernier.localeCompare(a.dernier) || a.plat.localeCompare(b.plat));
  const refusees = (toutes ?? []).filter((r) => r.avis === -1).sort((a, b) => a.plat.localeCompare(b.plat));
  const sous = (r: Recette) => [r.fois > 1 ? `fait ${r.fois} fois` : "", r.dernier ? `dernier : ${libelleJour(r.dernier, now).toLowerCase()}` : ""].filter(Boolean).join(", ");

  return (
    <div className="reglage-page">
      <button type="button" className="retour" onClick={onQuitter}><ChevronLeft size={20} strokeWidth={2.2} />Cuisine</button>
      <h2 className="reglage-titre">Livre de recettes</h2>
      {toutes && aimees.length === 0 && (
        <section className="g vide">
          <span className="vide-icone" aria-hidden="true"><BookOpen size={24} strokeWidth={1.8} animated={false} /></span>
          <h2>Le livre est vide</h2>
          <p>Après un repas, touche le pouce en haut dans la semaine : le plat se range ici, et Echo sait que vous l'aimez.</p>
        </section>
      )}
      {aimees.length > 0 && (
        <ul className="g liste-stock">
          {aimees.map((r) => (
            <li key={r.cle} className={ouvert === r.cle ? "ouvert" : ""}>
              <button type="button" className="stock-ligne" aria-expanded={ouvert === r.cle} onClick={() => setOuvert(ouvert === r.cle ? null : r.cle)}>
                <b>{r.plat}</b>
                {r.congele && <Snowflake size={16} strokeWidth={2.2} role="img" aria-label="Se congèle" animated={false} />}
                {r.fois > 1 && <span className="compte">×{r.fois}</span>}
              </button>
              {ouvert === r.cle && (
                <div className="stock-plus">
                  {sous(r) && <p className="aide-champ">{sous(r).charAt(0).toUpperCase() + sous(r).slice(1)}.</p>}
                  {r.ingredients && <p className="aide-champ">{r.ingredients.map((i) => (i.qte ? `${i.nom} (${i.qte})` : i.nom)).join(", ")}</p>}
                  <div className="rangee">
                    <button type="button" className="bouton petit" onClick={() => { setOuvert(null); prevoirRecette(r, now); }}>Prévoir</button>
                    <button type="button" className="bouton-texte danger" onClick={() => { setOuvert(null); oublierRecette(r.cle); }}>Retirer du livre</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {refusees.length > 0 && (
        <>
          <span className="lab magasin-lab">Echo ne propose plus</span>
          <ul className="g liste-stock">
            {refusees.map((r) => (
              <li key={r.cle}><div className="stock-ligne"><b>{r.plat}</b><button type="button" className="bouton-texte" onClick={() => oublierRecette(r.cle)}>Remettre</button></div></li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
