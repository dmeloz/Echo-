import { Download } from "pulsoicon-react";
import { useEffect } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { installer, majEtat, useMiseAJour } from "../data/miseAJour";

// Le bandeau en haut de l'écran : « Nouvelle version d'Echo » avec le bouton Mettre à jour.
export function MiseAJour() {
  const { needRefresh: [aMettreAJour], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      majEtat({ reg });
      // On regarde s'il y a du nouveau au retour sur l'app, et toutes les heures.
      const verifier = () => { if (!document.hidden && navigator.onLine) reg.update().catch(() => {}); };
      document.addEventListener("visibilitychange", verifier);
      setInterval(verifier, 60 * 60 * 1000);
    },
  });
  useEffect(() => { majEtat({ disponible: aMettreAJour, installer: () => updateServiceWorker(true) }); }, [aMettreAJour, updateServiceWorker]);

  const { disponible, enCours } = useMiseAJour();
  if (!disponible) return null;
  return (
    <div className="bandeau-maj" role="status">
      <span className="bm-icone" aria-hidden="true"><Download size={18} strokeWidth={2.4} autoAnimated={false} play /></span>
      <span className="bm-texte"><b>Nouvelle version d'Echo</b><small>Tes tâches ne bougent pas.</small></span>
      <button className="bouton petit" onClick={() => installer()} disabled={enCours}>{enCours ? "Un instant…" : "Mettre à jour"}</button>
    </div>
  );
}
