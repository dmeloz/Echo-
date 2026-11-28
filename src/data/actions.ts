import { toast } from "sonner";
import { confirmer, quandFait } from "../lib/messages";
import { auJour, heureFr, libelleJour, minutes, nouvelId } from "../lib/dates";
import { NIVEAUX, niveau } from "../lib/importance";
import type { Etape, Niveau, Noms, Personne, Qui, Repete, Tache } from "../lib/types";
import { reordonner } from "../lib/ordre";
import type { Code, Horaire } from "../lib/horaires";
import { prochainJour } from "../lib/valider";
import { NOMS_DEFAUT, db } from "./db";
import { TABLES_MODULES } from "../sync/genres";
import { DUREE_JOURNAL } from "../lib/echo/journal";

export function exemples(): Tache[] {
  const t = auJour(), h = new Date().getHours();
  const plus = (n: number) => String(Math.min(22, h + n)).padStart(2, "0") + ":00";
  const base: Array<Partial<Tache> & Pick<Tache, "titre" | "qui" | "jour" | "heure">> = [
    { titre: "Payer la facture d'électricité", qui: "moi", jour: auJour(-1), heure: "" },
    { titre: "Vétérinaire pour le chat", qui: "nous", jour: t, heure: plus(2) },
    { titre: "Sortir les poubelles", qui: "elle", jour: t, heure: "20:00", repete: "semaine" },
    { titre: "Appeler le plombier pour le robinet", qui: "moi", jour: t, heure: "" },
    { titre: "Arroser les plantes", qui: "elle", jour: t, heure: "", repete: "jour" },
    { titre: "Trier les papiers du tiroir, un jour", qui: "nous", jour: t, heure: "" },
  ];
  return base.map((x, i) => ({ id: nouvelId() + i, niveau: null, repete: "", note: "", fait: null, faitLe: null, cree: Date.now() + i, ex: true, ...x }));
}

// Au tout premier lancement, on met des exemples pour essayer.
export async function premierLancement() {
  // Le contrôle se fait DANS la transaction : deux ouvertures en même temps ne doublent pas les exemples.
  await db.transaction("rw", db.taches, db.reglages, async () => {
    if (await db.reglages.get("initialise")) return;
    await db.taches.bulkAdd(exemples());
    await db.reglages.put({ cle: "initialise", valeur: true });
  });
}

export interface Brouillon { titre: string; qui: Qui; jour: string; heure: string; niveau: Niveau | null; repete: Repete; note: string; etapes?: Etape[]; evt?: boolean; fin?: string }

export async function ajouter(d: Brouillon, photos: Blob[] = []) {
  const t: Tache = { id: nouvelId(), ...d, fait: null, faitLe: null, cree: Date.now() };
  await db.transaction("rw", db.taches, db.photos, async () => {
    await db.taches.add(t);
    await db.photos.bulkAdd(photos.map((blob, i) => ({ id: nouvelId() + i, tacheId: t.id, blob, cree: Date.now() + i })));
  });
  const quand = t.jour === auJour() ? "" : ` · ${libelleJour(t.jour).toLowerCase()}`;
  toast(`Ajouté${quand}`, { action: { label: "Annuler", onClick: () => retirer(t.id) } });
}

// Ajouter d'un coup ce qu'Echo a proposé : un seul message, et « Annuler » retire tout.
export async function ajouterTout(ds: Brouillon[]) {
  if (ds.length === 1) return ajouter(ds[0]);
  const ts: Tache[] = ds.map((d, i) => ({ id: nouvelId() + i, ...d, fait: null, faitLe: null, cree: Date.now() + i }));
  await db.taches.bulkAdd(ts);
  toast(`${ts.length} ajoutés`, { action: { label: "Annuler", onClick: () => db.transaction("rw", db.taches, db.photos, async () => {
    await db.taches.bulkDelete(ts.map((t) => t.id));
    await db.photos.where("tacheId").anyOf(ts.map((t) => t.id)).delete();
  }) } });
}

