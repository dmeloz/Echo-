// Réduire une photo avant de la ranger sur le téléphone (1600 px max, JPEG) :
// une photo d'iPhone passe de ~4 Mo à ~300 Ko.
export async function reduirePhoto(fichier: File, max = 1600): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(fichier);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.82));
    return blob ?? fichier;
  } catch {
    return fichier;
  }
}
