import { Sparkles, X } from "pulsoicon-react";
import { useState } from "react";
import { toast } from "sonner";
import { changerVacances } from "../../data/actions";
import { useHoraires } from "../../data/hooks";
import { heuresDe } from "../../lib/horaires";
import { anneeVacances, compte, joursVacances, lundiDe, proposer, semainesDe, type Proposition } from "../../lib/vacances";
import { reglesDe } from "../../lib/fixes";
import type { Noms, Personne } from "../../lib/types";

const dateCourte = (jour: string) => new Date(jour + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
const virgule = (n: number) => String(n).replace(".", ",");

// Mes horaires, pour quelqu'un aux horaires fixes : une ligne, rien à remplir.
export function HorairesFixes() {
  return (
    <section className="g horaires-fixes" aria-label="Mes horaires">
      <b>Lu – Ve · {heuresDe("FIX")}</b>
      <span>Repos le week-end et les jours fériés. Echo s'en occupe, rien à remplir.</span>
    </section>
  );
}

// Les vacances de l'année pour vous deux : le compteur, les semaines posées, et Echo qui propose le reste.
export function CarteVacances({ noms, now }: { noms: Noms; now: Date }) {
  const annee = anneeVacances(now);
  const horaires = useHoraires();
  const [date, setDate] = useState("");
  const [qui, setQui] = useState<Personne[]>(["moi", "elle"]);
  const [idee, setIdee] = useState<Proposition[] | null>(null);
  const gens = (["elle", "moi"] as Personne[]).filter((p) => reglesDe(noms[p]));
  if (!gens.length) return null;

  const semaines = new Map(gens.map((p) => [p, semainesDe(horaires, p, annee)]));
  const lundis = [...new Set(gens.flatMap((p) => [...semaines.get(p)!.keys()]))].sort();
  const reste = gens.some((p) => compte(semaines.get(p)!) < reglesDe(noms[p])!.vacances);
  const nomsDe = (q: Personne[]) => (q.length === gens.length && q.length > 1 ? "vous deux" : q.map((p) => noms[p]).join(", "));
  const jours = (l: string, q: Personne[]) => q.flatMap((p) => joursVacances(l, noms, p).map((j) => [p, j] as [Personne, string]));

  const ajouter = () => {
    if (!date || !qui.length) return;
    const l = lundiDe(date);
    changerVacances(jours(l, qui), true, `Semaine du ${dateCourte(l)} : vacances pour ${nomsDe(qui)}`).catch(() => toast("Pas enregistré. Réessaie."));
    setDate(""); setIdee(null);
  };
  const retirer = (l: string, q: Personne[]) => { changerVacances(jours(l, q), false, `Semaine du ${dateCourte(l)} retirée`); setIdee(null); };
  const garder = () => {
    if (!idee) return;
    changerVacances(idee.flatMap((p) => jours(p.lundi, p.qui)), true, `${idee.length} semaine${idee.length > 1 ? "s" : ""} posée${idee.length > 1 ? "s" : ""}`);
    setIdee(null);
  };
  const basculer = (p: Personne) => setQui((q) => (q.includes(p) ? q.filter((x) => x !== p) : [...q, p]));

  return (
    <section className="g vacances" aria-labelledby="lab-vac">
      <div className="vac-tete">
        <h2 id="lab-vac">Vacances {annee}</h2>
        <p className="vac-compte">
          {gens.map((p) => <span key={p} className={p}>{noms[p]} <b>{virgule(compte(semaines.get(p)!))}</b> / {reglesDe(noms[p])!.vacances} sem</span>)}
        </p>
      </div>

      {lundis.length > 0 && (
        <ul className="vac-liste">
          {lundis.map((l) => {
            const q = gens.filter((p) => semaines.get(p)!.has(l));
            return (
              <li key={l}>
                <span><b>Semaine du {dateCourte(l)}</b><small>{nomsDe(q)}</small></span>
                <button type="button" className="rond-petit" aria-label={`Retirer la semaine du ${dateCourte(l)}`} onClick={() => retirer(l, q)}><X size={18} strokeWidth={2} /></button>
              </li>
            );
          })}
        </ul>
      )}

      {idee ? (
        <div className="vac-idee">
          <p><Sparkles size={15} strokeWidth={1.8} animated={false} aria-hidden="true" /> Je propose :</p>
          <ul className="vac-liste propose">
            {idee.map((p) => <li key={p.lundi}><span><b>Semaine du {dateCourte(p.lundi)}</b><small>{nomsDe(p.qui)}</small></span></li>)}
          </ul>
          <div className="rangee">
            <button type="button" className="bouton petit" onClick={garder}>Garder</button>
            <button type="button" className="bouton-texte" onClick={() => setIdee(null)}>Non merci</button>
          </div>
          <p className="aide-champ">Pour en déplacer une, garde puis retire-la et ajoute la bonne semaine.</p>
        </div>
      ) : (
        <>
          <div className="vac-ajout">
            <input type="date" value={date} min={`${annee}-01-01`} max={`${annee}-12-31`} aria-label="Un jour de la semaine" onChange={(e) => setDate(e.target.value)} />
            <div className="vac-qui" role="group" aria-label="Pour qui">
              {gens.map((p) => <button key={p} type="button" className={p} aria-pressed={qui.includes(p)} onClick={() => basculer(p)}>{noms[p]}</button>)}
            </div>
            <button type="button" className="bouton petit" disabled={!date || !qui.length} onClick={ajouter}>Ajouter la semaine</button>
          </div>
          {reste && (
            <button type="button" className="bouton-texte vac-echo" onClick={() => { const p = proposer(horaires, noms, annee); if (p.length) setIdee(p); else toast("Plus aucune semaine libre à proposer."); }}>
              <Sparkles size={15} strokeWidth={1.8} aria-hidden="true" /> Echo propose le reste
            </button>
          )}
        </>
      )}
    </section>
  );
}
