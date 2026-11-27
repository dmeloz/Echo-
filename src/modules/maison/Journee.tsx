import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, FileText, House } from "pulsoicon-react";
import { db } from "../../data/db";
import { auJour } from "../../lib/dates";
import { poserReglage } from "../../data/hooks";
import type { ContexteModule } from "../contrat";
import { QUOIS, aFaire, minutesDe, papiersDu, pourMoi } from "./donnees";

// Les lignes de la journée (accueil et vue Jour de l'Agenda). Elles ouvrent Maison. Rien à dire : rien ne s'affiche.
// 1. « Maison · 2 corvées à faire, 20 min » (les libres et les miennes), pour aujourd'hui seulement.
// 2. « Papiers · Passeport de Sarah à renouveler » : ce qui tombe le jour regardé, et aujourd'hui ce qui est en retard.
export function JourneeMaison({ proprio, now, aller, jour }: ContexteModule) {
  const d = useLiveQuery(async () => ({ corvees: await db.maison_corvees.toArray(), papiers: await db.maison_papiers.toArray() }), [], undefined);
  if (!d) return null;
  const today = auJour(0, now), vu = jour ?? today;
  const miennes = vu === today ? d.corvees.filter((c) => aFaire(c, now) && pourMoi(c, proprio)) : [];
  const min = miennes.reduce((n, c) => n + minutesDe(c.taille), 0);
  const papiers = papiersDu(d.papiers, vu, today);
  const retards = papiers.filter((p) => p.echeance! < today).length;
  const quoiPapier = (id: string) => QUOIS.find((q) => q.id === id)!.nom.toLowerCase();
  const ditPapiers = papiers.length === 1 ? `${papiers[0].titre} ${quoiPapier(papiers[0].quoi)}${retards ? ", en retard" : ""}`
    : `${papiers.length} choses à régler${retards ? `, dont ${retards} en retard` : ""}`;
  const ouvrir = (partie: "corvees" | "papiers") => (ev: React.MouseEvent) => { ev.preventDefault(); poserReglage("maisonPartie", partie); aller("maison"); };
  return (
    <>
      {miennes.length > 0 && (
        <a className="ligne-journee" href="#maison" onClick={ouvrir("corvees")}>
          <span className="tuile-icone" aria-hidden="true"><House size={16} strokeWidth={1.8} animated={false} /></span>
          <span><b>Maison</b> · {miennes.length === 1 ? miennes[0].nom : `${miennes.length} corvées à faire`}, {`${min}\u00a0min`}</span>
          <ChevronRight size={16} strokeWidth={2.2} animated={false} aria-hidden="true" />
        </a>
      )}
      {papiers.length > 0 && (
        <a className="ligne-journee" href="#maison" onClick={ouvrir("papiers")}>
          <span className="tuile-icone" aria-hidden="true"><FileText size={16} strokeWidth={1.8} animated={false} /></span>
          <span><b>Papiers</b> · {ditPapiers}</span>
          <ChevronRight size={16} strokeWidth={2.2} animated={false} aria-hidden="true" />
        </a>
      )}
    </>
  );
}
