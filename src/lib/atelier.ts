// L'atelier de design (outil de travail, publié à part de l'app) : ses réglages, et le CSS qu'ils donnent.
export const CLE_BROUILLON = "echo-atelier";

export type Etat = {
  jetons: Record<string, string>;                 // --bleu → #2f6bff
  regles: Record<string, Record<string, string>>; // .g → { border-radius: 20px }
  libre: string;                                  // CSS écrit à la main
};
export const VIDE: Etat = { jetons: {}, regles: {}, libre: "" };

/** Le CSS des changements. `force` : pour l'aperçu, chaque réglage passe devant les règles de l'app. */
export function cssDe(e: Etat, force = false): string {
  const blocs: string[] = [];
  const j = Object.entries(e.jetons);
  if (j.length) blocs.push(`:root {\n${j.map(([n, v]) => `  ${n}: ${v};`).join("\n")}\n}`);
  for (const [sel, props] of Object.entries(e.regles)) {
    const p = Object.entries(props);
    if (p.length) blocs.push(`${sel} {\n${p.map(([n, v]) => `  ${n}: ${v}${force ? " !important" : ""};`).join("\n")}\n}`);
  }
  if (e.libre.trim()) blocs.push(e.libre.trim());
  return blocs.join("\n\n");
}

export function nombreDeChangements(e: Etat): number {
  return Object.keys(e.jetons).length + Object.values(e.regles).reduce((n, p) => n + Object.keys(p).length, 0) + (e.libre.trim() ? 1 : 0);
}

export type Couleur = { hex: string; a: number };

/** Lit #abc, #aabbcc, #aabbccdd, rgb(1 2 3 / .5), rgba(1, 2, 3, .5). Rend null si ce n'est pas une couleur simple. */
export function lireCouleur(v: string): Couleur | null {
  const s = v.trim().toLowerCase();
  if (s === "transparent") return { hex: "#ffffff", a: 0 };
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    if (h.length !== 6 && h.length !== 8) return null;
    return { hex: "#" + h.slice(0, 6), a: h.length === 8 ? Math.round(parseInt(h.slice(6), 16) / 2.55) / 100 : 1 };
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (!m) return null;
  const hex = "#" + [m[1], m[2], m[3]].map((n) => Math.max(0, Math.min(255, Math.round(Number(n)))).toString(16).padStart(2, "0")).join("");
  const a = m[4] == null ? 1 : m[4].endsWith("%") ? Number(m[4].slice(0, -1)) / 100 : Number(m[4]);
  return { hex, a };
}

export function ecrireCouleur({ hex, a }: Couleur): string {
  if (a >= 1) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${n >> 16} ${(n >> 8) & 255} ${n & 255} / ${Math.round(a * 100) / 100})`;
}
