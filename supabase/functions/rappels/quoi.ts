// Quels rappels envoyer maintenant ? Fichier sans dépendance : il sert à la fonction du serveur et aux tests.

export interface Abonne { id: string; place: "moi" | "elle"; fuseau: string; aLHeure: boolean; matin: string | null }
export interface TacheLue { id: string; titre: string; jour: string; heure: string; qui: "moi" | "elle" | "nous"; fait: number | null }
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

export function aEnvoyer(a: Abonne, taches: TacheLue[], now: Date): Envoi[] {
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
    const jour = miennes.filter((t) => t.jour <= ici.jour);
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
  return envois;
}
