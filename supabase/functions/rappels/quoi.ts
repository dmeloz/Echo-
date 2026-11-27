// Quels rappels envoyer maintenant ? Fichier sans dépendance : il sert à la fonction du serveur et aux tests.

export interface Abonne { id: string; place: "moi" | "elle"; fuseau: string; aLHeure: boolean; matin: string | null }
export interface TacheLue { id: string; titre: string; jour: string; heure: string; qui: "moi" | "elle" | "nous"; fait: number | null; evt?: boolean }
// Un papier du foyer (Maison → Papiers) : ce qu'il y a à faire, pour quand, et le montant en centimes s'il faut payer.
export interface PapierLu { id: string; titre: string; quoi: string; echeance?: string; fait?: string; montant?: number }
export interface Envoi { cle: string; titre: string; texte: string; tag: string }

export const FENETRE = 5; // minutes : un rappel part dans les 5 minutes qui suivent son heure (si un passage a été manqué)

const min = (h: string) => { const [a, b] = h.split(":").map(Number); return a * 60 + b; };
const heureFr = (h: string) => h.replace(":", " h ").replace(" h 00", " h");

// Le jour et l'heure chez la personne (son fuseau), pas ceux du serveur.
export function chezLui(now: Date, fuseau: string): { jour: string; minutes: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: fuseau, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).map((x) => [x.type, x.value]));
  return { jour: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
}

const due = (heure: string, maintenant: number) => { const e = maintenant - min(heure); return e >= 0 && e < FENETRE; };

// Un papier est rappelé le matin 7 jours avant, la veille, et le jour même. Les papiers sont à tout le foyer : chacun est prévenu.
export const AVANT_PAPIER = [7, 1, 0];
const QUOI_PAPIER: Record<string, string> = { payer: "à payer", renouveler: "à renouveler", resilier: "à résilier", repondre: "à répondre" };
const ecartJours = (de: string, a: string) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
const francs = (c: number) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")} CHF`;

export function aEnvoyer(a: Abonne, taches: TacheLue[], now: Date, papiers: PapierLu[] = []): Envoi[] {
  let ici: { jour: string; minutes: number };
  try { ici = chezLui(now, a.fuseau); } catch { ici = chezLui(now, "Europe/Zurich"); }
  const miennes = taches.filter((t) => !t.fait && (t.qui === a.place || t.qui === "nous"));
  const envois: Envoi[] = [];

  if (a.aLHeure) {
    for (const t of miennes) {
      if (t.jour !== ici.jour || !t.heure || !due(t.heure, ici.minutes)) continue;
      envois.push({ cle: `h|${a.id}|${t.id}|${t.jour}|${t.heure}`, titre: t.titre, texte: `C'est l'heure : ${heureFr(t.heure)}${t.qui === "nous" ? " · à faire à deux" : ""}`, tag: `tache-${t.id}` });
    }
  }

  if (a.matin && due(a.matin, ici.minutes)) {
    // Un rendez-vous n'a pas de case à cocher : seuls ceux du jour comptent (comme le résumé dans l'app).
    const jour = miennes.filter((t) => (t.evt ? t.jour === ici.jour : t.jour <= ici.jour));
    if (jour.length) {
      const premiere = [...jour].sort((x, y) => (x.heure ? min(x.heure) : 9999) - (y.heure ? min(y.heure) : 9999))[0];
      const n = jour.length;
      envois.push({
        cle: `m|${a.id}|${ici.jour}`,
        titre: n === 1 ? "Une chose à faire aujourd'hui" : `${n} choses à faire aujourd'hui`,
        texte: `${n === 1 ? "" : "En premier : "}${premiere.titre}${premiere.heure ? ` à ${heureFr(premiere.heure)}` : ""}`,
        tag: "matin",
      });
    }
  }
  if (a.matin && due(a.matin, ici.minutes)) {
    for (const p of papiers) {
      if (!p || typeof p.titre !== "string" || typeof p.quoi !== "string" || !Object.hasOwn(QUOI_PAPIER, p.quoi) || p.fait || typeof p.echeance !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.echeance)) continue;
      const n = ecartJours(ici.jour, p.echeance);
      if (!AVANT_PAPIER.includes(n)) continue;
      const quand = n === 0 ? "aujourd'hui" : n === 1 ? "demain" : `dans ${n} jours`;
      envois.push({
        cle: `p|${a.id}|${p.id}|${p.echeance}|${n}`,
        titre: `${p.titre} : ${QUOI_PAPIER[p.quoi]} ${quand}`,
        texte: p.quoi === "payer" && typeof p.montant === "number" && Number.isInteger(p.montant) && p.montant > 0 ? francs(p.montant) : "Dans Maison, Papiers",
        tag: `papier-${p.id}-${n}`, // un tag par rappel : celui du jour même sonne, même si celui de la veille est encore affiché
      });
    }
  }
  return envois;
}
