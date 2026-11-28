import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, CookingPot, Snowflake, Sparkles, ThumbsDown, ThumbsUp, X } from "pulsoicon-react";
import { useState } from "react";
import { toast } from "sonner";
import { db } from "../../data/db";
import { useHoraires } from "../../data/hooks";
import { auJour, plusJours } from "../../lib/dates";
import type { ContexteModule } from "../contrat";
import { vibrer } from "../../lib/gestes";
import { noterRepas, poserRepas } from "./actions";
import { besoins, cleDe, duree, type Besoin, type Repas } from "./donnees";
import { ErreurSemaine, changerRepas, proposerSemaine, refuserProposition, repasDuBatch, validerSemaine, versTravail } from "./semaineEcho";

const court = (j: string, o: Intl.DateTimeFormatOptions) => new Date(j + "T12:00:00").toLocaleDateString("fr-FR", o).replace(".", "");

// La semaine du lundi au dimanche, un jour = une ligne. « Prévoir ma semaine » : Echo propose les repas du soir
// selon les horaires, les goûts et le stock ; on change un plat ou on valide, et ce qu'il manque part aux courses.
export function Semaine({ now, noms, proprio, prochaine, setProchaine, onBatch }: ContexteModule & { prochaine: boolean; setProchaine: (p: boolean) => void; onBatch: (semaine: string) => void }) {
  const today = auJour(0, now);
  const lundi = plusJours(today, -((now.getDay() + 6) % 7));
  const debut = plusJours(lundi, prochaine ? 7 : 0);
  const jours = Array.from({ length: 7 }, (_, i) => plusJours(debut, i));
  // undefined tant que la base n'a pas répondu POUR CETTE semaine : pas d'écran « rien de prévu » avant de savoir.
  const lu = useLiveQuery(async () => ({ debut, liste: await db.cuisine_repas.where("jour").between(jours[0], jours[6], true, true).toArray() }), [debut]);
  const charge = lu?.debut === debut;
  const repas: Repas[] = charge ? lu.liste : [];
  const horaires = useHoraires();
  const batch = useLiveQuery(() => db.cuisine_batch.get(debut), [debut]);
  const livre = useLiveQuery(() => db.cuisine_recettes.toArray(), [], []);
  // Le pouce est enfoncé seulement pour le repas qu'il a noté (le même plat, un autre jour, se note à nouveau).
  const avisDe = (r: Repas) => { const x = livre.find((l) => l.cle === cleDe(r.plat)); return x?.dernier === r.jour ? x.avis : undefined; };
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [ecrit, setEcrit] = useState<string | null>(null);
  const [pense, setPense] = useState<"semaine" | string | null>(null); // Echo travaille : sur la semaine, ou sur un jour

  const tous = besoins(jours, versTravail(horaires));
  const besoinDe = (j: string) => tous.find((b) => b.jour === j)!;
  const platDe = (j: string) => repas.find((r) => r.jour === j);
  // À prévoir : les jours pas encore passés, sans repas, du lundi au vendredi (le week-end reste libre) où quelqu'un mange.
  const aPrevoir = tous.filter((b, i) => i < 5 && b.jour >= today && !platDe(b.jour) && (b.soir > 0 || b.gamelle));
  const proposes = repas.filter((r) => r.propose);
  const rienDuTout = repas.length === 0;
  // Le batch : dès que deux repas validés restent à manger cette semaine-là (ou s'il est déjà fait).
  const aCuisiner = repasDuBatch(repas, today).length;
  const etapes = batch?.etapes.length ?? 0, faites = batch?.etapes.filter((e) => e.fait).length ?? 0;
  const etatBatch = batch?.fini ? "Fait, les boîtes sont au stock" : etapes ? `${faites} étape${faites > 1 ? "s" : ""} sur ${etapes}${batch?.duree ? `, environ ${duree(batch.duree)}` : ""}` : `${aCuisiner} plats à cuisiner d'un coup`;

  const avecEcho = async (quoi: "semaine" | string, faire: () => Promise<unknown>) => {
    if (pense) return;
    setPense(quoi);
    try { await faire(); }
    catch (e) { toast(e instanceof ErreurSemaine ? e.message : "Echo ne répond pas pour l'instant.", { duration: 6000 }); }
    finally { setPense(null); }
  };
  const prevoir = () => avecEcho("semaine", () => proposerSemaine(aPrevoir, noms, jours));

  const soirDe = (b: Besoin) => {
    if (b.soir === 0) return "Soir : personne à la maison";
    const qui = b.absents.map((p) => (p === proprio ? "tu travailles" : `${noms[p]} travaille`)).join(", ");
    return `Soir : ${b.soir} portion${b.soir > 1 ? "s" : ""}${qui ? `, ${qui}` : ""}`;
  };

  const tete = (
      <div className="semaine-tete">
        <div className="vue-choix petit" role="group" aria-label="Quelle semaine">
          <button type="button" aria-pressed={!prochaine} onClick={() => { setProchaine(false); setOuvert(null); }}>Cette semaine</button>
          <button type="button" aria-pressed={prochaine} onClick={() => { setProchaine(true); setOuvert(null); }}>La prochaine</button>
        </div>
        <span>{court(jours[0], { day: "numeric", month: "short" })} – {court(jours[6], { day: "numeric", month: "short" })}</span>
      </div>
  );
  if (!charge) return tete;

  return (
    <>
      {tete}

      {pense === "semaine" && (
        <div className="g barre-echo" role="status"><span className="echo-points" aria-hidden="true"><i /><i /><i /></span><b>Echo prépare la semaine…</b></div>
      )}
      {!pense && proposes.length > 0 && (
        <div className="g barre-echo">
          <Sparkles size={18} strokeWidth={2} className="etoile" animated={false} />
          <b>Proposition d'Echo</b>
          <button type="button" className="rond-champ" aria-label="Refuser la proposition" onClick={() => refuserProposition(jours)}><X size={18} strokeWidth={2.2} /></button>
          <button type="button" className="bouton petit" onClick={() => validerSemaine(jours)}>Valider</button>
        </div>
      )}
      {!pense && !proposes.length && !rienDuTout && aPrevoir.length > 0 && (
        <button type="button" className="g barre-echo lien" onClick={prevoir}>
          <Sparkles size={18} strokeWidth={2} className="etoile" animated={false} />
          <b>Compléter avec Echo</b><span>{aPrevoir.length} jour{aPrevoir.length > 1 ? "s" : ""} sans repas</span>
        </button>
      )}

      {rienDuTout && !ecrit && pense !== "semaine" ? (
        <section key={jours[0]} className="g vide">
          <span className="vide-icone bleu" aria-hidden="true"><Sparkles size={24} strokeWidth={1.8} animated={false} /></span>
          <h2>Rien de prévu {prochaine ? "la semaine prochaine" : "cette semaine"}</h2>
          <p>Echo regarde vos horaires, vos goûts et ce qu'il reste à la maison, puis te propose les repas.</p>
          {aPrevoir.length > 0 && <div className="rangee centre"><button type="button" className="bouton" onClick={prevoir}>Prévoir ma semaine</button></div>}
          <button type="button" className="bouton-texte" onClick={() => setEcrit(jours.find((j) => j >= today) ?? jours[0])}>Je choisis moi-même</button>
        </section>
      ) : null}

      {(!rienDuTout || ecrit || pense === "semaine") && (
        <section key={jours[0]} className={`g semaine-repas${pense === "semaine" ? " attend" : ""}`}>
          {jours.map((j) => {
            const r = platDe(j), b = besoinDe(j), nom = court(j, { weekday: "short" });
            if (ecrit === j) return (
              <form key={j} className="jour-repas ecrit" onSubmit={(e) => { e.preventDefault(); (e.currentTarget.elements.namedItem("plat") as HTMLInputElement).blur(); }}>
                <label htmlFor="plat-jour" className={j === today ? "auj" : ""}>{nom}</label>
                <input id="plat-jour" name="plat" className="saisie" autoFocus defaultValue={r?.plat ?? ""} placeholder="Le repas du soir" maxLength={80} enterKeyHint="done"
                  onBlur={(e) => { if (e.target.value.trim() !== (r?.plat ?? "")) poserRepas(j, e.target.value); setEcrit(null); }} />
              </form>
            );
            if (!r) return (
              <button key={j} type="button" className={`jour-repas${j < today ? " passe" : ""}`} onClick={() => setEcrit(j)} aria-label={`${court(j, { weekday: "long" })} : rien de prévu, écrire un repas`}>
                <span className={j === today ? "auj" : ""}>{nom}</span><b className="libre">{b.soir === 0 ? "Personne le soir" : "Libre"}</b>
              </button>
            );
            return (
              <div key={j} className={`jour-bloc${ouvert === j ? " ouvert" : ""}${j < today ? " passe" : ""}`}>
                <button type="button" className="jour-repas" aria-expanded={ouvert === j} onClick={() => setOuvert(ouvert === j ? null : j)}>
                  <span className={j === today ? "auj" : ""}>{nom}</span>
                  <b>{pense === j ? "Echo cherche autre chose…" : r.plat}</b>
                  {r.congele && <Snowflake size={16} strokeWidth={2.2} className="signe" role="img" aria-label="Au congélateur" animated={false} />}
                </button>
                {ouvert === j && (
                  <div className="jour-detail">
                    <p>{soirDe(b)}</p>
                    {r.gamelle && <p>{b.gamelle === proprio ? "Ta gamelle" : b.gamelle ? `Gamelle de ${noms[b.gamelle]}` : "Gamelle"} : {r.gamelle}</p>}
                    {r.congele && <p>Vient du congélateur : à sortir la veille.</p>}
                    {r.duStock && r.duStock.length > 0 && <p className="du-stock">Avec ton stock : {r.duStock.join(", ").toLowerCase()}</p>}
                    {r.ingredients && r.ingredients.length > 0 && <p className="ingredients">{r.ingredients.map((i) => (i.qte ? `${i.nom} (${i.qte})` : i.nom)).join(", ")}</p>}
                    {!r.propose && j <= today && (
                      <div className="avis" role="group" aria-label={`Ton avis sur ${r.plat}`}>
                        <span>C'était bon ?</span>
                        <button type="button" className="rond-champ" aria-label="Oui, à refaire" aria-pressed={avisDe(r) === 1} onClick={() => { vibrer(); noterRepas(r, 1); }}><ThumbsUp size={18} strokeWidth={2.2} animated={false} /></button>
                        <button type="button" className="rond-champ" aria-label="Non, ne plus proposer" aria-pressed={avisDe(r) === -1} onClick={() => { vibrer(); noterRepas(r, -1); }}><ThumbsDown size={18} strokeWidth={2.2} animated={false} /></button>
                      </div>
                    )}
                    <div className="rangee">
                      {j >= today && (b.soir > 0 || b.gamelle) && <button type="button" className="puce" disabled={!!pense} onClick={() => avecEcho(j, () => changerRepas(b, r, noms, jours))}>Changer</button>}
                      <button type="button" className="puce" onClick={() => { setOuvert(null); setEcrit(j); }}>Écrire</button>
                      <button type="button" className="puce" onClick={() => { setOuvert(null); poserRepas(j, ""); }}>Retirer</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}

      {!pense && !proposes.length && (aCuisiner >= 2 || !!batch?.fini) && (
        <button type="button" className="g ligne-lien" onClick={() => onBatch(debut)}>
          <span className="tuile-icone" aria-hidden="true"><CookingPot size={18} strokeWidth={1.8} animated={false} /></span>
          <span><b>Batch du dimanche</b><span>{etatBatch}</span></span>
          <ChevronRight size={18} strokeWidth={2.2} className="signe" animated={false} />
        </button>
      )}
    </>
  );
}
