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

async function envoyer(nom: string, blob: Blob) {
  const c = await chemin(nom);
  if (!c) return false;
  const { error } = await supa.storage.from(SEAU).upload(c, blob, { contentType: "image/jpeg", upsert: true });
  if (error) return false;
  const deja = await envoyees(); deja.add(nom);
  await db.reglages.put({ cle: ENVOYEES, valeur: [...deja].slice(-500) });
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
    if (data) { await db.photos.put({ id: nom, tacheId: clePhotos(p), blob: data, cree: Date.now() }); ici.push({ id: nom, tacheId: clePhotos(p), blob: data, cree: Date.now() }); }
  }
  return p.photos.flatMap((n) => { const x = ici.find((y) => y.id === n); return x ? [{ nom: n, blob: x.blob }] : []; });
}

// Retirer des photos : du téléphone et du serveur.
export async function oublierPhotos(noms: string[]) {
  if (!noms.length) return;
  await db.photos.bulkDelete(noms);
  const f = await lireFoyer();
  if (f) await supa.storage.from(SEAU).remove(noms.map((n) => `${f.id}/${n}`)).catch(() => {});
}

// Au démarrage de la page : les photos prises sans internet partent maintenant.
export async function envoyerEnAttente() {
  if (!(await lireFoyer())) return;
  const deja = await envoyees();
  const locales = await db.photos.filter((x) => x.tacheId.startsWith("papier:") && !deja.has(x.id)).toArray();
  for (const x of locales) await envoyer(x.id, x.blob);
}
