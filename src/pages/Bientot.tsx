import { PREVU, type Page } from "./pages";

// Une section pas encore construite : on le dit clairement, et on montre ce qui viendra.
export function Bientot({ page, onAller }: { page: Page; onAller: (id: string) => void }) {
  return (
    <section className="g pas-construit">
      <span className="etiquette">Pas encore construit</span>
      <h2>Ce qui arrivera ici</h2>
      <ul>{PREVU[page.id].map((x) => <li key={x}>{x}</li>)}</ul>
      <p>On construit l'app section par section. Aujourd'hui d'abord, puis {page.libelle}. En attendant, tu peux noter ces choses comme tâches.</p>
      <div className="rangee"><button className="bouton" onClick={() => onAller("aujourdhui")}>Aller à Aujourd'hui</button></div>
    </section>
  );
}
