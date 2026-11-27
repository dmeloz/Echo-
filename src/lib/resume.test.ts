import { describe, expect, it } from "vitest";
import { construireResume } from "./resume";
import type { Tache } from "./types";

const noms = { moi: "Dany", elle: "Sarah" };
const t = (p: Partial<Tache>): Tache => ({ id: p.titre!, titre: "", qui: "moi", jour: "2026-11-28", heure: "", niveau: null, repete: "", note: "", fait: null, faitLe: null, cree: 1, ...p }) as Tache;

describe("le résumé du soir (demain)", () => {
  const demainMatin = new Date("2026-11-28T06:00:00");
  it("parle de demain et ne compte pas ce qui reste d'aujourd'hui comme en retard", () => {
    const r = construireResume([t({ titre: "Dentiste", heure: "09:00" }), t({ titre: "Pain", jour: "2026-11-27" })], noms, "moi", demainMatin, undefined, true);
    expect(r.phrase).toContain("pour toi");
    expect(r.sections.find((s) => s.id === "agenda")?.titre).toBe("Ton agenda de demain");
    expect(r.sections.find((s) => s.id === "important")?.phrase).not.toContain("retard");
    expect(r.texteLu.startsWith("Bonsoir Dany.")).toBe(true);
    expect(r.phrase.startsWith("Demain, journée")).toBe(true);
  });
  it("le soir, les jours suivants portent leur nom (pas « demain »)", () => {
    const r = construireResume([t({ titre: "Coiffeur", jour: "2026-11-29" })], noms, "moi", demainMatin, undefined, true);
    expect(r.sections.find((s) => s.id === "semaine")?.lignes[0].heure).toBe("Dimanche");
  });
  it("le matin, rien ne change", () => {
    const r = construireResume([], noms, "moi", new Date("2026-11-28T08:00:00"));
    expect(r.phrase).toBe("Rien de prévu aujourd'hui. Profite.");
  });
});
