import { useState } from "react";
import { toast } from "sonner";
import type { Noms, Personne, Tache } from "../lib/types";
import { effacerExemples, remettreExemples, toutEffacer } from "../data/actions";
import { choisirProprio, enregistrerNoms, marquerGuide } from "../data/hooks";
import { MODULES, basculerModule } from "../modules/registre";
import { exporter, importer } from "../data/sauvegarde";

export function Reglages({ taches, noms, masques, proprio, onGuide }: { taches: Tache[]; noms: Noms; masques: string[]; proprio: Personne; onGuide: () => void }) {
  const [sur, setSur] = useState(false);
  const nb = taches.length;
  const changer = (cle: keyof Noms, valeur: string, defaut: string) => {
    enregistrerNoms({ ...noms, [cle]: valeur.trim() || defaut });
    toast("Prénom enregistré");
  };
  return (
    <>
      <section className="g reglages">
        <div className="champ"><label htmlFor="r-moi">Son prénom à lui</label>
          <input className="saisie" id="r-moi" maxLength={24} defaultValue={noms.moi} onBlur={(e) => e.target.value.trim() !== noms.moi && changer("moi", e.target.value, "Melo")} /></div>
        <div className="champ"><label htmlFor="r-elle">Son prénom à elle</label>
          <input className="saisie" id="r-elle" maxLength={24} defaultValue={noms.elle} onBlur={(e) => e.target.value.trim() !== noms.elle && changer("elle", e.target.value, "Sarah")} /></div>
        <div className="champ"><span className="lab">Ce téléphone est celui de</span>
          <div className="puces">
            {(["moi", "elle"] as Personne[]).map((p) => (
              <button key={p} type="button" className={`puce${p === "elle" ? " p-elle" : ""}`} aria-pressed={proprio === p}
                onClick={() => { if (p !== proprio) { choisirProprio(p); toast(`C'est maintenant le téléphone de ${noms[p]}`); } }}>{noms[p]}</button>
            ))}
          </div></div>
        <div className="rangee"><button className="bouton second" onClick={() => { marquerGuide(false); onGuide(); }}>Revoir le guide</button></div>
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
        <p>{nb} tâche{nb > 1 ? "s" : ""} enregistrée{nb > 1 ? "s" : ""} sur cet appareil. Rien n'est envoyé ailleurs pour l'instant. Le partage entre vous deux arrivera avec la synchro. En attendant, fais une sauvegarde de temps en temps.</p>
        <div className="rangee">
          <button className="bouton" onClick={() => exporter()}>Faire une sauvegarde</button>
          <label className="bouton second">Récupérer une sauvegarde
            <input type="file" accept="application/json,.json" className="vh" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importer(f); }} /></label>
        </div>
        <p className="aide-champ">La sauvegarde est un fichier. Sur iPhone, choisis « Enregistrer dans Fichiers » pour la garder.</p>
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
