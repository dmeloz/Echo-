import { toast } from "sonner";
import { nouvelId } from "../../lib/dates";
import type { Personne } from "../../lib/types";
import { db } from "../../data/db";
import { apresAchat, apresRefus, cleDe, habituelsDus, nouvelArticle, type Article, type Gouts, type Habitude, type Lieu, type Repas, type Reste, type Lu, type Rayon } from "./donnees";

// Les gestes du module Cuisine sur ses propres tables. Tout ce qui retire montre « Annuler ».

const proprio = async () => ((await db.reglages.get("proprio"))?.valeur as Personne | undefined) ?? "moi";

// Ajouter un ou plusieurs articles. Un article déjà dans la liste n'est pas doublé (« déjà là » n'est pas une erreur).
export async function ajouterArticles(lus: Lu[], silencieux = false) {
  const ajoutes: Article[] = [];
  let deja = 0;
  await db.transaction("rw", db.cuisine_courses, db.cuisine_habitudes, db.reglages, async () => {
    const par = await proprio();
    const habitudes = await db.cuisine_habitudes.toArray();
    const courses = await db.cuisine_courses.toArray();
    for (const [i, lu] of lus.entries()) {
      const cle = cleDe(lu.nom);
      const present = [...courses, ...ajoutes].find((a) => cleDe(a.nom) === cle);
      if (present) {
        deja++;
        // Déjà cochée : elle revient dans la liste. Une nouvelle quantité remplace l'ancienne.
        if (present.fait || lu.qte) await db.cuisine_courses.update(present.id, { fait: null, faitPar: undefined, ...(lu.qte ? { qte: lu.qte } : {}) });
        continue;
      }
      const connu = habitudes.find((h) => h.cle === cle);
      const a = nouvelArticle({ nom: lu.nom, qte: lu.qte || connu?.qte || "" }, par, habitudes, i);
      ajoutes.push(a);
    }
    await db.cuisine_courses.bulkAdd(ajoutes);
  });
  if (silencieux) return ajoutes;
  if (!ajoutes.length) toast(deja > 1 ? "Déjà dans la liste" : `${lus[0]?.nom ?? "C'est"} est déjà dans la liste`);
  else toast(ajoutes.length > 1 ? `${ajoutes.length} articles ajoutés` : `${ajoutes[0].nom} : ajouté aux courses`,
    { action: { label: "Annuler", onClick: () => db.cuisine_courses.bulkDelete(ajoutes.map((a) => a.id)) } });
  return ajoutes;
}

// Cocher ou décocher (sans message : on voit la case changer).
export const cocherArticle = (id: string) => db.transaction("rw", db.cuisine_courses, db.reglages, async () => {
  const a = await db.cuisine_courses.get(id);
  if (!a) return;
  await db.cuisine_courses.update(id, a.fait ? { fait: null, faitPar: undefined } : { fait: Date.now(), faitPar: await proprio() });
});

export const changerArticle = (id: string, x: Partial<Pick<Article, "nom" | "qte">>) => db.cuisine_courses.update(id, x);

// Changer de rayon à la main : Echo s'en souvient pour la prochaine fois.
export const rangerArticle = (a: Article, rayon: Rayon) => db.transaction("rw", db.cuisine_courses, db.cuisine_habitudes, async () => {
  await db.cuisine_courses.update(a.id, { rayon });
  const cle = cleDe(a.nom), h = await db.cuisine_habitudes.get(cle);
  await db.cuisine_habitudes.put(h ? { ...h, rayon } : { cle, nom: a.nom, qte: a.qte, rayon, achats: [], refus: 0 });
});

// Retirer un article. Si c'est Echo qui l'avait remis, il comprend : il attend plus longtemps la prochaine fois.
export async function retirerArticle(a: Article) {
  const cle = cleDe(a.nom);
  let avant: Habitude | undefined;
  await db.transaction("rw", db.cuisine_courses, db.cuisine_habitudes, async () => {
    await db.cuisine_courses.delete(a.id);
    if (a.par !== "echo") return;
    const h = await db.cuisine_habitudes.get(cle);
    if (h) { avant = h; await db.cuisine_habitudes.put(apresRefus(h, Date.now())); }
  });
  toast(a.par === "echo" ? "Retiré. Je le proposerai moins souvent." : "Retiré de la liste", {
    action: { label: "Annuler", onClick: () => db.transaction("rw", db.cuisine_courses, db.cuisine_habitudes, async () => {
      await db.cuisine_courses.put(a);
      const h = avant;
      if (h) await db.cuisine_habitudes.put(h);
    }) },
  });
}

// Ranger les courses faites : ce qui est coché quitte la liste et Echo retient l'achat.
// Tout seul au bout de 12 h, ou tout de suite avec « Courses finies ».
export const DELAI_RANGEMENT = 12 * 3600_000;
export async function rangerFaits(tout = false, now = Date.now()) {
  let n = 0;
  await db.transaction("rw", db.cuisine_courses, db.cuisine_habitudes, async () => {
    const faits = (await db.cuisine_courses.toArray()).filter((a) => a.fait && (tout || now - a.fait > DELAI_RANGEMENT));
    for (const a of faits) await db.cuisine_habitudes.put(apresAchat(await db.cuisine_habitudes.get(cleDe(a.nom)), a));
    await db.cuisine_courses.bulkDelete(faits.map((a) => a.id));
    n = faits.length;
  });
  return n;
}

