import { describe, expect, it } from "vitest";
import { reordonner, triJour } from "./ordre";
import type { Tache } from "./types";

const now = new Date("2026-11-26T10:00:00");
const t = (id: string, x: Partial<Tache> = {}): Tache => ({ id, titre: id, qui: "moi", jour: "2026-11-26", heure: "", niveau: 1, repete: "", note: "", fait: null, faitLe: null, cree: id.charCodeAt(0), ...x });
const appliquer = (liste: Tache[], id: string, avant: string | null) => {
  const r = reordonner(liste, id, avant, now);
  return liste.map((x) => ({ ...x, ...r.find((y) => y.id === x.id) })).sort(triJour(now)).map((x) => x.id).join("");
};

describe("changer l'ordre à la main", () => {
  const liste = [t("a", { niveau: 2 }), t("b"), t("c"), t("d")];
  it("pose une tâche devant une autre", () => expect(appliquer(liste, "d", "b")).toBe("adbc"));
  it("pose tout en bas", () => expect(appliquer(liste, "b", null)).toBe("acdb"));
  it("tout en haut : elle devient importante, comme sa voisine", () => {
    expect(appliquer(liste, "c", "a")).toBe("cabd");
    expect(reordonner(liste, "c", "a", now).find((r) => r.id === "c")?.niveau).toBe(2);
  });
  it("reposée au même endroit : rien ne change", () => expect(reordonner(liste, "b", "c", now)).toEqual([]));
  it("le rang choisi passe avant l'heure, pas avant l'importance", () => {
    expect([t("x", { heure: "08:00" }), t("y", { ordre: 0 }), t("z", { niveau: 2, heure: "20:00" })].sort(triJour(now)).map((x) => x.id).join("")).toBe("zyx");
  });
});
