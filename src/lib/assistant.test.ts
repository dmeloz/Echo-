import { describe, expect, it } from "vitest";
import { contexte, versBrouillon, type TacheEcho } from "./assistant";
import type { Tache } from "./types";

const base: TacheEcho = { titre: "Dentiste", jour: "2026-11-27", heure: "15:00", qui: "elle", repete: "", important: false, evenement: true, fin: "16:00", etapes: [] };

describe("assistant Echo", () => {
  it("un rendez-vous devient un événement avec sa fin", () => {
    expect(versBrouillon(base)).toEqual({ titre: "Dentiste", qui: "elle", jour: "2026-11-27", heure: "15:00", repete: "", niveau: null, note: "", evt: true, fin: "16:00" });
  });
  it("une tâche importante avec étapes garde ses étapes et le niveau important", () => {
    const b = versBrouillon({ ...base, heure: "", evenement: false, fin: "", important: true, etapes: ["Pain", "Lait"] });
    expect(b.niveau).toBe(2);
    expect(b.evt).toBeUndefined();
    expect(b.etapes?.map((e) => [e.texte, e.fait])).toEqual([["Pain", false], ["Lait", false]]);
    expect(new Set(b.etapes?.map((e) => e.id)).size).toBe(2);
  });
  it("un événement sans heure reste une tâche", () => {
    expect(versBrouillon({ ...base, heure: "", fin: "" }).evt).toBeUndefined();
  });
  it("le contexte ne garde que les 14 prochains jours, sans les faites ni les exemples", () => {
    const t = (o: Partial<Tache>): Tache => ({ id: Math.random().toString(), titre: "x", qui: "moi", jour: "2026-11-26", heure: "", niveau: null, repete: "", note: "secret", fait: null, faitLe: null, cree: 0, ...o });
    const now = new Date(2026, 10, 26, 10);
    const c = contexte([t({ titre: "A", heure: "09:00" }), t({ titre: "B", fait: 1 }), t({ titre: "C", ex: true }), t({ titre: "D", jour: "2026-12-30" }), t({ titre: "E", jour: "2026-11-25" })], now);
    expect(c).toEqual([{ titre: "A", jour: "2026-11-26", heure: "09:00", qui: "moi" }]);
  });
});