// Retirer une tâche et ses photos (sans message).
const retirer = (id: string) => db.transaction("rw", db.taches, db.photos, async () => {
  await db.taches.delete(id);
  await db.photos.where("tacheId").equals(id).delete();
});

export async function modifier(id: string, d: Brouillon, photos: Blob[] = [], photosRetirees: string[] = []) {
  await db.transaction("rw", db.taches, db.photos, async () => {
    await db.taches.update(id, { ...d, ex: false });
    await db.photos.bulkDelete(photosRetirees);
    await db.photos.bulkAdd(photos.map((blob, i) => ({ id: nouvelId() + i, tacheId: id, blob, cree: Date.now() + i })));
  });
  confirmer("Enregistré");
}

export async function cocher(tache: Tache) {
  const r = await marquerFait(tache.id, !!tache.fait);
  if (!r) return;
  toast(r.message, { action: { label: "Annuler", onClick: () => decocher(tache.id) } });
}

// Cocher une tâche, sans message (aussi utilisé par Echo). null : rien à faire (déjà cochée, ou effacée).
// dejaCochee : la personne voyait la tâche cochée ; un deuxième toucher la décoche.
export async function marquerFait(id: string, dejaCochee = false): Promise<{ message: string } | null> {
  let message = "Fait !";
  let deja = false;
  await db.transaction("rw", db.taches, db.reglages, async () => {
    // On relit la tâche : deux touchers rapides ne doivent pas la cocher (ou la répéter) deux fois.
    const t = await db.taches.get(id);
    if (!t) { deja = true; return; }
    if (t.fait) { deja = true; if (dejaCochee) await annulerFait(t.id); return; }
    const maj: Partial<Tache> = { fait: Date.now(), faitLe: auJour(), faitPar: ((await db.reglages.get("proprio"))?.valeur as Personne | undefined) ?? "moi" };
    // Une tâche qui revient : on prépare la suivante.
    if (t.repete) {
      const suiv = prochainJour(t.jour, t.repete);
      const copie: Tache = { ...t, ordre: undefined, id: nouvelId(), jour: suiv, fait: null, faitLe: null, suite: null, cree: Date.now(), etapes: t.etapes?.map((e) => ({ ...e, fait: false })) };
      await db.taches.add(copie);
      maj.suite = copie.id;
      message = `Fait. Revient ${libelleJour(suiv).toLowerCase()}`.replace(/\.?$/, ".");
    }
    await db.taches.update(t.id, maj);
  });
  return deja ? null : { message };
}

async function annulerFait(id: string) {
  const t = await db.taches.get(id);
  if (!t) return;
  if (t.suite) {
    // La suivante n'est retirée que si elle n'a pas déjà été faite.
    const suite = await db.taches.get(t.suite);
    if (suite && !suite.fait) await db.taches.delete(t.suite);
  }
  await db.taches.update(id, { fait: null, faitLe: null, suite: null, faitPar: undefined });
}
export const decocher = (id: string) => db.transaction("rw", db.taches, () => annulerFait(id));

export async function changerNiveau(t: Tache, sens: 1 | -1) {
  const avant = t.niveau, cur = niveau(t);
  const n = Math.max(0, Math.min(2, cur + sens)) as Niveau;
  if (n === cur) { toast(sens > 0 ? "Déjà en important" : "Déjà en plus tard"); return; }
  await db.taches.update(t.id, { niveau: n });
  toast(`Rangé en « ${NIVEAUX[n]} »`, { action: { label: "Annuler", onClick: () => db.taches.update(t.id, { niveau: avant }) } });
}

