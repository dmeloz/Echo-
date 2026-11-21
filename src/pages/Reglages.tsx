import { useState } from "react";
import { toast } from "sonner";
import type { Noms, Tache } from "../lib/types";
import { effacerExemples, remettreExemples, toutEffacer } from "../data/actions";
import { enregistrerNoms } from "../data/hooks";
import { MODULES, basculerModule } from "../modules/registre";

export function Reglages({ taches, noms, masques }: { taches: Tache[]; noms: Noms; masques: string[] }) {
  const [sur, setSur] = useState(false);
  const nb = taches.length;
  const changer = (cle: keyof Noms, valeur: string, defaut: string) => {
    enregistrerNoms({ ...noms, [cle]: valeur.trim() || defaut });
    toast("Prénom enregistré");
  };
  return (
    <>
      <section className="g reglages">
        <div className="champ"><label htmlFor="r-moi">Ton prénom</label>
          <input className="saisie" id="r-moi" maxLength={24} defaultValue={noms.moi} onBlur={(e) => e.target.value.trim() !== noms.moi && changer("moi", e.target.value, "Melo")} /></div>
        <div className="champ"><label htmlFor="r-elle">Prénom de ta femme</label>
          <input className="saisie" id="r-elle" maxLength={24} defaultValue={noms.elle} onBlur={(e) => e.target.value.trim() !== noms.elle && changer("elle", e.target.value, "Sarah")} /></div>
      </section>
      <section className="g reglages">
        <span className="lab">Modules</span>
        <p>Chaque partie de l'app est un module. Masque ceux dont vous ne vous servez pas : ils disparaissent du menu et de l'accueil.</p>
        <div className="modules">
          {MODULES.map((m) => {
            const actif = !masques.includes(m.id);
            return (
              <label key={m.id} className="module-ligne">
                <span><b>{m.libelle}</b><small>{m.etat === "bientot" ? "Pas encore construit · " : ""}{m.resume}</small></span>
                <input type="checkbox" role="switch" className="interrupteur" checked={actif} onChange={() => basculerModule(m.id, masques)} />
              </label>
            );
          })}
        </div>
      </section>
      <section className="g reglages">
        <span className="lab">Tes données</span>
        <p>{nb} tâche{nb > 1 ? "s" : ""} enregistrée{nb > 1 ? "s" : ""} sur cet appareil. Rien n'est envoyé ailleurs pour l'instant. Le partage avec {noms.elle} et la sauvegarde arriveront avec la synchro.</p>
        <div className="rangee">
          {taches.some((t) => t.ex)
            ? <button className="bouton second" onClick={() => { effacerExemples(); toast("Exemples effacés"); }}>Effacer les exemples</button>
            : <button className="bouton second" onClick={() => { remettreExemples(); toast("Exemples remis"); }}>Remettre les exemples</button>}
          <button className={`bouton danger${sur ? " sur" : ""}`} onClick={() => {
            if (!sur) { setSur(true); setTimeout(() => setSur(false), 4000); return; }
            toutEffacer(); setSur(false); toast("Tout est effacé");
          }}>{sur ? "Touche encore pour confirmer" : "Tout effacer"}</button>
        </div>
      </section>
      <p className="note-donnees">Icônes : PulsoIcon (licence ISC). Cuisine, Maison et Budget ne sont pas encore construits.</p>
    </>
  );
}
