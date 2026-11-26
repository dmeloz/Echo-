import { CalendarClock, CalendarDays, Sun } from "pulsoicon-react";
import { useState } from "react";
import { CartePremier } from "../components/CartePremier";
import { LigneTache } from "../components/LigneTache";
import { auJour, heureFr, minutes } from "../lib/dates";
import { DUREE_RESPIRE, vibrer } from "../lib/gestes";
import { niveau } from "../lib/importance";
import { autre, type Noms, type Personne, type Tache } from "../lib/types";
import { changerNiveau, cocher, effacerExemples, ranger } from "../data/actions";
import { triJour } from "../lib/ordre";
import { plusJours } from "../lib/dates";
import { poserReglage, useAvecPhoto, useHoraires, useReglage } from "../data/hooks";
import { ligneAccueil } from "../lib/horaires";
import type { Module } from "../modules/contrat";
import { tachesDuJour } from "../lib/journee";

interface Props { taches: Tache[]; noms: Noms; proprio: Personne; now: Date; modules: Module[]; onOuvrir: (t: Tache) => void; onAller: (id: string) => void }

const VISIBLES = 3; // « Ensuite » : trois lignes au plus, le reste se déplie.

// Accueil : une phrase, UNE chose mise en avant (en premier), la suite en calme, demain, puis les modules.
type Filtre = "tout" | "moi" | "autre";

