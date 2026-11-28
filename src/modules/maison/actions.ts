import { toast } from "sonner";
import { db } from "../../data/db";
import { auJour, nouvelId, sansAccents } from "../../lib/dates";
import type { Personne } from "../../lib/types";
import { depayerAuBudget, enFile, payerAuBudget, suivrePapier } from "./lienBudget";
import { apresFait, devinerDossier, minutesDe, type Appareil, type Papier, type Contact, type Corvee, type EtatReparation, type Fait, type Modele, type QuiCorvee, type Reparation, type Taille } from "./donnees";

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
      ajoutees.push({ id: nouvelId() + i, nom, piece: n.piece ?? "", tous: Math.min(365, Math.max(1, Math.round(n.tous))), taille: n.taille ?? 2, qui: n.qui ?? "libre", fait: null, ...(n.entretien ? { entretien: true } : {}), ...(n.appareil ? { appareil: n.appareil } : {}), cree: cree + i });
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

// Choisir à la main qui s'en occupe efface la répartition de la semaine pour cette corvée.
export const changerCorvee = (id: string, x: Partial<Pick<Corvee, "nom" | "piece" | "tous" | "taille" | "qui">>) => db.maison_corvees.update(id, "qui" in x ? { ...x, pris: undefined, prisJusqu: undefined } : x);

// Valider la répartition de la semaine : chaque corvée libre est prise par quelqu'un jusqu'au dernier jour (ou relâchée : qui = null).
export async function poserRepartition(choix: Array<{ id: string; qui: Personne | null }>, jusqu: string, silencieux = false) {
  const avant = (await db.maison_corvees.bulkGet(choix.map((c) => c.id))).filter((c): c is Corvee => !!c);
  await db.transaction("rw", db.maison_corvees, async () => {
    for (const c of choix) await db.maison_corvees.update(c.id, c.qui ? { pris: c.qui, prisJusqu: jusqu } : { pris: undefined, prisJusqu: undefined });
  });
  const defaire = () => db.transaction("rw", db.maison_corvees, async () => { for (const c of avant) await db.maison_corvees.update(c.id, { pris: c.pris, prisJusqu: c.prisJusqu }); });
  if (!silencieux) toast(choix.some((c) => c.qui) ? "La semaine est répartie" : "Tout est de nouveau libre", annuler(defaire));
  return defaire;
}

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
  // Seuls l'état et la date changent : une note écrite juste avant n'est pas écrasée.
  await db.maison_reparations.update(r.id, { etat, fini: etat === 3 ? Date.now() : undefined });
  if (etat === 3) toast(`${r.nom} : réparé`, annuler(() => db.maison_reparations.update(r.id, { etat: r.etat, fini: r.fini })));
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

/* ---------- Papiers ---------- */

