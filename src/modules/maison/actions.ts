import { toast } from "sonner";
import { db } from "../../data/db";
import { auJour, nouvelId, sansAccents } from "../../lib/dates";
import type { Personne } from "../../lib/types";
import { minutesDe, type Appareil, type Contact, type Corvee, type EtatReparation, type Fait, type Modele, type QuiCorvee, type Reparation, type Taille } from "./donnees";

// Les gestes du module Maison sur ses propres tables. Tout ce qui change montre « Annuler ».

export const memeNom = (a: string, b: string) => sansAccents(a).trim() === sansAccents(b).trim();
const annuler = (onClick: () => unknown) => ({ action: { label: "Annuler", onClick } });

export interface NouvelleCorvee { nom: string; tous: number; piece?: string; taille?: Taille; qui?: QuiCorvee; entretien?: boolean; appareil?: string }
// Ajouter des corvées. Une corvée qui existe déjà (même nom) n'est pas doublée. Rend celles qui ont été ajoutées.
export async function ajouterCorvees(nouvelles: NouvelleCorvee[], silencieux = false): Promise<Corvee[]> {
  const ajoutees: Corvee[] = [];
  await db.transaction("rw", db.maison_corvees, async () => {
    const la = await db.maison_corvees.toArray();
    const cree = Date.now();
    for (const [i, n] of nouvelles.entries()) {
      const nom = n.nom.replace(/\s+/g, " ").trim().slice(0, 80);
      if (!nom || [...la, ...ajoutees].some((c) => memeNom(c.nom, nom))) continue;
      ajoutees.push({ id: nouvelId() + i, nom, piece: n.piece ?? "", tous: Math.min(365, Math.max(1, Math.round(n.tous))), taille: n.taille ?? 2, qui: n.qui ?? "tour", fait: null, ...(n.entretien ? { entretien: true } : {}), ...(n.appareil ? { appareil: n.appareil } : {}), cree: cree + i });
    }
    await db.maison_corvees.bulkAdd(ajoutees);
  });
  if (silencieux) return ajoutees;
  if (!ajoutees.length) toast("C'est déjà dans la liste");
  else toast(ajoutees.length > 1 ? `${ajoutees.length} ajoutées` : `${ajoutees[0].nom} : ajouté`, annuler(() => db.maison_corvees.bulkDelete(ajoutees.map((c) => c.id))));
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

/* ---------- Entretien : réparations, appareils, contacts ---------- */

const propre = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

// Noter une chose cassée. La même encore à suivre n'est pas doublée. Rend la réparation, ou null.
export async function ajouterReparation(nom: string, x: { note?: string; appareil?: string } = {}, silencieux = false): Promise<Reparation | null> {
  const n = propre(nom, 80);
  if (!n) return null;
  if ((await db.maison_reparations.toArray()).some((r) => r.etat < 3 && memeNom(r.nom, n))) { if (!silencieux) toast("C'est déjà noté"); return null; }
  const r: Reparation = { id: nouvelId(), nom: n[0].toUpperCase() + n.slice(1), etat: 1, note: propre(x.note ?? "", 200), ...(x.appareil ? { appareil: x.appareil } : {}), cree: Date.now() };
  await db.maison_reparations.add(r);
  if (!silencieux) toast(`${r.nom} : noté`, annuler(() => db.maison_reparations.delete(r.id)));
  return r;
}
// Changer l'état : « Réparé » garde la date, et la ligne quitte la liste (avec Annuler).
export async function etatReparation(r: Reparation, etat: EtatReparation) {
  await db.maison_reparations.put({ ...r, etat, fini: etat === 3 ? Date.now() : undefined });
  if (etat === 3) toast(`${r.nom} : réparé`, annuler(() => db.maison_reparations.put(r)));
}
export const changerReparation = (id: string, x: Partial<Pick<Reparation, "note" | "appareil">>) => db.maison_reparations.update(id, x);
export async function retirerReparation(r: Reparation) {
  await db.maison_reparations.delete(r.id);
  toast(`${r.nom} : retiré`, annuler(() => db.maison_reparations.put(r)));
}
// Les réparations finies depuis plus d'un an ne servent plus à l'histoire d'un appareil.
export const rangerReparations = (now = Date.now()) => db.maison_reparations.filter((r) => r.etat === 3 && (r.fini ?? r.cree) < now - 365 * 86_400_000).delete();

export async function ajouterAppareil(nom: string): Promise<Appareil | null> {
  const n = propre(nom, 60);
  if (!n) return null;
  if ((await db.maison_appareils.toArray()).some((a) => memeNom(a.nom, n))) { toast("C'est déjà dans la liste"); return null; }
  const a: Appareil = { id: nouvelId(), nom: n[0].toUpperCase() + n.slice(1), piece: "", garantie: 0, cree: Date.now() };
  await db.maison_appareils.add(a);
  toast(`${a.nom} : ajouté`, annuler(() => db.maison_appareils.delete(a.id)));
  return a;
}
export const changerAppareil = (id: string, x: Partial<Pick<Appareil, "piece" | "achat" | "garantie">>) => db.maison_appareils.update(id, x);
export async function retirerAppareil(a: Appareil) {
  await db.maison_appareils.delete(a.id);
  toast(`${a.nom} : retiré`, annuler(() => db.maison_appareils.put(a)));
}

export async function ajouterContact(c: { nom: string; role: string; tel: string }): Promise<Contact | null> {
  const nom = propre(c.nom, 80);
  if (!nom) return null;
  if ((await db.maison_contacts.toArray()).some((x) => memeNom(x.nom, nom))) { toast("C'est déjà dans la liste"); return null; }
  const contact: Contact = { id: nouvelId(), nom, role: propre(c.role, 30), tel: c.tel.slice(0, 20), cree: Date.now() };
  await db.maison_contacts.add(contact);
  toast(`${nom} : ajouté`, annuler(() => db.maison_contacts.delete(contact.id)));
  return contact;
}
export const changerContact = (id: string, x: Partial<Pick<Contact, "role" | "tel">>) => db.maison_contacts.update(id, x);
export async function retirerContact(c: Contact) {
  await db.maison_contacts.delete(c.id);
  toast(`${c.nom} : retiré`, annuler(() => db.maison_contacts.put(c)));
}
