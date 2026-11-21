import { Check } from "pulsoicon-react";
import { LigneTache } from "../components/LigneTache";
import { auJour, heureFr, minutes } from "../lib/dates";
import { niveau } from "../lib/importance";
import type { Noms, Tache } from "../lib/types";
import { changerNiveau, cocher, effacerExemples } from "../data/actions";
import { nomDe } from "../data/hooks";
import type { Module } from "../modules/contrat";
import { tachesDuJour } from "../lib/journee";

interface Props { taches: Tache[]; noms: Noms; now: Date; modules: Module[]; onOuvrir: (t: Tache) => void; onAller: (id: string) => void }

// Accueil équilibré : une phrase, la tâche à faire en premier, la suite de la journée, puis ce qui arrive.
export function Aujourdhui({ taches, noms, now, modules, onOuvrir, onAller }: Props) {
  const today = auJour(0, now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const { ouvertes, faites } = tachesDuJour(taches, now);
  const tri = (a: Tache, b: Tache) => (niveau(b, now) - niveau(a, now)) || ((a.heure ? minutes(a.heure) : 9999) - (b.heure ? minutes(b.heure) : 9999)) || a.jour.localeCompare(b.jour) || a.cree - b.cree;
  const liste = [...ouvertes].sort(tri);
  const prochaine = ouvertes.filter((t) => t.heure && t.jour === today && minutes(t.heure) >= nowMin - 15).sort((a, b) => minutes(a.heure) - minutes(b.heure))[0];
  const total = ouvertes.length + faites.length;
  const pct = total ? Math.round((faites.length / total) * 100) : 0;

  let phrase: string;
  if (!ouvertes.length) phrase = faites.length ? "Tout est fait. Belle journée !" : "Rien de prévu. Ajoute une tâche en bas.";
  else phrase = `${ouvertes.length} chose${ouvertes.length > 1 ? "s" : ""} à faire${prochaine ? `, la prochaine à ${heureFr(prochaine.heure)}` : ""}.`;

  const premiere = liste[0];
  const reste = liste.slice(1);
  const ligne = (t: Tache) => <LigneTache key={t.id} t={t} n={niveau(t, now)} noms={noms} onCocher={cocher} onOuvrir={onOuvrir} onNiveau={changerNiveau} />;

  return (
    <>
      <p className="phrase">{phrase}</p>
      {taches.some((t) => t.ex) && (
        <div className="exemples">
          <span>Exemples pour essayer. Glisse une tâche vers la droite pour la monter, vers la gauche pour la descendre.</span>
          <button className="bouton-texte" onClick={() => effacerExemples()}>Effacer</button>
        </div>
      )}

      {premiere ? (
        <section className={`g focus${niveau(premiere, now) === 2 ? " imp" : ""}`} aria-labelledby="lab-focus">
          <span className="lab" id="lab-focus">En premier</span>
          <button className="focus-titre" onClick={() => onOuvrir(premiere)}>{premiere.titre}</button>
          <div className="focus-pied">
            <span>{[premiere.heure && heureFr(premiere.heure), premiere.jour < today && "en retard", premiere.qui === "nous" ? "à faire à deux" : `pour ${nomDe(noms, premiere.qui)}`].filter(Boolean).join(" · ")}</span>
            <button className="bouton petit" onClick={() => cocher(premiere)}><Check size={16} strokeWidth={2.6} /> C'est fait</button>
          </div>
        </section>
      ) : (
        <section className="g focus"><span className="lab">Aujourd'hui</span><p className="focus-titre">{faites.length ? "Tout est fait. Belle journée !" : "Rien de prévu pour l'instant."}</p></section>
      )}

      {(reste.length > 0 || faites.length > 0) && (
        <section className="g journee" aria-labelledby="lab-journee">
          <div className="taches-tete"><span className="lab" id="lab-journee">Ensuite</span><span className="compte">{faites.length} / {total} faites</span></div>
          <div className="barre" aria-hidden="true"><i style={{ width: pct + "%" }} /></div>
          {reste.length > 0 && <ul className="taches">{reste.map(ligne)}</ul>}
          {faites.length > 0 && (
            <details className="faites">
              <summary>{faites.length} fait{faites.length > 1 ? "s" : ""} aujourd'hui</summary>
              <ul className="taches">{faites.map(ligne)}</ul>
            </details>
          )}
        </section>
      )}

      {/* Les modules : chacun pose sa tuile ici (ou une tuile simple tant qu'il n'est pas construit). */}
      {modules.length > 0 && (
        <>
          <div className="bientot-tete"><span className="lab">{modules.every((m) => m.etat === "bientot") ? "Bientôt dans l'app" : "Tes modules"}</span></div>
          <div className="trois">
            {modules.map((m) => m.Tuile ? <m.Tuile key={m.id} noms={noms} now={now} aller={onAller} /> : (
              <a key={m.id} className="tuile-bientot" href={"#" + m.id} onClick={(e) => { e.preventDefault(); onAller(m.id); }}>
                <b>{m.libelle}</b><span>{m.resume}</span>
              </a>
            ))}
          </div>
        </>
      )}
    </>
  );
}
