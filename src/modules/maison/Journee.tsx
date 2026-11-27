import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, House } from "pulsoicon-react";
import { db } from "../../data/db";
import type { ContexteModule } from "../contrat";
import { aFaire, equilibre, minutesDe, pour } from "./donnees";

// La ligne de la journée : « Maison · 2 corvées pour toi, 20 min ». Elle ouvre Maison. Rien pour toi : rien ne s'affiche.
export function JourneeMaison({ proprio, now, aller }: ContexteModule) {
  const d = useLiveQuery(async () => ({ corvees: await db.maison_corvees.toArray(), faits: await db.maison_faits.toArray() }), [], undefined);
  if (!d?.corvees.length) return null;
  const e = equilibre(d.faits, now.getTime());
  const miennes = d.corvees.filter((c) => aFaire(c, now) && pour(c, e) === proprio);
  if (!miennes.length) return null;
  const min = miennes.reduce((n, c) => n + minutesDe(c.taille), 0);
  const quoi = miennes.length === 1 ? miennes[0].nom : `${miennes.length} corvées pour toi`;
  return (
    <a className="ligne-journee" href="#maison" onClick={(ev) => { ev.preventDefault(); aller("maison"); }}>
      <span className="tuile-icone" aria-hidden="true"><House size={16} strokeWidth={1.8} animated={false} /></span>
      <span><b>Maison</b> · {quoi}, {`${min}\u00a0min`}</span>
      <ChevronRight size={16} strokeWidth={2.2} animated={false} aria-hidden="true" />
    </a>
  );
}
