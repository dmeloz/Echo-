import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../data/db";
import { poserReglage, useReglage } from "../../data/hooks";
import type { ContexteModule } from "../contrat";
import { oublierHabitude } from "./actions";
import { rythme } from "./donnees";
import { GoutsReglages } from "./Gouts";

// La sous-page « Cuisine » des Réglages : les achats habituels et les goûts de celui qui tient le téléphone.
export function ReglagesCuisine({ proprio }: ContexteModule) {
  const actif = useReglage("cuisineHabituels", true);
  const habituels = useLiveQuery(async () => (await db.cuisine_habitudes.toArray()).filter((h) => rythme(h.achats) && h.refus < 3), [], []);
  const jours = (ms: number) => Math.max(2, Math.round(ms / 86_400_000));
  return (
    <>
      <section className="g reglages">
        <span className="lab">Courses</span>
        <label className="module-ligne">
          <span><b>Achats habituels</b><small>Echo remet tout seul dans la liste ce que vous achetez régulièrement. Retire un article et il le proposera moins souvent. Ce réglage vaut pour ce téléphone : pour tout arrêter, éteins-le sur les deux.</small></span>
          <input type="checkbox" role="switch" className="interrupteur" checked={actif} onChange={() => poserReglage("cuisineHabituels", !actif)} />
        </label>
        {habituels.length > 0 ? (
          <ul className="habituels">
            {habituels.map((h) => (
              <li key={h.cle}><span><b>{h.nom}</b><small>environ tous les {jours(rythme(h.achats)!)} jours</small></span>
                <button type="button" className="bouton-texte" onClick={() => oublierHabitude(h.cle)}>Oublier</button></li>
            ))}
          </ul>
        ) : <p>Echo n'a pas encore repéré d'achat habituel. Il lui faut trois achats du même produit.</p>}
      </section>
      <section className="g reglages">
        <span className="lab">Tes goûts</span>
        <GoutsReglages proprio={proprio} />
      </section>
    </>
  );
}
