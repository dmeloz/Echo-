import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, House, Minus, Package, Plus, Refrigerator, Snowflake } from "pulsoicon-react";
import { useEffect, useState } from "react";
import { db } from "../../data/db";
import { auJour, libelleJour } from "../../lib/dates";
import type { ContexteModule } from "../contrat";
import { vibrer } from "../../lib/gestes";
import { ajouterProduit, compterProduit, noterReste, retirerProduit } from "./actions";
import { LIEUX, RESTES, montant, type LectureTicket, type Lieu, type Produit, type Reste } from "./donnees";
import { PhotoTicket } from "./Ticket";

const ICONES: Record<Lieu, typeof House> = { frigo: Refrigerator, congelateur: Snowflake, placard: Package, maison: House };

// La petite jauge d'un produit : trois traits, pleins selon ce qu'il reste.
function Jauge({ reste }: { reste?: Reste }) {
  const n = reste === "peu" ? 1 : reste === "moitie" ? 2 : 3;
  return <i className={`jauge n${n}`} role="img" aria-label={reste === "peu" ? "Presque fini" : reste === "moitie" ? "À moitié" : "Plein"}><i /><i /><i /></i>;
}

// Le stock : ce qu'il faut manger vite, puis quatre endroits. On le remplit avec la photo du ticket de caisse, ou à la main.
// (Le code-barres arrive plus tard.)
export function Stock({ now, onTicket }: ContexteModule & { onTicket: (lu: LectureTicket) => void }) {
  const produits = useLiveQuery(() => db.cuisine_stock.toArray(), [], [] as Produit[]);
  const dernier = useLiveQuery(async () => (await db.cuisine_tickets.toArray()).sort((a, b) => b.cree - a.cree)[0], [], undefined);
  const [lieu, setLieu] = useState<Lieu | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const today = auJour(0, now), limite = auJour(3, now);
  const vite = produits.filter((p) => p.avant && p.avant <= limite).sort((a, b) => a.avant!.localeCompare(b.avant!));
  const quand = (p: Produit) => (p.avant! < today ? "dépassé" : libelleJour(p.avant!, now).toLowerCase());
  useEffect(() => {
    if (!lieu) return;
    const retour = () => setLieu(null);
    addEventListener("echo-retour", retour);
    return () => removeEventListener("echo-retour", retour);
  }, [lieu]);

  if (lieu) {
    const ici = produits.filter((p) => p.lieu === lieu).sort((a, b) => (a.avant ?? "9").localeCompare(b.avant ?? "9") || a.nom.localeCompare(b.nom));
    return (
      <div className="reglage-page" key={lieu}>
        <button type="button" className="retour" onClick={() => setLieu(null)}><ChevronLeft size={20} strokeWidth={2.2} />Stock</button>
        <h2 className="reglage-titre">{LIEUX.find((l) => l.id === lieu)!.nom}</h2>
        <form className="g ajout-stock" autoComplete="off" onSubmit={(e) => {
          e.preventDefault();
          const f = e.currentTarget, nom = f.elements.namedItem("nom") as HTMLInputElement, avant = f.elements.namedItem("avant") as HTMLInputElement;
          if (!nom.value.trim()) return;
          ajouterProduit(nom.value, lieu, avant.value); f.reset(); nom.focus();
        }}>
          <label className="vh" htmlFor="stock-nom">Produit</label>
          <input id="stock-nom" name="nom" className="saisie" placeholder="Ajouter : « 6 crèmes », « beurre »" maxLength={60} enterKeyHint="done" />
          <label className="puce">À manger avant <input type="date" name="avant" min={today} /></label>
          <button type="submit" className="rond-champ plein" aria-label="Ajouter au stock"><Plus size={20} strokeWidth={2.4} /></button>
        </form>
        {ici.length > 0 ? (
          <ul className="g liste-stock">
            {ici.map((p) => (
              <li key={p.id} className={ouvert === p.id ? "ouvert" : ""}>
                <button type="button" className="stock-ligne" aria-expanded={ouvert === p.id} onClick={() => setOuvert(ouvert === p.id ? null : p.id)}>
                  <b>{p.nom}{p.qte && <i> {p.qte}</i>}</b>
                  {p.avant && <span className={p.avant <= limite ? "vite" : ""}>{quand(p)}</span>}
                  {p.nb ? <span className={`compte${p.nb === 1 ? " dernier" : ""}`} aria-label={`Il en reste ${p.nb}`}>×{p.nb}</span> : <Jauge reste={p.reste} />}
                </button>
                {ouvert === p.id && (
                  <div className="stock-plus">
                    <span className="lab">Il en reste</span>
                    {p.nb ? (
                      <div className="stock-restes" role="group" aria-label={`Ce qu'il reste de ${p.nom}`}>
                        <div className="compteur">
                          <button type="button" aria-label="Un de moins" onClick={() => { vibrer(); if (p.nb === 1) setOuvert(null); compterProduit(p.id, -1); }}><Minus size={18} strokeWidth={2.4} /></button>
                          <output aria-live="polite">{p.nb}</output>
                          <button type="button" aria-label="Un de plus" onClick={() => { vibrer(); compterProduit(p.id, 1); }}><Plus size={18} strokeWidth={2.4} /></button>
                        </div>
                        <button type="button" className="puce" onClick={() => { vibrer(12); setOuvert(null); noterReste(p.id, "fini"); }}>Fini</button>
                      </div>
                    ) : (
                      <div className="stock-restes" role="group" aria-label={`Ce qu'il reste de ${p.nom}`}>
                        {RESTES.map((r) => <button key={r.id} type="button" className="puce" aria-pressed={(p.reste ?? "plein") === r.id} onClick={() => { vibrer(); noterReste(p.id, r.id); }}>{r.nom}</button>)}
                        <button type="button" className="puce" onClick={() => { vibrer(12); setOuvert(null); noterReste(p.id, "fini"); }}>Fini</button>
                      </div>
                    )}
                    <p className="aide-champ">{p.nb ? "Au dernier, Echo le remet dans les courses." : "Presque fini ou fini : Echo le remet dans les courses."}</p>
                    {!p.nb && <button type="button" className="bouton-texte" onClick={() => compterProduit(p.id, 1)}>J'en ai plusieurs</button>}
                    <button type="button" className="bouton-texte danger" onClick={() => { setOuvert(null); retirerProduit(p.id); }}>Retirer sans racheter</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : <p className="note-donnees">Rien ici pour l'instant.</p>}
      </div>
    );
  }

  return (
    <>
      <PhotoTicket onLu={onTicket} />
      {vite.length > 0 && (
        <section className="g manger-vite">
          <span className="lab">À manger vite</span>
          <ul>{vite.map((p) => <li key={p.id}><b>{p.nom}</b><span className={p.avant! <= today ? "retard" : ""}>{quand(p)}</span></li>)}</ul>
        </section>
      )}
      <div className="lieux">
        {LIEUX.map(({ id, nom }) => {
          const Icone = ICONES[id], n = produits.filter((p) => p.lieu === id).length;
          return (
            <button key={id} type="button" className="tuile" onClick={() => setLieu(id)}>
              <span className="tuile-icone" aria-hidden="true"><Icone size={18} strokeWidth={1.8} animated={false} /></span>
              <b>{nom}</b><span>{n ? `${n} produit${n > 1 ? "s" : ""}` : "Vide"}</span>
            </button>
          );
        })}
      </div>
      <p className="note-donnees">{dernier ? `Dernier ticket : ${[dernier.magasin, libelleJour(dernier.date, now).toLowerCase(), dernier.total ? montant(dernier.total, dernier.monnaie) : ""].filter(Boolean).join(", ")}.` : "Pas besoin de tout noter : la photo du ticket remplit le stock, et tu peux ajouter à la main ce que tu veux suivre."}</p>
    </>
  );
}
