import type { Module } from "../modules/contrat";

// Un module pas encore construit : on le dit clairement, et on montre ce qui viendra.
export function Bientot({ module, onAller }: { module: Module; onAller: (id: string) => void }) {
  return (
    <section className="g pas-construit">
      <span className="etiquette">Pas encore construit</span>
      <h2>Ce qui arrivera ici</h2>
      <ul>{module.prevu.map((x) => <li key={x}>{x}</li>)}</ul>
      <p>On construit l'app module par module. Aujourd'hui d'abord, puis {module.libelle}. En attendant, tu peux noter ces choses comme tâches.</p>
      <div className="rangee"><button className="bouton" onClick={() => onAller("aujourdhui")}>Aller à Aujourd'hui</button></div>
    </section>
  );
}
