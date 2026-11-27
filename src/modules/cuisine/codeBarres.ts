import { toast } from "sonner";
import { db } from "../../data/db";
import { nouvelId } from "../../lib/dates";
import { cleDe, codeValide, lireQuantite, type CodeConnu, type Lieu, type Produit } from "./donnees";

// Le code-barres : l'appareil photo lit le code, Open Food Facts (base libre de produits) donne le nom et la taille.
// Seul le numéro du code part sur internet. Un code inconnu se nomme à la main, et ce téléphone s'en souvient.

const BASE = "https://world.openfoodfacts.org/api/v2/product/";
const propre = (x: unknown, max: number) => (typeof x === "string" ? x.replace(/\s+/g, " ").trim().slice(0, max) : "");

export interface Trouve extends CodeConnu { connu: boolean }
export async function chercherProduit(code: string): Promise<Trouve> {
  const garde = await db.cuisine_codes.get(code);
  if (garde) return { ...garde, connu: true };
  const vide = { code, nom: "", qte: "", connu: false };
  if (!codeValide(code) || !navigator.onLine) return vide;
  try {
    const r = await fetch(`${BASE}${code}?fields=product_name_fr,product_name,quantity`, { signal: AbortSignal.timeout(8000) });
    const p = r.ok ? (await r.json())?.product : null;
    const nom = propre(p?.product_name_fr, 60) || propre(p?.product_name, 60);
    return nom ? { code, nom: nom.charAt(0).toUpperCase() + nom.slice(1), qte: propre(p?.quantity, 20), connu: true } : vide;
  } catch { return vide; }
}

// Ranger le produit scanné : un de plus s'il est déjà à cet endroit, sinon un nouveau produit. Annuler remet comme avant.
export async function rangerScanne(t: CodeConnu, lieu: Lieu) {
  const nom = t.nom.replace(/\s+/g, " ").trim().slice(0, 60), qte = lireQuantite(t.qte).qte;
  if (!nom) return;
  let avant: Produit | undefined, id = "";
  await db.transaction("rw", db.cuisine_stock, db.cuisine_codes, async () => {
    avant = (await db.cuisine_stock.toArray()).find((p) => !p.repas && p.lieu === lieu && cleDe(p.nom) === cleDe(nom));
    if (avant) { id = avant.id; await db.cuisine_stock.update(id, { nb: Math.min(99, (avant.nb ?? 1) + 1), reste: undefined }); }
    else { id = nouvelId(); await db.cuisine_stock.add({ id, nom, lieu, ...(qte ? { qte } : {}), cree: Date.now() }); }
    if (codeValide(t.code)) await db.cuisine_codes.put({ code: t.code, nom, qte: qte ?? "" });
  });
  const ancien = avant;
  toast(ancien ? `${nom} : un de plus au stock` : `${nom} : ajouté au stock`, { action: { label: "Annuler", onClick: () => (ancien ? db.cuisine_stock.put(ancien) : db.cuisine_stock.delete(id)) } });
}

// Le lecteur de codes : celui du téléphone s'il existe, sinon la bibliothèque (chargée seulement ici, avec son fichier servi par l'app).
type Lecteur = { detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue: string }>> };
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];
let lecteur: Promise<Lecteur> | null = null;
export function ouvrirLecteur(): Promise<Lecteur> {
  lecteur ??= (async () => {
    const natif = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => Lecteur }).BarcodeDetector;
    if (natif) try { return new natif({ formats: FORMATS }); } catch { /* formats pas pris en charge : on passe à la bibliothèque */ }
    const [{ BarcodeDetector, prepareZXingModule }, { default: wasm }] = await Promise.all([import("barcode-detector/ponyfill"), import("zxing-wasm/reader/zxing_reader.wasm?url")]);
    prepareZXingModule({ overrides: { locateFile: (chemin: string, dossier: string) => (chemin.endsWith(".wasm") ? wasm : dossier + chemin) } });
    return new BarcodeDetector({ formats: FORMATS as never }) as Lecteur;
  })();
  lecteur.catch(() => { lecteur = null; });
  return lecteur;
}
