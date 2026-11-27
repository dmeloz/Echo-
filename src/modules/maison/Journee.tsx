import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, House } from "pulsoicon-react";
import { db } from "../../data/db";
import { auJour } from "../../lib/dates";
import type { ContexteModule } from "../contrat";
import { aFaire, minutesDe, pourMoi } from "./donnees";

// La ligne de la journée : « Maison · 2 corvées à faire, 20 min » (les libres et les miennes). Elle ouvre Maison. Rien à faire : rien ne s'affiche.
export function JourneeMaison({ proprio, now, aller, jour }: ContexteModule) {
  const d = useLiveQuery(async () => ({ corvees: await db.maison_corvees.toArray() }), [], undefined);
  // Les corvées n'ont pas de date fixe : la ligne ne vaut que pour aujourd'hui.
  if (!d?.corvees.length || (jour && jour !== auJour(0, now))) return null;
  const miennes = d.corvees.filter((c) => aFaire(c, now) && pourMoi(c, proprio));
  if (!miennes.length) return null;
  const min = miennes.reduce((n, c) => n + minutesDe(c.taille), 0);
  const quoi = miennes.length === 1 ? miennes[0].nom : `${miennes.length} corvées à faire`;
  return (
    <a className="ligne-journee" href="#maison" onClick={(ev) => { ev.preventDefault(); aller("maison"); }}>
      <span className="tuile-icone" aria-hidden="true"><House size={16} strokeWidth={1.8} animated={false} /></span>
      <span><b>Maison</b> · {quoi}, {`${min}\u00a0min`}</span>
      <ChevronRight size={16} strokeWidth={2.2} animated={false} aria-hidden="true" />
    </a>
  );
}
