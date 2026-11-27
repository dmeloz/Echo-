import { db } from "../../data/db";
import { supa } from "../../sync/client";
import { lireFoyer } from "../../sync/moteur";
import { clePhotos, type Papier } from "./donnees";

// Les photos des papiers : sur le téléphone (table photos), et sur le serveur du foyer (Supabase Storage, dossier du foyer,
// seuls ses membres y ont accès). Choix de Dany, 2026-11-27 : sur le serveur, on sécurisera ou migrera plus tard.
// Sans foyer ni internet, la photo reste sur le téléphone et part plus tard (envoyerEnAttente).
const SEAU = "papiers";
const chemin = async (nom: string) => { const f = await lireFoyer(); return f ? `${f.id}/${nom}` : null; };
const ENVOYEES = "maisonPhotosEnvoyees";
const envoyees = async () => new Set(((await db.reglages.get(ENVOYEES))?.valeur as string[] | undefined) ?? []);

// La liste des photos déjà sur le serveur : lue et écrite d'un seul geste, pour que deux envois en même temps ne s'effacent pas.
const noter = (f: (deja: Set<string>) => void) => db.transaction("rw", db.reglages, async () => { const deja = await envoyees(); f(deja); await db.reglages.put({ cle: ENVOYEES, valeur: [...deja] }); });

async function envoyer(nom: string, blob: Blob) {
  const c = await chemin(nom);
  if (!c) return false;
  const { error } = await supa.storage.from(SEAU).upload(c, blob, { contentType: "image/jpeg", upsert: true });
  if (error) return false;
  await noter((deja) => deja.add(nom));
  return true;
}

// Garder une photo d'un papier : sur le téléphone tout de suite, puis vers le serveur du foyer. Rend son nom.
export async function garderPhoto(p: Pick<Papier, "id">, blob: Blob, id: string): Promise<string> {
  const nom = `${id}.jpg`;
  await db.photos.put({ id: nom, tacheId: clePhotos(p), blob, cree: Date.now() });
  envoyer(nom, blob).catch(() => {});
  return nom;
}

// Les photos d'un papier, sur ce téléphone. Celles qui manquent (prises par l'autre) viennent du serveur.
export async function photosDe(p: Papier): Promise<Array<{ nom: string; blob: Blob }>> {
  const ici = await db.photos.where("tacheId").equals(clePhotos(p)).toArray();
  const manquent = p.photos.filter((n) => !ici.some((x) => x.id === n));
  for (const nom of manquent) {
    const c = await chemin(nom);
    if (!c) break;
    const { data } = await supa.storage.from(SEAU).download(c).catch(() => ({ data: null }));
    if (data) { await noter((deja) => deja.add(nom)); await db.photos.put({ id: nom, tacheId: clePhotos(p), blob: data, cree: Date.now() }); ici.push({ id: nom, tacheId: clePhotos(p), blob: data, cree: Date.now() }); }
  }
  return p.photos.flatMap((n) => { const x = ici.find((y) => y.id === n); return x ? [{ nom: n, blob: x.blob }] : []; });
}

// Retirer des photos : du téléphone et du serveur.
export async function oublierPhotos(noms: string[]) {
  if (!noms.length) return;
  await db.photos.bulkDelete(noms);
  await noter((deja) => noms.forEach((n) => deja.delete(n)));
  const f = await lireFoyer();
  if (f) await supa.storage.from(SEAU).remove(noms.map((n) => `${f.id}/${n}`)).catch(() => {});
}

// À l'ouverture de Papiers : les photos prises sans internet partent, et celles qu'aucun papier ne porte plus
// (papier ou photo retirés sur l'autre téléphone, message d'annulation balayé) quittent le téléphone et le serveur après un jour.
export async function envoyerEnAttente(now = Date.now()) {
  const gardees = new Set((await db.maison_papiers.toArray()).flatMap((p) => p.photos));
  const locales = await db.photos.filter((x) => x.tacheId.startsWith("papier:")).toArray();
  await oublierPhotos(locales.filter((x) => !gardees.has(x.id) && now - x.cree > 86_400_000).map((x) => x.id));
  if (!(await lireFoyer())) return;
  const deja = await envoyees();
  for (const x of locales) if (gardees.has(x.id) && !deja.has(x.id)) await envoyer(x.id, x.blob);
}
