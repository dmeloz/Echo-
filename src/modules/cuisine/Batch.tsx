import { useLiveQuery } from "dexie-react-hooks";
import { Refrigerator, Snowflake, Sparkles, X } from "pulsoicon-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { db } from "../../data/db";
import { useHoraires } from "../../data/hooks";
import { auJour, plusJours } from "../../lib/dates";
import { useEcranAllume, vibrer } from "../../lib/gestes";
import type { ContexteModule } from "../contrat";
import { cocherEtape, finirBatch } from "./actions";
import { Coche } from "./Courses";
import { besoins, boites, duree, usageProbable, utilises, type Produit, type Usage } from "./donnees";
import { ErreurSemaine, preparerBatch, repasDuBatch, versTravail } from "./semaineEcho";

const jourLong = (j: string) => new Date(j + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long" });
const USAGES: Array<{ id: Usage; nom: string }> = [{ id: "fini", nom: "Fini" }, { id: "reste", nom: "Il en reste" }, { id: "rien", nom: "Pas touché" }];

// Le batch du dimanche : le plan de cuisson d'Echo (des étapes à cocher, l'écran reste allumé), les boîtes à remplir,
// puis « Batch terminé » range les boîtes au stock et décompte ce qui a servi.
export function PageBatch({ semaine, now, onQuitter }: ContexteModule & { semaine: string; onQuitter: () => void }) {
  const today = auJour(0, now);
  const jours = Array.from({ length: 7 }, (_, i) => plusJours(semaine, i));
  const d = useLiveQuery(async () => ({
    batch: await db.cuisine_batch.get(semaine),
    repas: await db.cuisine_repas.where("jour").between(jours[0], jours[6], true, true).toArray(),
    stock: await db.cuisine_stock.toArray(),
  }), [semaine]);
  const horaires = useHoraires();
  const [pense, setPense] = useState(false);
  const [choix, setChoix] = useState<Record<string, Usage>>({});
  useEcranAllume();
  useEffect(() => {
    addEventListener("echo-retour", onQuitter);
    return () => removeEventListener("echo-retour", onQuitter);
  }, [onQuitter]);
  if (!d) return null;

  const { batch } = d, fini = !!batch?.fini;
  // Une fois rangé, on montre la semaine entière ; avant, seulement ce qui reste à manger.
  const repas = fini ? d.repas.filter((r) => !r.propose) : repasDuBatch(d.repas, today);
  const tous = besoins(jours, versTravail(horaires));
  const aRemplir = boites(repas, tous);
  const servis = fini ? [] : utilises(repas, d.stock);
  const usageDe = (p: Produit) => choix[p.id] ?? usageProbable(p);
  const faites = batch?.etapes.filter((e) => e.fait).length ?? 0, total = batch?.etapes.length ?? 0;

  const planifier = async () => {
    if (pense) return;
    setPense(true);
    try { await preparerBatch(semaine, repas, tous); }
    catch (e) { toast(e instanceof ErreurSemaine ? e.message : "Echo ne répond pas pour l'instant.", { duration: 6000 }); }
    finally { setPense(false); }
  };
  const terminer = async () => {
    vibrer(12);
    await finirBatch(semaine, aRemplir, servis.map((p) => ({ id: p.id, usage: usageDe(p) })));
    onQuitter();
  };

  return (
    <div className="magasin batch">
      <div className="magasin-tete">
        <button type="button" className="loupe-ouvrir" aria-label="Fermer le batch" onClick={onQuitter}><X size={20} strokeWidth={2.2} /></button>
        <div><b>Batch du dimanche</b><span>{[`${aRemplir.length} plat${aRemplir.length > 1 ? "s" : ""}`, batch?.duree ? `environ ${duree(batch.duree)}` : "", fini ? "rangé" : ""].filter(Boolean).join(", ")}</span></div>
      </div>

      {total > 0 && !fini && <div className="magasin-barre" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={faites} aria-label="Étapes faites"><i style={{ width: `${(faites / total) * 100}%` }} /></div>}

      {pense && <div className="g barre-echo" role="status"><span className="echo-points" aria-hidden="true"><i /><i /><i /></span><b>Echo prépare le plan de cuisson…</b></div>}
      {!pense && !total && !fini && aRemplir.length > 0 && (
        <button type="button" className="g barre-echo lien" onClick={planifier}>
          <Sparkles size={18} strokeWidth={2} className="etoile" animated={false} />
          <b>Faire le plan de cuisson</b><span>dans l'ordre</span>
        </button>
      )}

      {total > 0 && (
        <section className="g liste-magasin" aria-label="Plan de cuisson">
          <h2>Le plan</h2>
          {batch!.etapes.map((e, i) => (
            <button key={i} type="button" className={`etape-batch${e.fait ? " fait" : ""}`} role="checkbox" aria-checked={!!e.fait} disabled={fini} onClick={() => { vibrer(); cocherEtape(semaine, i); }}>
              <span className={`case${e.fait ? " cochee" : ""}`} aria-hidden="true">{e.fait && <Coche />}</span>
              <span className="art-nom">{e.texte}</span>{e.minutes > 0 && <span className="qte">{e.minutes} min</span>}
            </button>
          ))}
          {batch!.astuce && <p className="astuce-batch">{batch!.astuce}</p>}
        </section>
      )}

      {aRemplir.length > 0 ? (
        <>
          <span className="lab magasin-lab">Les boîtes</span>
          <section className="g boites">
            {aRemplir.map((b) => {
              const Icone = b.lieu === "frigo" ? Refrigerator : Snowflake;
              return (
                <div key={b.jour}>
                  <span className="tuile-icone" aria-hidden="true"><Icone size={18} strokeWidth={1.8} animated={false} /></span>
                  <b>{b.plat}</b>
                  <span>{b.portions} portion{b.portions > 1 ? "s" : ""}, {b.lieu === "frigo" ? "frigo" : "congélateur"}, pour {jourLong(b.jour)}</span>
                </div>
              );
            })}
          </section>
        </>
      ) : (
        <section className="g vide"><h2>Rien à cuisiner</h2><p>Valide d'abord les repas de la semaine : le batch part de là.</p></section>
      )}

      {servis.length > 0 && (
        <>
          <span className="lab magasin-lab">Ce qui a servi</span>
          <section className="g servis">
            {servis.map((p) => (
              <div key={p.id} role="group" aria-label={p.nom}>
                <b>{p.nom}{p.nb ? <i> ×{p.nb}</i> : null}</b>
                <div className="stock-restes">
                  {USAGES.filter((u) => !p.nb || u.id !== "reste").map((u) => (
                    <button key={u.id} type="button" className="puce" aria-pressed={usageDe(p) === u.id} onClick={() => { vibrer(); setChoix((c) => ({ ...c, [p.id]: u.id })); }}>{p.nb && u.id === "fini" ? "Un de moins" : u.nom}</button>
                  ))}
                </div>
              </div>
            ))}
            <p className="aide-champ">Echo met le stock à jour quand tu ranges les boîtes.</p>
          </section>
        </>
      )}

      {!fini && aRemplir.length > 0 && <div className="rangee centre"><button type="button" className={`bouton${total && faites < total ? " second" : ""}`} onClick={terminer}>Batch terminé, ranger les boîtes</button></div>}
      {!fini && total > 0 && !pense && <button type="button" className="bouton-texte centre" onClick={planifier}>Refaire le plan</button>}
      {fini && <p className="note-donnees">Les boîtes sont au stock. Chacune en sort toute seule après son repas.</p>}
    </div>
  );
}