export type NouveauPapier = Partial<Omit<Papier, "id" | "cree" | "titre" | "photos">> & { titre: string };
// Chaque geste sur un papier passe par la file du lien avec le Budget (lienBudget.ts) : deux gestes rapprochés ne se croisent pas.
// Ranger un papier. Le même titre encore à faire n'est pas doublé. Rend le papier, ou null.
export const ajouterPapier = (n: NouveauPapier, silencieux = false): Promise<Papier | null> => enFile(async () => {
  const titre = propre(n.titre, 100);
  if (!titre) return null;
  if ((await db.maison_papiers.toArray()).some((p) => !p.fait && memeNom(p.titre, titre))) { if (!silencieux) toast("C'est déjà rangé"); return null; }
  const p: Papier = { id: nouvelId(), titre: titre[0].toUpperCase() + titre.slice(1), dossier: n.dossier ?? devinerDossier(titre), emetteur: propre(n.emetteur ?? "", 60), note: propre(n.note ?? "", 300),
    quoi: n.quoi ?? "", ...(n.echeance ? { echeance: n.echeance } : {}), ...(n.montant ? { montant: n.montant } : {}), repete: n.repete ?? "", photos: [], cree: Date.now() };
  await db.maison_papiers.add(p);
  await suivrePapier(null, p);
  if (!silencieux) toast(`${p.titre} : rangé`, annuler(() => retirerPapierSansBruit(p)));
  return p;
});
// Retirer sans message (pour Annuler un ajout, et pour Echo) : la ligne du Budget part avec, si elle n'est pas payée.
export const retirerPapierSansBruit = (p: Pick<Papier, "id">) => enFile(async () => {
  const la = await db.maison_papiers.get(p.id);
  await db.maison_papiers.delete(p.id);
  if (la) await suivrePapier(la, null);
});
// Changer un papier : s'il y a (ou s'il y avait) un montant à payer, la ligne du Budget suit.
export const changerPapier = (id: string, x: Partial<Omit<Papier, "id" | "cree">>) => enFile(async () => {
  const avant = await db.maison_papiers.get(id);
  if (!avant) return;
  await db.maison_papiers.update(id, x);
  let apres = (await db.maison_papiers.get(id))!;
  // Un papier déjà fait auquel on dit « ça revient » : il repart à l'échéance suivante, au lieu de rester fait pour toujours.
  if (apres.fait && apres.repete && apres.echeance && apres.quoi) {
    const suite = apresFait({ ...apres, fait: undefined }, new Date(`${apres.fait}T12:00:00`));
    await db.maison_papiers.update(id, { echeance: suite.echeance, fait: undefined, jour: suite.jour });
    apres = (await db.maison_papiers.get(id))!;
  }
  await suivrePapier(avant, apres);
});
// C'est fait (payé, renouvelé…) : une chose qui revient repart à la prochaine échéance. Avec Annuler.
export const papierFait = (p: Papier, now = new Date()) => enFile(async () => {
  const apres = apresFait(p, now);
  await db.maison_papiers.update(p.id, { echeance: apres.echeance, fait: apres.fait, jour: apres.jour });
  await payerAuBudget(p, apres, auJour(0, now));
  toast(`${p.titre} : fait`, annuler(() => enFile(async () => {
    await depayerAuBudget(p, apres); // d'abord : sinon la ligne encore payée recocherait le papier
    await db.maison_papiers.update(p.id, { echeance: p.echeance, fait: p.fait, jour: p.jour });
  })));
});
// Les photos d'un papier : on repart toujours de la liste du moment (une autre photo a pu arriver entre-temps), 12 au plus.
const photosPapier = (id: string, f: (noms: string[]) => string[]) => db.transaction("rw", db.maison_papiers, async () => {
  const p = await db.maison_papiers.get(id);
  if (p) await db.maison_papiers.update(id, { photos: [...new Set(f(p.photos))].slice(0, 12) });
});
export const ajouterPhotosPapier = (id: string, noms: string[]) => photosPapier(id, (l) => [...l, ...noms]);
export const retirerPhotoPapier = (id: string, nom: string) => photosPapier(id, (l) => l.filter((n) => n !== nom));
// Retirer un papier : il part ; ses photos attendent la fin du message (le temps d'Annuler), puis quittent le téléphone et le serveur.
// Message balayé ou app fermée avant : le ménage de photosPapiers (envoyerEnAttente) les retire plus tard.
export const retirerPapier = (p: Papier, oublier: (noms: string[]) => Promise<void>) => enFile(async () => {
  await db.maison_papiers.delete(p.id);
  await suivrePapier(p, null);
  let annule = false, fini = false;
  const finir = () => { if (annule || fini) return; fini = true; oublier(p.photos).catch(() => {}); };
  toast(`${p.titre} : retiré`, { ...annuler(() => { annule = true; return enFile(async () => { await db.maison_papiers.put(p); await suivrePapier(null, p); }); }), onAutoClose: finir, onDismiss: finir });
});
