import { liveQuery } from "dexie";
import { db } from "../../data/db";
import { ajouterAPayer, marquerPaye, retirerAPayer, type LigneAPayer } from "../budget/actions";
import { aPayer, apresFait, idAPayer, type Papier } from "./donnees";

// Le lien entre les Papiers et le Budget (convenu avec le fil Budget, 2026-11-27).
// Maison garde le papier ; dès qu'il y a un montant à payer avec une échéance, la ligne part dans « À payer » du Budget.
// Maison → Budget : seulement au moment d'un geste sur ce téléphone (ajouter, changer, cocher, retirer), jamais en réaction
// à ce que la synchro apporte : la ligne voyage ensuite par la synchro du Budget.
// Budget → Maison : une ligne payée dans le Budget coche le papier (suivreBudget).

const ligne = (p: Papier | null | undefined) => (p ? aPayer(p) : null);
const envoyer = (l: NonNullable<ReturnType<typeof aPayer>>) => ajouterAPayer(l as unknown as LigneAPayer); // les dossiers que le Budget ne connaît pas deviennent « autre » chez lui
// Une ligne pas encore payée peut partir ; une ligne payée reste au Budget comme trace.
async function retirerSiPasPayee(id: string) {
  const l = await db.budget_apayer.get(id);
  if (l && !l.paye) await retirerAPayer(id);
}

// Après un geste sur un papier : la ligne du Budget suit (créée, mise à jour, ou retirée si le papier n'est plus à payer).
export async function suivrePapier(avant: Papier | null | undefined, apres: Papier | null | undefined) {
  const la = ligne(avant), lb = ligne(apres);
  if (la && (!lb || lb.id !== la.id)) await retirerSiPasPayee(la.id);
  if (lb) await envoyer(lb);
  // Un papier payé qu'on rouvre (nouvelle date, de nouveau à payer) : sa ligne n'est plus payée non plus.
  if (lb && avant?.fait && !apres?.fait) await marquerPaye(lb.id, false);
}

// Cocher un papier à payer dans Maison : la ligne du Budget est payée ; ce qui revient ouvre la ligne de l'échéance suivante.
export async function payerAuBudget(avant: Papier, apres: Papier, jour: string) {
  const la = ligne(avant), lb = ligne(apres);
  if (!la) return;
  await envoyer(la); // au cas où la ligne n'existait pas encore (papier venu de l'autre téléphone)
  await marquerPaye(la.id, jour);
  if (lb && lb.id !== la.id) await envoyer(lb);
}
// Annuler ce geste.
export async function depayerAuBudget(avant: Papier, apres: Papier) {
  const la = ligne(avant), lb = ligne(apres);
  if (!la) return;
  await marquerPaye(la.id, false); // d'abord : sinon la ligne encore payée recocherait le papier
  if (lb && lb.id !== la.id) await retirerSiPasPayee(lb.id);
}

// Budget → Maison. Une ligne « papier:… » payée dans le Budget : le papier est coché (ce qui revient repart à l'échéance suivante).
// Si le paiement est annulé dans le Budget juste après, le papier revient comme il était (on s'en souvient le temps de la session).
const coches = new Map<string, Pick<Papier, "echeance" | "fait" | "jour">>();
let enCours = Promise.resolve();
async function reagir() {
  const lignes = (await db.budget_apayer.toArray()).filter((l) => l.papier);
  for (const l of lignes) {
    const p = await db.maison_papiers.get(l.papier!);
    if (!p) continue;
    if (l.paye && !p.fait && idAPayer(p) === l.id) {
      const apres = apresFait(p, new Date(`${l.paye}T12:00:00`));
      coches.set(l.id, { echeance: p.echeance, fait: p.fait, jour: p.jour });
      await db.maison_papiers.update(p.id, { echeance: apres.echeance, fait: apres.fait, jour: apres.jour });
      // L'échéance suivante d'une chose qui revient : ouverte seulement si elle n'existe pas déjà.
      const suite = ligne(apres);
      if (suite && suite.id !== l.id && !(await db.budget_apayer.get(suite.id))) await envoyer(suite);
    } else if (!l.paye && coches.has(l.id)) {
      const etait = coches.get(l.id)!;
      coches.delete(l.id);
      const suite = ligne(p);
      if (suite && suite.id !== l.id) await retirerSiPasPayee(suite.id);
      await db.maison_papiers.update(p.id, etait);
    }
  }
}
let suivi = false;
export function suivreBudget() {
  if (suivi) return;
  suivi = true;
  liveQuery(() => db.budget_apayer.toArray()).subscribe({ next: () => { enCours = enCours.then(reagir).catch(() => {}); }, error: () => {} });
}
// Pour les tests : attendre que la réaction en cours soit finie.
export const budgetSuivi = () => enCours;
