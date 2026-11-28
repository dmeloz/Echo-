export const z = (n: number) => String(n).padStart(2, "0");
export const iso = (d: Date) => `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
export const auJour = (decalage = 0, base = new Date()) => {
  const d = new Date(base);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + decalage);
  return iso(d);
};
export const plusJours = (jour: string, n: number) => {
  const d = new Date(jour + "T12:00:00");
  d.setDate(d.getDate() + n);
  return iso(d);
};
export const plusMois = (jour: string, n: number) => {
  const [a, m, j] = jour.split("-").map(Number);
  const dernier = new Date(a, m - 1 + n + 1, 0).getDate(); // dernier jour du mois d'arrivée
  return iso(new Date(a, m - 1 + n, Math.min(j, dernier), 12));
};
export const minutes = (h: string) => {
  const [a, b] = h.split(":").map(Number);
  return a * 60 + b;
};
export const heureFr = (h: string) => h.replace(":", " h ").replace(" h 00", " h");
export function libelleJour(jour: string, now = new Date()) {
  if (jour === auJour(0, now)) return "Aujourd'hui";
  if (jour === auJour(1, now)) return "Demain";
  if (jour === auJour(-1, now)) return "Hier";
  const txt = new Date(jour + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}
export const sansAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const nouvelId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
