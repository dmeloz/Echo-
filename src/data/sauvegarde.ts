import { toast } from "sonner";
import type { Tache } from "../lib/types";
import { nettoyerNoms, nettoyerTache } from "../lib/valider";
import { NOMS_DEFAUT, db, type Photo } from "./db";
import { CODES, type Horaire } from "../lib/horaires";

// Sauvegarde en un fichier : les tâches, les photos et les réglages.
// En attendant la synchro, c'est le moyen de garder ses données ou de les copier sur un autre téléphone.

interface Fichier { app: "echo"; version: 1; exporteLe: string; taches: Tache[]; photos: Array<Omit<Photo, "blob"> & { data: string }>; reglages: Array<{ cle: string; valeur: unknown }>; horaires?: Horaire[] }

const versTexte = (b: Blob) => new Promise<string>((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = ko; r.readAsDataURL(b); });
const versBlob = async (data: string) => (await fetch(data)).blob();

export async function exporter() {
  const [taches, photos, reglages, horaires] = await Promise.all([db.taches.toArray(), db.photos.toArray(), db.reglages.toArray(), db.horaires.toArray()]);
  const f: Fichier = {
    app: "echo", version: 1, exporteLe: new Date().toISOString(), taches, horaires,
    photos: await Promise.all(photos.map(async ({ blob, ...p }) => ({ ...p, data: await versTexte(blob) }))),
    // Le choix « téléphone de qui » reste propre à chaque téléphone.
    reglages: reglages.filter((r) => !["proprio", "guideVu", "codeEcho", "nomFiche", "trajets", "echoRetours"].includes(r.cle)),
  };
  const nom = `echo-sauvegarde-${f.exporteLe.slice(0, 10)}.json`;
  const fichier = new File([JSON.stringify(f)], nom, { type: "application/json" });
  // Sur iPhone : la feuille de partage (Enregistrer dans Fichiers, AirDrop, Messages…).
  if (navigator.canShare?.({ files: [fichier] })) {
    try { await navigator.share({ files: [fichier], title: "Sauvegarde Echo" }); return; }
    catch (e) { if ((e as Error).name === "AbortError") return; } // autre souci : on passe au téléchargement
  }
  const url = URL.createObjectURL(fichier);
  const a = Object.assign(document.createElement("a"), { href: url, download: nom });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  toast("Sauvegarde téléchargée");
}

const REGLAGES_PARTAGES = ["noms", "modulesMasques"]; // le reste est propre à chaque téléphone

export async function importer(fichier: File) {
  const refus = () => toast("Ce fichier n'est pas une sauvegarde Echo. Choisis un fichier « echo-sauvegarde ».", { duration: 6000 });
  let f: Partial<Fichier>;
  try { f = JSON.parse(await fichier.text()); } catch { return refus(); }
  if (f?.app !== "echo" || !Array.isArray(f.taches)) return refus();
  // Tout ce qui vient du fichier est nettoyé : une ligne abîmée est laissée de côté, pas le reste.
  const taches = f.taches.map((t) => nettoyerTache(t)).filter((t): t is Tache => !!t);
  const connues = new Set(taches.map((t) => t.id));
  const photos: Photo[] = [];
  for (const p of Array.isArray(f.photos) ? f.photos : []) {
    if (!p || typeof p.id !== "string" || !connues.has(p.tacheId) || typeof p.data !== "string" || !p.data.startsWith("data:image/")) continue;
    try { photos.push({ id: p.id, tacheId: p.tacheId, cree: Number(p.cree) || Date.now(), blob: await versBlob(p.data) }); } catch { /* photo illisible : on continue */ }
  }
  const reglages = (Array.isArray(f.reglages) ? f.reglages : [])
    .filter((r) => r && REGLAGES_PARTAGES.includes(r.cle))
    .map((r) => r.cle === "noms" ? { cle: r.cle, valeur: nettoyerNoms(r.valeur, NOMS_DEFAUT) } : { cle: r.cle, valeur: Array.isArray(r.valeur) ? r.valeur.filter((x) => typeof x === "string") : [] });
  const horaires = (Array.isArray(f.horaires) ? f.horaires : []).filter((h): h is Horaire =>
    !!h && (h.qui === "moi" || h.qui === "elle") && typeof h.jour === "string" && /^\d{4}-\d{2}-\d{2}$/.test(h.jour) && typeof h.code === "string" && h.code in CODES)
    .map(({ qui, jour, code }) => ({ qui, jour, code }));
  try {
    await db.transaction("rw", [db.taches, db.photos, db.reglages, db.horaires], async () => {
      await db.horaires.bulkPut(horaires);
      await db.taches.bulkPut(taches);     // même tâche = remplacée, nouvelle = ajoutée
      await db.photos.bulkPut(photos);
      await db.reglages.bulkPut(reglages);
    });
  } catch {
    toast("La sauvegarde n'a pas pu être récupérée. Rien n'a changé. Libère un peu de stockage, puis réessaie.", { duration: 7000 });
    return;
  }
  const ecartees = f.taches.length - taches.length;
  toast(`${taches.length} tâche${taches.length > 1 ? "s" : ""} récupérée${taches.length > 1 ? "s" : ""}${ecartees ? ` (${ecartees} illisible${ecartees > 1 ? "s" : ""} laissée${ecartees > 1 ? "s" : ""} de côté)` : ""}`);
}
