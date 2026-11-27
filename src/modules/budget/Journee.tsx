import { useLiveQuery } from "dexie-react-hooks";
import { ChevronRight, Wallet } from "pulsoicon-react";
import { db } from "../../data/db";
import { auJour } from "../../lib/dates";
import type { ContexteModule } from "../contrat";
import { chf, echeancesDu } from "./donnees";

// La ligne de la journée (accueil et vue Jour de l'Agenda) : ce qui est à payer ce jour-là. Elle ouvre le Budget. Rien à payer : rien ne s'affiche.
export function JourneeBudget({ now, aller, jour }: ContexteModule) {
  const today = auJour(0, now), vu = jour ?? today;
  const d = useLiveQuery(async () => ({ apayer: await db.budget_apayer.toArray(), postes: await db.budget_postes.toArray() }), [], undefined);
  const dues = d ? echeancesDu(vu, today, d.apayer, d.postes) : [];
  if (!dues.length) return null;
  const total = dues.reduce((s, e) => s + e.c, 0);
  const quoi = dues.length === 1 ? `${dues[0].titre}, ${chf(total)}` : `${dues.length} choses à payer, ${chf(total)} en tout`;
  return (
    <a className="ligne-journee" href="#budget" onClick={(ev) => { ev.preventDefault(); aller("budget"); }}>
      <span className="tuile-icone" aria-hidden="true"><Wallet size={16} strokeWidth={1.8} animated={false} /></span>
      <span><b>Budget</b> · {dues.some((e) => e.retard) ? "en retard : " : "à payer : "}{quoi}</span>
      <ChevronRight size={16} strokeWidth={2.2} animated={false} aria-hidden="true" />
    </a>
  );
}