// Supprimer = mettre à la corbeille (30 jours). Les photos restent sur le téléphone jusqu'à la fin du délai.
export const DELAI_CORBEILLE = 30 * 86400_000;
export async function supprimer(id: string) {
  if (await mettreCorbeille(id)) toast("Mis à la corbeille", { action: { label: "Annuler", onClick: () => { quandFait(remettre(id), "Remis dans tes tâches"); } } });
}
// Mettre à la corbeille sans message (aussi utilisé par Echo). false : la tâche n'existe plus.
export async function mettreCorbeille(id: string) {
  let fait = false;
  await db.transaction("rw", db.taches, db.corbeille, db.reglages, async () => {
    const t = await db.taches.get(id);
    if (!t) return;
    const proprio = ((await db.reglages.get("proprio"))?.valeur as Personne | undefined) ?? "moi";
    const noms = ((await db.reglages.get("noms"))?.valeur as Noms | undefined) ?? NOMS_DEFAUT;
    await db.corbeille.put({ id, tache: t, par: noms[proprio] ?? "", quand: Date.now() });
    await db.taches.delete(id);
    fait = true;
  });
  return fait;
}

// Sortir une tâche de la corbeille : elle revient comme avant (sans son ancien lien iCloud, qui n'existe plus).
// Rend vrai si la tâche est revenue (faux : elle n'était plus à la corbeille, déjà remise ici ou par l'autre téléphone).
export const remettre = (id: string) => db.transaction("rw", db.taches, db.corbeille, async () => {
  const e = await db.corbeille.get(id);
  if (!e) return false;
  await db.taches.put({ ...e.tache, ical: undefined });
  await db.corbeille.delete(id);
  return true;
});

// Au démarrage : ce qui est à la corbeille depuis plus de 30 jours s'en va pour de bon, avec ses photos.
export const viderVieilleCorbeille = (now = Date.now()) => db.transaction("rw", db.corbeille, db.photos, async () => {
  const ids = await db.corbeille.where("quand").below(now - DELAI_CORBEILLE).primaryKeys();
  await db.corbeille.bulkDelete(ids);
  await db.photos.where("tacheId").anyOf(ids).delete();
});

// Au démarrage : le journal d'Echo ne garde que 90 jours.
export const viderVieuxJournal = (now = Date.now()) => db.echo_journal.where("quand").below(now - DUREE_JOURNAL).delete();

// Changer l'ordre à la main : la tâche se pose avant « avantId » (ou tout en bas), avec Annuler.
export async function ranger(liste: Tache[], id: string, avantId: string | null, now = new Date()) {
  const changes = reordonner(liste, id, avantId, now);
  if (!changes.length) return;
  const avant = changes.map(({ id: i }) => { const t = liste.find((x) => x.id === i)!; return { id: i, niveau: t.niveau, ordre: t.ordre }; });
  const poser = (cs: Array<{ id: string; niveau: Niveau | null; ordre?: number }>) => db.transaction("rw", db.taches, async () => {
    for (const c of cs) await db.taches.update(c.id, { niveau: c.niveau, ordre: c.ordre });
  });
  await poser(changes);
  toast("Ordre changé", { action: { label: "Annuler", onClick: () => poser(avant) } });
}

export const effacerExemples = () => db.transaction("rw", db.taches, db.photos, async () => {
  const ids = (await db.taches.filter((t) => !!t.ex).toArray()).map((t) => t.id);
  await db.taches.bulkDelete(ids);
  await db.photos.where("tacheId").anyOf(ids).delete();
});

export const remettreExemples = () => db.taches.bulkAdd(exemples());
// Tout effacer : les tâches, et aussi les données des modules (courses, stock, repas, habitudes, goûts).
export const toutEffacer = () => db.transaction("rw", [db.taches, db.photos, db.corbeille, ...TABLES_MODULES], async () => {
  await db.taches.clear(); await db.photos.clear(); await db.corbeille.clear();
  for (const t of TABLES_MODULES) await t.clear();
});

// « À demain » : la tâche quitte aujourd'hui sans être perdue.
export async function aDemain(t: Tache) {
  const avant = t.jour;
  await db.taches.update(t.id, { jour: auJour(1) });
  toast("Remis à demain", { action: { label: "Annuler", onClick: () => db.taches.update(t.id, { jour: avant }) } });
}

