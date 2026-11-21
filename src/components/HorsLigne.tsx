import { WifiOff } from "pulsoicon-react";
import { useSyncExternalStore } from "react";

const abonner = (f: () => void) => { addEventListener("online", f); addEventListener("offline", f); return () => { removeEventListener("online", f); removeEventListener("offline", f); }; };

// Hors ligne, tout continue de marcher : on le dit calmement, sans alarme.
export function HorsLigne() {
  const enLigne = useSyncExternalStore(abonner, () => navigator.onLine, () => true);
  if (enLigne) return null;
  return (
    <p className="hors-ligne" role="status"><WifiOff size={15} strokeWidth={1.5} animated={false} /> Pas de réseau. Tout marche quand même : c'est gardé sur ce téléphone.</p>
  );
}
