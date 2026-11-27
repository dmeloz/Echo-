import { toast } from "sonner";
import { db } from "../../data/db";
import { auJour, nouvelId, sansAccents } from "../../lib/dates";
import type { Personne } from "../../lib/types";
import { minutesDe, type Corvee, type Fait, type Modele, type QuiCorvee, type Taille } from "./donnees";

// Les gestes du module Maison sur ses propres tables. Tout ce qui change montre « Annuler ».

const memeNom = (a: string, b: string) => sansAccents(a).trim() === sansAccents(b).trim();
const annuler = (onClick: () => unknown) => ({ action: { label: "Annuler", onClick } });

export interface NouvelleCorvee { nom: string; tous: number; piece?: string; taille?: Taille; qui?: QuiCorvee }
// Ajouter des corvées. Une corvée qui existe déjà (même nom) n'est pas doublée. Rend celles qui ont été ajoutées.
export async function ajouterCorvees(nouvelles: NouvelleCorvee[], silencieux = false): Promise<Corvee[]> {
  const ajoutees: Corvee[] = [];
  await db.transaction("rw", db.maison_corvees, async () => {
    const la = await db.maison_corvees.toArray();
    const cree = Date.now();
    for (const [i, n] of nouvelles.entries()) {
      const nom = n.nom.replace(/\s+/g, " ").trim().slice(0, 80);
      if (!nom || [...la, ...ajoutees].some((c) => memeNom(c.nom, nom))) continue;
      ajoutees.push({ id: nouvelId() + i, nom, piece: n.piece ?? "", tous: Math.min(365, Math.max(1, Math.round(n.tous))), taille: n.taille ?? 2, qui: n.qui ?? "tour", fait: null, cree: cree + i });
    }
    await db.maison_corvees.bulkAdd(ajoutees);
  });
  if (silencieux) return ajoutees;
  if (!ajoutees.length) toast("C'est déjà dans la liste");
  else toast(ajoutees.length > 1 ? `${ajoutees.length} corvées ajoutées` : `${ajoutees[0].nom} : ajouté`, annuler(() => db.maison_corvees.bulkDelete(ajoutees.map((c) => c.id))));
  return ajoutees;
}
export const ajouterModeles = (modeles: Modele[]) => ajouterCorvees(modeles, true);

// C'est fait : la corvée repart pour un tour, et la ligne est gardée pour l'équilibre. Rend de quoi annuler.
export async function faireCorvee(id: string, par: Personne, quand = Date.now()): Promise<(() => Promise<void>) | null> {
  return db.transaction("rw", db.maison_corvees, db.maison_faits, async () => {
    const avant = await db.maison_corvees.get(id);
    if (!avant) return null;
    const fait: Fait = { id: nouvelId(), corvee: id, nom: avant.nom, par, quand, min: minutesDe(avant.taille) };
    await db.maison_corvees.put({ ...avant, fait: quand, par, report: undefined });
    await db.maison_faits.add(fait);
    return () => db.transaction("rw", db.maison_corvees, db.maison_faits, async () => {
      // On ne remet l'ancien état que si personne n'a recoché la corvée entre-temps.
      if ((await db.maison_corvees.get(id))?.fait === quand) await db.maison_corvees.put(avant);
      await db.maison_faits.delete(fait.id);
    });
  });
}
export const cocherCorvee = (c: Corvee, par: Personne, prenom?: string) => cocherCorvees([c], par, prenom);
export async function cocherCorvees(cs: Corvee[], par: Personne, prenom?: string) {
  const defaire: Array<() => Promise<void>> = [];
  for (const c of cs) { const d = await faireCorvee(c.id, par); if (d) defaire.push(d); }
  if (!defaire.length) return;
  toast(`${cs.map((c) => c.nom).join(", ")} : fait${prenom ? ` par ${prenom}` : ""}`, annuler(async () => { for (const d of defaire.reverse()) await d(); }));
}

// Pas cette fois : la corvée revient plus tard (un quart de son rythme, au moins demain), sans compter pour personne.
export async function reporterCorvee(c: Corvee, now = new Date()) {
  const report = auJour(Math.max(1, Math.round(c.tous / 4)), now);
  await db.maison_corvees.update(c.id, { report });
  toast(`${c.nom} : remis à plus tard`, annuler(() => db.maison_corvees.update(c.id, { report: c.report })));
}

export const changerCorvee = (id: string, x: Partial<Pick<Corvee, "nom" | "piece" | "tous" | "taille" | "qui">>) => db.maison_corvees.update(id, x);

export async function retirerCorvee(c: Corvee) {
  await db.maison_corvees.delete(c.id);
  toast(`${c.nom} : retiré`, annuler(() => db.maison_corvees.put(c)));
}

// Les lignes « fait » de plus de 60 jours ne servent plus à l'équilibre.
export const rangerFaits = (now = Date.now()) => db.maison_faits.where("quand").below(now - 60 * 86_400_000).delete();

