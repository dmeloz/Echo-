import { toast } from "sonner";
import type { Tache } from "../lib/types";
import { db, type Photo } from "./db";

// Sauvegarde en un fichier : les tâches, les photos et les réglages.
// En attendant la synchro, c'est le moyen de garder ses données ou de les copier sur un autre téléphone.

interface Fichier { app: "echo"; version: 1; exporteLe: string; taches: Tache[]; photos: Array<Omit<Photo, "blob"> & { data: string }>; reglages: Array<{ cle: string; valeur: unknown }> }

const versTexte = (b: Blob) => new Promise<string>((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = ko; r.readAsDataURL(b); });
const versBlob = async (data: string) => (await fetch(data)).blob();

export async function exporter() {
  const [taches, photos, reglages] = await Promise.all([db.taches.toArray(), db.photos.toArray(), db.reglages.toArray()]);
  const f: Fichier = {
    app: "echo", version: 1, exporteLe: new Date().toISOString(), taches,
    photos: await Promise.all(photos.map(async ({ blob, ...p }) => ({ ...p, data: await versTexte(blob) }))),
    // Le choix « téléphone de qui » reste propre à chaque téléphone.
    reglages: reglages.filter((r) => r.cle !== "proprio" && r.cle !== "guideVu"),
  };
  const nom = `echo-sauvegarde-${f.exporteLe.slice(0, 10)}.json`;
  const fichier = new File([JSON.stringify(f)], nom, { type: "application/json" });
  // Sur iPhone : la feuille de partage (Enregistrer dans Fichiers, AirDrop, Messages…).
  if (navigator.canShare?.({ files: [fichier] })) {
    try { await navigator.share({ files: [fichier], title: "Sauvegarde Echo" }); return; }
    catch (e) { if ((e as Error).name === "AbortError") return; }
  }
  const url = URL.createObjectURL(fichier);
  const a = Object.assign(document.createElement("a"), { href: url, download: nom });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  toast("Sauvegarde téléchargée");
}

export async function importer(fichier: File) {
  let f: Fichier;
  try { f = JSON.parse(await fichier.text()); }
  catch { toast("Ce fichier n'est pas une sauvegarde Echo"); return; }
  if (f?.app !== "echo" || !Array.isArray(f.taches)) { toast("Ce fichier n'est pas une sauvegarde Echo"); return; }
  const photos = await Promise.all((f.photos || []).map(async ({ data, ...p }) => ({ ...p, blob: await versBlob(data) })));
  await db.transaction("rw", db.taches, db.photos, db.reglages, async () => {
    await db.taches.bulkPut(f.taches);     // même tâche = remplacée, nouvelle = ajoutée
    await db.photos.bulkPut(photos);
    await db.reglages.bulkPut((f.reglages || []).filter((r) => r.cle !== "proprio" && r.cle !== "guideVu"));
  });
  toast(`${f.taches.length} tâche${f.taches.length > 1 ? "s" : ""} récupérée${f.taches.length > 1 ? "s" : ""}`);
}