// « Pour l'autre » (dos de la carte En premier) : la tâche change de main, sans être perdue.
export async function donnerA(t: Tache, qui: Qui, nom: string) {
  const avant = t.qui;
  await db.taches.update(t.id, { qui });
  toast(`Pour ${nom} maintenant`, { action: { label: "Annuler", onClick: () => db.taches.update(t.id, { qui: avant }) } });
}

// Cocher une étape sans ouvrir la feuille.
export async function basculerEtape(id: string, etapeId: string) {
  await db.transaction("rw", db.taches, async () => {
    const t = await db.taches.get(id);
    if (!t?.etapes) return;
    await db.taches.update(id, { etapes: t.etapes.map((e) => (e.id === etapeId ? { ...e, fait: !e.fait } : e)) });
  });
}

// Changer le jour d'une tâche (planning), avec « Annuler ».
export async function deplacer(t: Tache, jour: string) {
  const avant = t.jour;
  if (avant === jour) return;
  await db.taches.update(t.id, { jour });
  toast(`Déplacé à ${libelleJour(jour).toLowerCase()}`, { action: { label: "Annuler", onClick: () => db.taches.update(t.id, { jour: avant }) } });
}

// Les horaires de travail : poser, changer ou retirer le code d'un jour (sans message : on voit la case changer).
export async function poserHoraire(qui: Personne, jour: string, code: Code | null) {
  if (code) await db.horaires.put({ qui, jour, code });
  else await db.horaires.delete([qui, jour]);
}
// Remplir plusieurs jours d'un coup, avec Annuler qui remet les anciens codes.
export async function remplirHoraires(qui: Personne, jours: Array<[string, Code]>) {
  const avant = await db.horaires.bulkGet(jours.map(([j]) => [qui, j] as [string, string]));
  await db.horaires.bulkPut(jours.map(([jour, code]) => ({ qui, jour, code })));
  toast(`${jours.length} jour${jours.length > 1 ? "s" : ""} rempli${jours.length > 1 ? "s" : ""}`, {
    action: { label: "Annuler", onClick: () => db.transaction("rw", db.horaires, async () => {
      await db.horaires.bulkDelete(jours.map(([j]) => [qui, j] as [string, string]));
      await db.horaires.bulkPut(avant.filter((h): h is Horaire => !!h));
    }) },
  });
}

// Les vacances : poser (ou retirer) des jours « VAC » pour une ou deux personnes d'un coup, avec Annuler.
// Retirer remet le jour comme avant les vacances : vide (les horaires fixes reviennent tout seuls).
export async function changerVacances(jours: Array<[Personne, string]>, poser: boolean, message: string) {
  const cles = jours.map(([q, j]) => [q, j] as [string, string]);
  const avant = await db.horaires.bulkGet(cles);
  await db.transaction("rw", db.horaires, async () => {
    if (poser) await db.horaires.bulkPut(jours.map(([qui, jour]) => ({ qui, jour, code: "VAC" as Code })));
    else await db.horaires.bulkDelete(cles.filter((_, i) => avant[i]?.code === "VAC"));
  });
  toast(message, {
    action: { label: "Annuler", onClick: () => db.transaction("rw", db.horaires, async () => {
      await db.horaires.bulkDelete(cles);
      await db.horaires.bulkPut(avant.filter((h): h is Horaire => !!h));
    }) },
  });
}

// Glisser une chose dans la vue Jour : elle change d'heure (la fin d'un événement suit), avec « Annuler ».
export async function changerHeure(t: Tache, heure: string) {
  if (!t.heure || t.heure === heure) return;
  const decale = (h: string, d: number) => { const m = Math.min(23 * 60 + 59, Math.max(0, minutes(h) + d)); return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
  const avant = { heure: t.heure, fin: t.fin };
  const fin = t.fin ? decale(t.fin, minutes(heure) - minutes(t.heure)) : t.fin;
  await db.taches.update(t.id, { heure, ...(t.fin ? { fin } : {}) });
  toast(`À ${heureFr(heure)} maintenant`, { action: { label: "Annuler", onClick: () => db.taches.update(t.id, avant) } });
}
