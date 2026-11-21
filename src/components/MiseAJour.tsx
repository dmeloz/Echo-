import { useEffect } from "react";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";

// Quand une nouvelle version d'Echo est en ligne, on le dit, et un toucher la charge.
export function MiseAJour() {
  const { needRefresh: [aMettreAJour], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      // On regarde s'il y a du nouveau au retour sur l'app, et toutes les heures.
      const verifier = () => { if (!document.hidden && navigator.onLine) reg.update().catch(() => {}); };
      document.addEventListener("visibilitychange", verifier);
      setInterval(verifier, 60 * 60 * 1000);
    },
  });

  useEffect(() => {
    if (!aMettreAJour) return;
    toast("Nouvelle version d'Echo", {
      id: "mise-a-jour",
      duration: Infinity,
      action: { label: "Mettre à jour", onClick: () => updateServiceWorker(true) },
    });
  }, [aMettreAJour, updateServiceWorker]);

  return null;
}
