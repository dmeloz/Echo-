import { liveQuery } from "dexie";
import { db } from "../../data/db";
import { ajouterAPayer, marquerPaye, retirerAPayer, type LigneAPayer } from "../budget/actions";
import { aPayer, apresFait, type Papier } from "./donnees";

// Le lien entre les Papiers et le Budget (convenu avec le fil Budget, 2026-11-27).
// Maison garde le papier ; dès qu'il y a un montant à payer avec une échéance, la ligne part dans « À payer » du Budget.
// Maison → Budget : seulement au moment d'un geste sur ce téléphone (ajouter, changer, cocher, retirer), jamais en réaction
// à ce que la synchro apporte : la ligne voyage ensuite par la synchro du Budget.
// Budget → Maison : une ligne payée dans le Budget coche le papier (suivreBudget).
// Tout passe par une seule file : deux gestes rapprochés (ou un geste et une réaction) ne se croisent jamais.

let file: Promise<unknown> = Promise.resolve();
export function enFile<T>(f: () => Promise<T>): Promise<T> {
  const r = file.then(f, f);
  file = r.catch(() => {});
  return r;
}
// Le lien ne doit jamais casser le geste sur le papier : une erreur côté Budget est notée, le papier reste juste.
const sansCasser = (f: () => Promise<unknown>) => f().catch((e) => { console.error("[maison] lien budget", e); });

type Ligne = NonNullable<ReturnType<typeof aPayer>>;
const ligne = (p: Papier | null | undefined) => (p ? aPayer(p) : null);
const envoyer = (l: Ligne) => ajouterAPayer(l as unknown as LigneAPayer); // les dossiers que le Budget ne connaît pas deviennent « autre » chez lui
// La ligne d'une facture unique (« papier:<id> ») suit toujours son papier : elle part avec lui, payée ou non.
// La ligne d'une échéance passée de ce qui revient reste au Budget comme trace si elle est payée.
async function retirer(l: Ligne, memeSiPayee: boolean) {
  const la = await db.budget_apayer.get(l.id);
  if (la && (!la.paye || memeSiPayee)) await retirerAPayer(l.id);
}
// Ce que la réaction a coché d'elle-même (voir reagir) : oublié dès que Maison touche le papier.
const coches = new Map<string, { ligne: string; avant: Pick<Papier, "echeance" | "fait" | "jour">; ecrit: Pick<Papier, "echeance" | "fait" | "jour"> }>();
const etat = (p: Papier) => ({ echeance: p.echeance, fait: p.fait, jour: p.jour });
type Etat = Pick<Papier, "echeance" | "fait" | "jour">;
const pareil = (a: Etat, b: Etat) => a.echeance === b.echeance && a.fait === b.fait && a.jour === b.jour;

// Après un geste sur un papier : la ligne du Budget suit (créée, mise à jour, ou retirée si le papier n'est plus à payer).
export const suivrePapier = (avant: Papier | null | undefined, apres: Papier | null | undefined) => sansCasser(async () => {
  const la = ligne(avant), lb = ligne(apres);
  coches.delete((avant ?? apres)!.id);
  if (la && (!lb || lb.id !== la.id)) await retirer(la, !avant!.repete);
  if (!lb) return;
  await db.transaction("rw", db.budget_apayer, async () => {
    await envoyer(lb);
    // Facture unique : payée ou non, comme le papier (un papier payé qu'on rouvre redevient à payer au Budget).
    if (!apres!.repete) await marquerPaye(lb.id, lb.paye);
  });
});

// Cocher un papier à payer dans Maison : la ligne du Budget est payée ; ce qui revient ouvre la ligne de l'échéance suivante.
export const payerAuBudget = (avant: Papier, apres: Papier, jour: string) => sansCasser(async () => {
  const la = ligne(avant), lb = ligne(apres);
  coches.delete(avant.id);
  if (!la) return;
  await db.transaction("rw", db.budget_apayer, async () => {
    await envoyer(la); // au cas où la ligne n'existait pas encore
    await marquerPaye(la.id, jour);
    if (lb && lb.id !== la.id) await envoyer(lb);
  });
});
// Annuler ce geste.
export const depayerAuBudget = (avant: Papier, apres: Papier) => sansCasser(async () => {
  const la = ligne(avant), lb = ligne(apres);
  coches.delete(avant.id);
  if (!la) return;
  await db.transaction("rw", db.budget_apayer, async () => {
    await marquerPaye(la.id, false);
    if (lb && lb.id !== la.id) await retirer(lb, false);
  });
});

// Budget → Maison. Une ligne payée dans le Budget, qui est bien la ligne du moment de son papier : le papier est coché
// (ce qui revient repart à l'échéance suivante). Si le paiement est annulé dans le Budget juste après (son « Annuler »),
// le papier revient comme il était, à condition que personne ne l'ait touché entre-temps. On s'en souvient le temps de la session.
async function reagir() {
  for (const l of (await db.budget_apayer.toArray()).filter((x) => x.papier)) {
    const p = await db.maison_papiers.get(l.papier!);
    if (!p) continue;
    const coche = coches.get(p.id);
    if (l.paye && !p.fait && aPayer(p)?.id === l.id) {
      const apres = apresFait(p, new Date(`${l.paye}T12:00:00`));
      await db.maison_papiers.update(p.id, etat(apres));
      coches.set(p.id, { ligne: l.id, avant: etat(p), ecrit: etat(apres) });
      // L'échéance suivante d'une chose qui revient : ouverte seulement si elle n'existe pas déjà.
      const suite = ligne(apres);
      if (suite && suite.id !== l.id && !(await db.budget_apayer.get(suite.id))) await envoyer(suite);
    } else if (!l.paye && coche?.ligne === l.id) {
      coches.delete(p.id);
      if (!pareil(etat(p), coche.ecrit)) continue;
      const suite = ligne(p);
      if (suite && suite.id !== l.id) await retirer(suite, false);
      await db.maison_papiers.update(p.id, coche.avant);
    }
  }
}
// Une seule fois par téléphone : les factures rangées avant que ce lien existe partent au Budget (si elles n'y sont pas déjà).
async function rattraper() {
  if ((await db.reglages.get("maisonBudgetRelie"))?.valeur) return;
  for (const p of await db.maison_papiers.toArray()) {
    const l = ligne(p);
    if (l && !l.paye && !(await db.budget_apayer.get(l.id))) await envoyer(l);
  }
  await db.reglages.put({ cle: "maisonBudgetRelie", valeur: true });
}
let suivi = false;
export function suivreBudget() {
  if (suivi) return;
  suivi = true;
  enFile(() => sansCasser(rattraper));
  liveQuery(() => db.budget_apayer.toArray()).subscribe({ next: () => { enFile(() => sansCasser(reagir)); }, error: () => {} });
}
// Pour les tests : attendre que tout ce qui est en file soit fini.
export const budgetSuivi = () => file;
