import { Component, type ReactNode } from "react";

// Si une page plante : un écran de secours au lieu du blanc. Les données, elles, ne bougent pas.
export class Secours extends Component<{ children: ReactNode }, { plante: boolean }> {
  state = { plante: false };
  static getDerivedStateFromError() { return { plante: true }; }
  componentDidCatch(e: unknown) { console.error("[Echo] page plantée", e); }
  render() {
    if (!this.state.plante) return this.props.children;
    return (
      <section className="g vide" role="alert">
        <h2>Cette page n'a pas pu s'afficher</h2>
        <p>Tes tâches sont toujours là, sur ce téléphone. Réessaie, ou reviens à l'accueil.</p>
        <div className="rangee centre">
          <button className="bouton" onClick={() => this.setState({ plante: false })}>Réessayer</button>
          <button className="bouton second" onClick={() => { location.replace("#aujourdhui"); this.setState({ plante: false }); }}>Retour à l'accueil</button>
        </div>
      </section>
    );
  }
}
