import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft } from "pulsoicon-react";
import { useEffect, useMemo, useState } from "react";
import { db } from "../../data/db";
import { useHoraires } from "../../data/hooks";
import { libelleJour } from "../../lib/dates";
import { vibrer } from "../../lib/gestes";
import { autre, type Personne } from "../../lib/types";
import type { ContexteModule } from "../contrat";
import { poserRepartition } from "./actions";
import { type Corvee } from "./donnees";
import { heuresDites, minutesDeChacun, repartir } from "./repartition";

// « Répartir la semaine » : l'app propose qui prend quoi d'après les horaires et ce que chacun a déjà fait.
// On change une ligne d'un toucher sur le prénom, puis on valide. Rien n'est écrit avant « Valider ».
export function Repartir({ corvees, noms, proprio, now, onQuitter }: Pick<ContexteModule, "noms" | "proprio" | "now"> & { corvees: Corvee[]; onQuitter: () => void }) {
  const horaires = useHoraires();
  const faits = useLiveQuery(() => db.maison_faits.toArray(), [], undefined);
  const prop = useMemo(() => (faits ? repartir(corvees, horaires, faits, now) : null), [corvees, horaires, faits, now]);
  const [changes, setChanges] = useState<Record<string, Personne>>({});
  const [envoi, setEnvoi] = useState(false);
  useEffect(() => {
    addEventListener("echo-retour", onQuitter);
    return () => removeEventListener("echo-retour", onQuitter);
  }, [onQuitter]);
  useEffect(() => { document.querySelector(".defile")?.scrollTo(0, 0); }, []);
  if (!prop) return null;

  const l_autre = autre(proprio);
  const parts = prop.parts.map((p) => ({ ...p, qui: changes[p.corvee.id] ?? p.qui }));
  const m = minutesDeChacun(parts);
  const prenom = (p: Personne) => (p === proprio ? "Toi" : noms[p]);
  const aRepartir = parts.filter((p) => !p.fixe);
  const valider = async () => {
    if (envoi) return; // un double toucher n'écrit pas deux fois (l'Annuler resterait sur la mauvaise version)
    setEnvoi(true);
    vibrer(12);
    try { await poserRepartition(aRepartir.map((p) => ({ id: p.corvee.id, qui: p.qui })), prop.jusqu); onQuitter(); } finally { setEnvoi(false); }
  };
  const sansHoraires = !prop.travail.moi && !prop.travail.elle;

  return (
    <>
      <div className="partie-tete">
        <button type="button" className="retour" onClick={onQuitter}><ChevronLeft size={20} strokeWidth={2.2} />Corvées</button>
        <h2 className="reglage-titre">Répartir la semaine</h2>
      </div>
      {!parts.length ? (
        <section className="g vide"><p>Rien ne tombe d'ici {libelleJour(prop.jusqu, now).toLowerCase()}.</p></section>
      ) : (
        <>
          <p className="phrase">
            {sansHoraires ? "Sans horaires posés, l'app partage selon ce que chacun a déjà fait." : `Au travail cette semaine : ${[proprio, l_autre].map((q) => `${noms[q]} ${prop.travail[q] ? heuresDites(prop.travail[q]) : "pas d'horaires posés"}`).join(", ")}.`}
            {" "}Touche un prénom pour changer.
          </p>
          <section className="g liste-stock corvees repartir">
            <ul>
              {parts.map((p) => (
                <li key={p.corvee.id}>
                  <div className="stock-ligne repartir-ligne">
                    <b>{p.corvee.nom}<small>{p.fois > 1 ? `${p.fois} fois, ` : ""}{p.min} min{p.fixe ? " · toujours à cette personne" : ""}</small></b>
                    <button type="button" className={`puce${p.qui === "elle" ? " p-elle" : ""}`} aria-pressed="true" disabled={p.fixe} aria-label={`${p.corvee.nom} : ${prenom(p.qui)}. Toucher pour donner à ${prenom(autre(p.qui))}`}
                      onClick={() => { vibrer(4); setChanges((c) => ({ ...c, [p.corvee.id]: autre(p.qui) })); }}>{prenom(p.qui)}</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <p className="aide-champ">Pour la semaine : {noms[proprio]} {m[proprio]} min, {noms[l_autre]} {m[l_autre]} min. Jusqu'à {libelleJour(prop.jusqu, now).toLowerCase()}, puis tout redevient libre.</p>
          <div className="rangee gouts-pied">
            <button type="button" className="bouton-texte" onClick={onQuitter}>Plus tard</button>
            {aRepartir.length > 0 && <button type="button" className="bouton" disabled={envoi} onClick={valider}>Valider</button>}
          </div>
        </>
      )}
    </>
  );
}
