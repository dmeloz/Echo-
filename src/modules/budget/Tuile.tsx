import { useLiveQuery } from "dexie-react-hooks";
import { Wallet } from "pulsoicon-react";
import { db } from "../../data/db";
import { auJour } from "../../lib/dates";
import type { ContexteModule } from "../contrat";
import { bilan, chf, moisDe, resteAPayer } from "./donnees";

// La tuile de l'accueil : ce qui te reste ce mois-ci, ou la prochaine facture à payer.
export function TuileBudget({ proprio, now, aller }: ContexteModule) {
  const d = useLiveQuery(async () => ({ postes: await db.budget_postes.toArray(), apayer: await db.budget_apayer.toArray() }), [], undefined);
  let texte = "Votre budget à deux";
  if (d?.postes.length) {
    const b = bilan(d.postes, moisDe(auJour(0, now)));
    const du = resteAPayer(d.apayer)[0];
    texte = du && du.echeance <= auJour(7, now) ? `À payer : ${du.titre}, ${chf(du.c)}`
      : b.revenu[proprio] > 0 ? `Il te reste ${chf(b.reste[proprio])} · commun ${chf(b.resteCommun)}` : "Des montants à remplir";
  }
  return (
    <a className="tuile" href="#budget" onClick={(e) => { e.preventDefault(); aller("budget"); }}>
      <span className="tuile-icone" aria-hidden="true"><Wallet size={18} strokeWidth={1.8} animated={false} /></span>
      <b>Budget</b>
      <span>{texte}</span>
    </a>
  );
}