export function Aujourdhui({ taches, noms, proprio, now, modules, onOuvrir, onAller }: Props) {
  const today = auJour(0, now);
  const demain = auJour(1, now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const { ouvertes, faites } = tachesDuJour(taches, now);
  const tri = triJour(now);
  const liste = [...ouvertes].sort(tri);
  const pourDemain = taches.filter((t) => !t.fait && t.jour === demain).sort(tri);
  // Cette semaine : après demain, jusqu'à dans six jours (tâches et rendez-vous), dans l'ordre des jours.
  const finSemaine = plusJours(today, 6);
  const cetteSemaine = taches.filter((t) => !t.fait && t.jour > demain && t.jour <= finSemaine)
    .sort((a, b) => a.jour.localeCompare(b.jour) || (a.heure ? minutes(a.heure) : 9999) - (b.heure ? minutes(b.heure) : 9999) || a.cree - b.cree);
  const nomJour = (j: string) => new Date(j + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long" });
  const prochaine = ouvertes.filter((t) => t.heure && t.jour === today && minutes(t.heure) >= nowMin - 15).sort((a, b) => minutes(a.heure) - minutes(b.heure))[0];
  const total = ouvertes.length + faites.length;
  const pct = total ? Math.round((faites.length / total) * 100) : 0;
  const [toutVoir, setToutVoir] = useState(false);
  // Le prochain événement du jour, dit dans la phrase (les événements n'ont pas de case à cocher).
  const evenement = taches.filter((t) => t.evt && t.jour === today && t.heure && minutes(t.fin || t.heure) >= nowMin).sort((a, b) => minutes(a.heure) - minutes(b.heure))[0];
  const [respire, setRespire] = useState<string | null>(null);

  let phrase: string;
  if (!ouvertes.length) phrase = faites.length ? `Tu as fait ${faites.length} chose${faites.length > 1 ? "s" : ""} aujourd'hui.` : "Rien de prévu, rien ne presse.";
  else phrase = `${ouvertes.length} chose${ouvertes.length > 1 ? "s" : ""} à faire${prochaine ? `, la prochaine à ${heureFr(prochaine.heure)}` : ""}.`;

  if (evenement) phrase += ` ${evenement.titre} à ${heureFr(evenement.heure)}.`;
  const premiere = liste[0];
  // « Ensuite » peut montrer tout, seulement ce qui est pour soi, ou ce qui est pour l'autre (gardé sur le téléphone).
  const filtre = useReglage<Filtre>("filtreQui", "tout");
  const lautre = autre(proprio);
  const garde = (t: Tache) => filtre === "tout" || t.qui === "nous" || t.qui === (filtre === "moi" ? proprio : lautre);
  const resteTout = liste.slice(1);
  const reste = resteTout.filter(garde);
  const montres = toutVoir ? reste : reste.slice(0, VISIBLES);
  const avecPhoto = useAvecPhoto();
  // Une seule petite ligne pour le travail du jour ; elle disparaît une fois le travail fini.
  const codeDuJour = useHoraires().find((h) => h.qui === proprio && h.jour === today)?.code;
  const travail = ligneAccueil(codeDuJour, nowMin);
  // Poser une ligne ailleurs : devant une voisine, tout en haut (elle passe « En premier ») ou après la dernière ligne montrée.
  const poserLigne = (t: Tache, avantId: string | null) => {
    const apresDerniere = () => { const sans = liste.filter((x) => x.id !== t.id); const d = montres.filter((x) => x.id !== t.id).at(-1); return d ? sans[sans.indexOf(d) + 1]?.id ?? null : null; };
    ranger(liste, t.id, avantId === "haut" ? premiere.id : avantId ?? apresDerniere(), now);
  };
  const ligne = (t: Tache) => <LigneTache key={t.id} t={t} n={niveau(t, now)} noms={noms} onCocher={cocher} onOuvrir={onOuvrir} onNiveau={changerNiveau} aPhoto={avecPhoto.has(t.id)} onRanger={t.fait ? undefined : poserLigne} />;
  // Ce que l'autre a coché aujourd'hui, dit en une phrase.
  const parLautre = faites.filter((t) => t.faitPar === lautre).sort((a, b) => (b.fait ?? 0) - (a.fait ?? 0));

  // « Elle respire » puis part : la carte grossit à peine, un trait se trace, puis la tâche est cochée.
  const faitPremiere = (t: Tache) => {
    if (respire) return;
    vibrer(10);
    setRespire(t.id);
    setTimeout(() => { cocher(t); setRespire(null); }, DUREE_RESPIRE);
  };

  return (
    <>
      <p className="phrase">{phrase}</p>
      {parLautre.length > 0 && (
        <p className="autre-fait">{noms[lautre]} a fait « {parLautre[0].titre} »{parLautre.length > 1 ? ` et ${parLautre.length - 1} autre${parLautre.length > 2 ? "s" : ""} chose${parLautre.length > 2 ? "s" : ""}` : ""}.</p>
      )}
      {travail && codeDuJour && <p className={`travail-accueil code-${codeDuJour.toLowerCase()}`}>{travail}</p>}
      {taches.some((t) => t.ex) && (
        <div className="exemples">
          <span>Exemples pour essayer. Glisse une tâche vers la droite pour la monter, vers la gauche pour la descendre.</span>
          <button className="bouton-texte" onClick={() => effacerExemples()}>Effacer</button>
        </div>
      )}

      {premiere ? (
        <CartePremier key={premiere.id} t={premiere} noms={noms} proprio={proprio} now={now} respire={respire === premiere.id} onFait={faitPremiere} onOuvrir={onOuvrir} />
      ) : faites.length ? (
        <section className="g vide fini" aria-live="polite">
          <svg className="sceau" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20" pathLength={1} /><path d="M15 24.5l6 6 12-13" pathLength={1} /></svg>
          <h2>Tout est fait</h2>
          <p>{pourDemain.length ? "La journée est libre. Demain est juste en dessous." : "La journée est libre. Rien ne presse pour demain non plus."}</p>
        </section>
      ) : (
        <section className="g vide">
          <span className="vide-icone" aria-hidden="true"><Sun size={26} strokeWidth={1.5} /></span>
          <h2>Rien de prévu, rien ne presse</h2>
          <p>Écris une chose en bas, par exemple « courses samedi 10 h ».</p>
        </section>
      )}

      {(resteTout.length > 0 || faites.length > 0) && (
        <section className="g journee" aria-labelledby="lab-journee">
          <div className="taches-tete"><span className="lab" id="lab-journee">Ensuite</span><span className="compte">{faites.length} sur {total} faites</span></div>
          <div className="barre" aria-hidden="true"><i style={{ width: pct + "%" }} /></div>
          {resteTout.length > 0 && (
            <div className="puces filtre-qui" role="group" aria-label="Montrer les tâches de">
              {([["tout", "Tout"], ["moi", "Moi"], ["autre", noms[lautre]]] as Array<[Filtre, string]>).map(([k, l]) => (
                <button key={k} type="button" className={`puce${k === "autre" && lautre === "elle" ? " p-elle" : ""}`} aria-pressed={filtre === k} onClick={() => poserReglage("filtreQui", k)}>{l}</button>
              ))}
            </div>
          )}
          {resteTout.length > 0 && !reste.length && <p className="filtre-vide">{filtre === "moi" ? "Rien d'autre pour toi aujourd'hui." : `Rien d'autre pour ${noms[lautre]} aujourd'hui.`}</p>}
          {montres.length > 0 && <ul className="taches">{montres.map(ligne)}</ul>}
          {reste.length > VISIBLES && (
            <button className="bouton-texte voir-plus" onClick={() => setToutVoir((v) => !v)}>
              {toutVoir ? "Montrer moins" : `Voir les ${reste.length - VISIBLES} autres`}
            </button>
          )}
          {faites.length > 0 && (
            <details className="faites">
              <summary>{faites.length} fait{faites.length > 1 ? "s" : ""} aujourd'hui</summary>
              <ul className="taches">{faites.map(ligne)}</ul>
            </details>
          )}
        </section>
      )}

      {pourDemain.length > 0 && (
        <section className="g demain" aria-labelledby="lab-demain">
          <div className="taches-tete"><span className="lab" id="lab-demain"><CalendarClock size={15} strokeWidth={1.5} animated={false} /> Demain</span><span className="compte">{pourDemain.length}</span></div>
          <ul className="demain-liste">
            {pourDemain.slice(0, 3).map((t) => (
              <li key={t.id}><button onClick={() => onOuvrir(t)}><span>{t.titre}</span>{t.heure && <small>{heureFr(t.heure)}</small>}</button></li>
            ))}
          </ul>
          {pourDemain.length > 3 && <p className="demain-plus">et {pourDemain.length - 3} autre{pourDemain.length - 3 > 1 ? "s" : ""}</p>}
        </section>
      )}

      {cetteSemaine.length > 0 && (
        <section className="g demain" aria-labelledby="lab-semaine">
          <div className="taches-tete"><span className="lab" id="lab-semaine"><CalendarDays size={15} strokeWidth={1.5} animated={false} /> Cette semaine</span><span className="compte">{cetteSemaine.length}</span></div>
          <ul className="demain-liste">
            {cetteSemaine.slice(0, 3).map((t) => (
              <li key={t.id}><button onClick={() => onOuvrir(t)}><span>{t.titre}</span><small>{nomJour(t.jour)}{t.heure ? ` · ${heureFr(t.heure)}` : ""}</small></button></li>
            ))}
          </ul>
          {cetteSemaine.length > 3 && <p className="demain-plus">et {cetteSemaine.length - 3} autre{cetteSemaine.length - 3 > 1 ? "s" : ""}</p>}
        </section>
      )}

      {/* Les modules : chacun pose sa tuile ici (ou une tuile simple tant qu'il n'est pas construit). Une tuile ouvre la page de son module. */}
      {modules.length > 0 && (
        <>
          <div className="bientot-tete"><span className="lab">{modules.every((m) => m.etat === "bientot") ? "Bientôt dans l'app" : "Tes modules"}</span></div>
          <div className="trois">
            {modules.map((m) => m.Tuile ? <m.Tuile key={m.id} noms={noms} proprio={proprio} now={now} aller={onAller} ouvrir={onOuvrir} /> : (
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
