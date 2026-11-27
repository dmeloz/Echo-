import { reduirePhoto } from "../photos";
import { MAX_PHOTO } from "../../../supabase/functions/_shared/echo-outils";

// Une photo pour Echo (un courrier, le frigo, un mot écrit à la main) : réduite sur le téléphone, puis envoyée avec la phrase.
// Elle n'est gardée nulle part : ni sur le téléphone, ni sur le serveur, ni dans la discussion.
async function enBase64(b: Blob) {
  const o = new Uint8Array(await b.arrayBuffer());
  let s = "";
  for (let i = 0; i < o.length; i += 0x8000) s += String.fromCharCode(...o.subarray(i, i + 0x8000));
  return btoa(s);
}

// La photo prête à partir (JPEG en base64), ou null si le téléphone n'a pas pu la lire.
// 1400 px suffisent pour lire une lettre ; si elle pèse encore trop, on la réduit davantage.
export async function preparerPhoto(fichier: File, reduire = reduirePhoto): Promise<string | null> {
  for (const max of [1400, 1000, 700]) {
    const b = await reduire(fichier, max);
    if (b.type !== "image/jpeg") return null; // la réduction a échoué (format que le téléphone ne sait pas ouvrir)
    const d = await enBase64(b).catch(() => "");
    if (d && d.length <= MAX_PHOTO) return d;
  }
  return null;
}
