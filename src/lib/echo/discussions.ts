import { nouvelId } from "../dates";
import type { Message } from "./boucle";

// Les discussions avec Echo, comme dans l'app Claude : la discussion en cours survit à la fermeture de l'app,
// et les anciennes restent à relire (sur ce téléphone seulement : elles ne partent pas au foyer).

// Une ligne d'action montrée sous la réponse d'Echo, et ce qu'elle est devenue.
export type EtatAction = "fait" | "propose" | "oui" | "non" | "annule";
export interface LigneEchange { texte: string; etat: EtatAction }
export interface Echange { moi: string; echo: string; actions?: LigneEchange[] }
// suite : la conversation à renvoyer au serveur ; note : ce que l'app dira à Echo avant la phrase suivante.
export interface Fil { id: string; debut: number; quand: number; suite: Message[]; echanges: Echange[]; note?: string }
export interface Ancienne { id: string; debut: number; quand: number; echanges: Echange[] }

// Une discussion reste « en cours » 15 minutes après le dernier message : pendant ce temps, tout ce qu'on écrit va à Echo.
export const REPRISE = 15 * 60_000;
// Passé ce délai, Echo reçoit quand même un rappel de la discussion précédente (« et pour demain soir ? »).
export const RAPPEL = 6 * 3600_000;
export const MAX_ECHANGES = 40;
export const MAX_ANCIENNES = 20;
const CLE = "echo-discussion";
const CLE_ANCIENNES = "echo-discussions";

const lire = <T>(cle: string, defaut: T): T => {
  try { const v = localStorage.getItem(cle); return v ? (JSON.parse(v) as T) : defaut; } catch { return defaut; }
};
const ecrire = (cle: string, v: unknown) => {
  try { if (v == null) localStorage.removeItem(cle); else localStorage.setItem(cle, JSON.stringify(v)); }
  catch { /* stockage plein ou fermé : la discussion vit le temps de l'app */ }
};

export const anciennes = (): Ancienne[] => {
  const l = lire<Ancienne[]>(CLE_ANCIENNES, []);
  return Array.isArray(l) ? l.filter((a) => a && Array.isArray(a.echanges)) : [];
};

// Ranger une discussion parmi les anciennes (la plus récente d'abord). Une discussion vide ne se garde pas.
export function archiver(f: Fil | null) {
  if (!f || !f.echanges.length) return;
  const l = anciennes().filter((a) => a.id !== f.id);
  l.unshift({ id: f.id, debut: f.debut, quand: f.quand, echanges: f.echanges.slice(-MAX_ECHANGES) });
  ecrire(CLE_ANCIENNES, l.slice(0, MAX_ANCIENNES));
}
export function oublierAncienne(id: string) { ecrire(CLE_ANCIENNES, anciennes().filter((a) => a.id !== id)); }

// La discussion en cours, relue au démarrage. Trop vieille : elle part chez les anciennes.
export function chargerFil(now = Date.now()): Fil | null {
  const f = lire<Fil | null>(CLE, null);
  if (!f || typeof f !== "object" || !Array.isArray(f.echanges) || !Array.isArray(f.suite)) return null;
  if (now - f.quand >= REPRISE) { archiver(f); ecrire(CLE, null); return null; }
  return f;
}
export function garderFil(f: Fil | null) { ecrire(CLE, f); }
export const nouveauFil = (now = Date.now()): Fil => ({ id: nouvelId(), debut: now, quand: now, suite: [], echanges: [] });

// Le rappel de la dernière discussion pour Echo, quand on lui reparle un peu plus tard (court : il part avec la phrase).
// toujours : une discussion qu'on reprend exprès, même vieille.
export function rappelDe(a: Ancienne | undefined, now = Date.now(), place = 700, toujours = false): string {
  if (!a || (!toujours && now - a.quand > RAPPEL) || !a.echanges.length) return "";
  const min = Math.max(1, Math.round((now - a.quand) / 60_000));
  const quand = min < 60 ? `il y a ${min} min` : min < 2880 ? `il y a ${Math.round(min / 60)} h` : `il y a ${Math.round(min / 1440)} jours`;
  const lignes: string[] = [];
  let reste = place - 80;
  for (const e of [...a.echanges].reverse()) {
    const l = `Toi : ${e.moi.replace(/\s+/g, " ").slice(0, 160)} / Echo : ${e.echo.replace(/\s+/g, " ").slice(0, 240)}`;
    if (l.length > reste) break;
    lignes.unshift(l);
    reste -= l.length + 3;
  }
  if (!lignes.length) return "";
  return `discussion précédente (${quand}), pour le contexte seulement : ${lignes.join(" | ")}`;
}

// Le titre d'une ancienne discussion : sa première phrase.
export const titreDe = (a: { echanges: Echange[] }) => {
  const p = a.echanges[0]?.moi.replace(/\s+/g, " ").trim() ?? "";
  return p.length > 60 ? `${p.slice(0, 57)}…` : p || "Discussion";
};