// Remettre dans la liste les achats habituels dont c'est le moment (réglage « Achats habituels »).
export async function remettreHabituels(now = Date.now()) {
  if ((await db.reglages.get("cuisineHabituels"))?.valeur === false) return 0;
  let n = 0;
  await db.transaction("rw", db.cuisine_courses, db.cuisine_habitudes, async () => {
    const dus = habituelsDus(await db.cuisine_habitudes.toArray(), await db.cuisine_courses.toArray(), now);
    await db.cuisine_courses.bulkPut(dus);
    n = dus.length;
  });
  return n;
}

export const oublierHabitude = (cle: string) => db.cuisine_habitudes.delete(cle);

/* ---------- Semaine, stock, goûts (formes simples du lot 1) ---------- */

// Les articles qu'Echo avait mis aux courses pour le repas d'un jour repartent avec lui (sauf ceux déjà pris,
// ou qui servent aussi à un autre repas). Renvoie de quoi les remettre.
export async function retirerCoursesDe(jour: string) {
  const touches = (await db.cuisine_courses.toArray()).filter((a) => a.pour?.includes(jour));
  for (const a of touches) {
    const pour = a.pour!.filter((j) => j !== jour);
    if (!pour.length && !a.fait) await db.cuisine_courses.delete(a.id);
    else await db.cuisine_courses.update(a.id, { pour: pour.length ? pour : undefined });
  }
  return touches;
}

// Écrire soi-même le repas d'un jour (ou le retirer). Un plat écrit à la main n'est plus une proposition d'Echo
// et n'a plus ses ingrédients : ceux qu'il avait mis aux courses repartent. Annuler remet tout.
export async function poserRepas(jour: string, plat: string) {
  const p = plat.trim().slice(0, 80);
  let avant: Repas | undefined, courses: Article[] = [];
  await db.transaction("rw", db.cuisine_repas, db.cuisine_courses, async () => {
    avant = await db.cuisine_repas.get(jour);
    if (!p && !avant) return;
    courses = await retirerCoursesDe(jour);
    if (p) await db.cuisine_repas.put({ jour, plat: p }); else await db.cuisine_repas.delete(jour);
  });
  const ancien = avant;
  if (!ancien || (p && !courses.length)) return;
  toast(p ? "Repas changé, courses mises à jour" : `${ancien.plat} retiré`, { action: { label: "Annuler", onClick: () => db.transaction("rw", db.cuisine_repas, db.cuisine_courses, async () => {
    await db.cuisine_repas.put(ancien);
    await db.cuisine_courses.bulkPut(courses);
  }) } });
}

export async function ajouterProduit(nom: string, lieu: Lieu, avant = "") {
  const n = nom.trim().slice(0, 60);
  if (!n) return;
  await db.cuisine_stock.add({ id: nouvelId(), nom: n.charAt(0).toUpperCase() + n.slice(1), lieu, ...(avant ? { avant } : {}), cree: Date.now() });
}
export async function retirerProduit(id: string) {
  const p = await db.cuisine_stock.get(id);
  if (!p) return;
  await db.cuisine_stock.delete(id);
  toast(`${p.nom} retiré du stock`, { action: { label: "Annuler", onClick: () => db.cuisine_stock.put(p) } });
}

// Dire ce qu'il reste d'un produit. « Presque fini » le remet aux courses ; « fini » le sort du stock et le remet aux courses.
// Annuler remet le produit comme il était et retire l'article que ce geste avait ajouté.
export async function noterReste(id: string, reste: Reste | "plein" | "fini") {
  const p = await db.cuisine_stock.get(id);
  if (!p || (reste !== "fini" && (p.reste ?? "plein") === reste)) return;
  let ajoutes: Article[] = [];
  if (reste === "fini") await db.cuisine_stock.delete(id);
  else await db.cuisine_stock.update(id, { reste: reste === "plein" ? undefined : reste });
  if (reste === "fini" || reste === "peu") ajoutes = await ajouterArticles([{ nom: p.nom, qte: "" }], true);
  if (reste !== "fini" && reste !== "peu") return;
  const debut = reste === "fini" ? `${p.nom} : fini` : `${p.nom} : presque fini`;
  toast(ajoutes.length ? `${debut}, ajouté aux courses` : `${debut}, déjà dans les courses`, { action: { label: "Annuler", onClick: () => db.transaction("rw", db.cuisine_stock, db.cuisine_courses, async () => {
    await db.cuisine_stock.put(p);
    await db.cuisine_courses.bulkDelete(ajoutes.map((a) => a.id));
  }) } });
}

export const enregistrerGouts = (g: Omit<Gouts, "maj">) => db.cuisine_gouts.put({ ...g, maj: Date.now() });
