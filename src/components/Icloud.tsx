import { useState } from "react";
import { toast } from "sonner";
import { poserReglage, useReglage } from "../data/hooks";
import { brancherIcloud, synchroniserIcloud, type Calendrier } from "../sync/icloud";

// Réglages · le calendrier iCloud : un interrupteur, le calendrier où vont les événements d'Echo, et c'est tout.
export function SectionIcloud({ relie }: { relie: boolean }) {
  const actif = useReglage("icloud", false);
  const cals = useReglage<Calendrier[]>("icloudCals", []);
  const cal = useReglage<string>("icloudCal", "");
  const lu = useReglage<number>("icloudLu", 0);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState("");

  const faire = async (fn: () => Promise<unknown>) => {
    setOccupe(true); setErreur("");
    try { await fn(); } catch (e) { setErreur(e instanceof Error ? e.message : "Ça n'a pas marché."); } finally { setOccupe(false); }
  };
  const basculer = () => faire(async () => {
    const liste = await brancherIcloud(!actif);
    if (!actif && liste.length && !liste.some((c) => c.href === cal)) await poserReglage("icloudCal", liste[0].href);
    if (!actif) toast("Calendrier iCloud branché");
  });
  const heure = lu ? new Date(lu).toLocaleString("fr-FR", { weekday: "long", hour: "numeric", minute: "2-digit" }) : "";

  return (
    <section className="g reglages">
      <span className="lab">Calendrier iCloud</span>
      <label className="module-ligne">
        <span><b>Relier à iCloud</b><small>Tes événements iCloud arrivent dans l'Agenda, et ceux que tu crées dans Echo partent dans iCloud.</small></span>
        <input type="checkbox" role="switch" className="interrupteur" checked={actif} disabled={occupe || !relie} onChange={basculer} />
      </label>
      {!relie && <p className="aide-champ">Relie d'abord ce téléphone au foyer, dans Réglages → Foyer.</p>}
      {occupe && <p className="aide-champ" aria-live="polite">Je parle à iCloud…</p>}
      {erreur && <p className="bv-erreur" role="alert">{erreur}</p>}
      {actif && cals.length > 0 && (
        <div className="champ">
          <label htmlFor="ic-cal">Les événements d'Echo vont dans</label>
          <select id="ic-cal" value={cal} onChange={(e) => poserReglage("icloudCal", e.target.value)}>
            {cals.map((c) => <option key={c.href} value={c.href}>{c.nom}</option>)}
          </select>
        </div>
      )}
      {actif && (
        <div className="rangee">
          <button className="bouton second" disabled={occupe} onClick={() => faire(async () => { await synchroniserIcloud(); toast("Agenda à jour"); })}>Mettre à jour maintenant</button>
          {heure && <span className="aide-champ">Dernière fois : {heure}</span>}
        </div>
      )}
    </section>
  );
}
