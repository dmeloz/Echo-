// Écrire un événement d'Echo dans iCloud, sans réseau direct : la requête CalDAV est donnée en paramètre (testé à part, src/lib/caldav.test.ts).
import { creerIcs, modifierIcs, type Champs } from "./caldav.ts";

export interface ReponseDav { status: number; ok: boolean; etag: string; texte: () => Promise<string> }
export type Dav = (methode: "GET" | "PUT", url: string, corps?: string, plus?: Record<string, string>) => Promise<ReponseDav>;
export class ErreurApple extends Error {}

// Changer un événement qui existe : on relit le fichier d'iCloud et on n'y remplace que le titre, la note et les dates.
// null : il n'existe pas (ou plus) à cette adresse.
async function changer(dav: Dav, href: string, c: Champs): Promise<{ href: string; etag: string } | null> {
  const avant = await dav("GET", href);
  if (avant.status === 404) return null;
  if (!avant.ok) throw new ErreurApple();
  const r = await dav("PUT", href, modifierIcs(await avant.texte(), c));
  if (!r.ok) throw new ErreurApple();
  return { href, etag: r.etag };
}

// href : l'adresse iCloud de l'événement s'il y est déjà. calendrier : où le créer sinon (appelé seulement s'il faut créer).
export async function ecrireEvenement(dav: Dav, c: Champs, href: string, calendrier: () => Promise<string>): Promise<{ href: string; etag: string }> {
  if (href) {
    const fait = await changer(dav, href, c);
    if (fait) return fait;
  }
  const cal = await calendrier();
  href = new URL(encodeURIComponent(c.uid) + ".ics", cal.endsWith("/") ? cal : cal + "/").href;
  const r = await dav("PUT", href, creerIcs(c), { "If-None-Match": "*" });
  if (r.ok) return { href, etag: r.etag };
  // 412 : l'événement est déjà là. La création d'avant avait réussi, mais sa réponse s'est perdue en route
  // (le téléphone n'a jamais su l'adresse et réessaie). Ce n'est pas une erreur : on le met à jour à cette adresse.
  if (r.status === 412) {
    const fait = await changer(dav, href, c);
    if (fait) return fait;
  }
  throw new ErreurApple();
}
