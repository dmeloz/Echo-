import { poserReglage, useReglage } from "../../data/hooks";

// La sous-page « Maison » des Réglages.
export function ReglagesMaison() {
  const equilibre = useReglage("maisonEquilibre", true);
  return (
    <section className="g reglages">
      <span className="lab">Corvées</span>
      <label className="module-ligne">
        <span><b>Montrer l'équilibre</b><small>Une fine barre sous les corvées : la part de chacun sur les 4 dernières semaines, comptée en minutes. Ce réglage vaut pour ce téléphone.</small></span>
        <input type="checkbox" role="switch" className="interrupteur" checked={equilibre} onChange={() => poserReglage("maisonEquilibre", !equilibre)} />
      </label>
    </section>
  );
}
