import type { Code } from "./horaires";
import { entetesIA } from "../sync/client";

// Lire une photo de la fiche d'horaires : la photo part vers la fonction « lire-horaires » du projet Supabase d'Echo,
// qui la fait lire par Claude. La clé de l'IA reste sur le serveur ; l'app envoie seulement le code secret du foyer.

export const ADRESSE_LECTURE = "https://ewqvgayhptfwbpkxsaij.supabase.co/functions/v1/lire-horaires";

export interface JourLu { jour: number; code: Code | "AUTRE" | "VIDE"; sur: boolean }
export interface Lecture { ligne_trouvee: boolean; nom_lu: string; mois_concorde: boolean; jours: JourLu[]; remarque: string; nbJours: number }

const MESSAGES: Record<string, string> = {
  code: "Echo ne te reconnaît pas. Relie ce téléphone au foyer, ou vérifie le code dans « Réglages de la photo ».",
  limite: "Beaucoup de photos lues cette dernière heure. Réessaie un peu plus tard.",
  cle: "La lecture par photo n'est pas encore branchée (la clé de l'IA manque côté serveur).",
  image: "La photo n'a pas pu être lue. Reprends-la bien à plat, avec toute la fiche.",
  nom: "Écris ton nom tel qu'il est sur la fiche.",
  refus: "La photo n'a pas pu être lue. Essaie avec une autre photo.",
  occupe: "Le service est très demandé. Réessaie dans une minute.",
  lecture: "La lecture n'a pas abouti. Réessaie avec une photo plus nette.",
  service: "Le service de lecture ne répond pas. Réessaie dans un moment.",
};
export class ErreurLecture extends Error {}

// Réduit la photo (côté le plus long 2400 px, JPEG) : assez net pour lire un tableau, assez léger pour partir vite.
export async function preparerPhoto(fichier: File): Promise<{ data: string; type: "image/jpeg" }> {
  const bitmap = await createImageBitmap(fichier, { imageOrientation: "from-image" });
  const echelle = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const toile = document.createElement("canvas");
  toile.width = Math.round(bitmap.width * echelle);
  toile.height = Math.round(bitmap.height * echelle);
  toile.getContext("2d")!.drawImage(bitmap, 0, 0, toile.width, toile.height);
  bitmap.close();
  const url = toile.toDataURL("image/jpeg", 0.88);
  return { data: url.slice(url.indexOf(",") + 1), type: "image/jpeg" };
}

export async function lireFiche(p: { data: string; type: string; nom: string; mois: string; code: string }): Promise<Lecture> {
  let r: Response;
  try {
    r = await fetch(ADRESSE_LECTURE, {
      method: "POST",
      headers: await entetesIA(p.code),
      body: JSON.stringify({ image: p.data, type: p.type, nom: p.nom, mois: p.mois }),
    });
  } catch {
    throw new ErreurLecture("Pas de connexion. La lecture par photo a besoin d'internet.");
  }
  const corps = await r.json().catch(() => null);
  if (!r.ok || !corps) throw new ErreurLecture(MESSAGES[corps?.erreur] ?? MESSAGES.service);
  return corps as Lecture;
}

// Ce que la lecture propose pour le mois : seulement les jours lus avec un code que l'app connaît.
export function propositions(l: Lecture, mois: string): Array<{ jour: string; code: Code; sur: boolean }> {
  return l.jours
    .filter((j): j is JourLu & { code: Code } => j.code !== "AUTRE" && j.code !== "VIDE" && j.jour >= 1 && j.jour <= l.nbJours)
    .map((j) => ({ jour: `${mois}-${String(j.jour).padStart(2, "0")}`, code: j.code, sur: j.sur }));
}
