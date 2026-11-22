import { describe, expect, it } from "vitest";
import { auJour } from "../../lib/dates";
import type { Tache } from "../../lib/types";
import { construireResume } from "../../lib/resume";
import { duJour, joursAVenir, proposerDeplacement } from "./semaine";

const now = new Date("2026-11-22T08:00:00");
let n = 0;
const t = (x: Partial<Tache>): Tache => ({ id: "t" + ++n, titre: "Tâche " + n, qui: "moi", jour: auJour(0, now), heure: "", niveau: null, repete: "", note: "", fait: null, faitLe: null, cree: n, ...x });
const noms = { moi: "Melo", elle: "Sarah" };

describe("planning de la semaine", () => {
  it("donne sept jours à partir d'aujourd'hui", () => {
    const j = joursAVenir(now);
    expect(j).toHaveLength(7);
    expect(j[0]).toBe("2026-11-22");
    expect(j[6]).toBe("2026-11-28");
  });

  it("met ce qui est en retard dans aujourd'hui, trié par heure", () => {
    const liste = [t({ titre: "B", heure: "18:00" }), t({ titre: "A", heure: "09:00" }), t({ titre: "Retard", jour: auJour(-2, now) }), t({ titre: "Fait", fait: 1, faitLe: auJour(0, now) })];
    expect(duJour(liste, auJour(0, now), auJour(0, now)).map((x) => x.titre)).toEqual(["A", "B", "Retard"]);
  });

  it("propose d'alléger le jour le plus chargé, avec la chose la moins importante", () => {
    const mardi = auJour(2, now);
    const liste = [
      t({ titre: "Facture", jour: mardi, niveau: 2 }), t({ titre: "Ranger", jour: mardi, niveau: 0 }),
      t({ titre: "Dentiste", jour: mardi, heure: "09:00" }), t({ titre: "Courses", jour: mardi }),
    ];
    const p = proposerDeplacement(liste, ["moi", "elle"], now);
    expect(p?.tache.titre).toBe("Ranger");
    expect(p?.de).toBe(mardi);
    expect(p?.pour).toBe("moi");
  });

  it("ne propose rien quand la semaine est équilibrée", () => {
    expect(proposerDeplacement([t({ jour: auJour(1, now) }), t({ jour: auJour(3, now) })], ["moi"], now)).toBeNull();
  });
});

describe("résumé du matin", () => {
  it("raconte la journée de celui qui tient le téléphone", () => {
    const liste = [
      t({ titre: "Vétérinaire", qui: "nous", heure: "10:00" }),
      t({ titre: "Payer la facture", niveau: 2 }),
      t({ titre: "Arroser les plantes", qui: "elle" }),
      t({ titre: "Dentiste", jour: auJour(2, now), heure: "09:00" }),
    ];
    const r = construireResume(liste, noms, "moi", now);
    expect(r.sections.map((s) => s.id)).toEqual(["agenda", "important", "autre", "semaine"]);
    expect(r.phrase).toContain("2 choses pour toi, dont 1 rendez-vous, le premier à 10 h");
    expect(r.sections[2].titre).toBe("Sarah aujourd'hui");
    expect(r.texteLu.startsWith("Bonjour Melo.")).toBe(true);
  });

  it("vu du téléphone de Sarah, l'autre est Melo", () => {
    const r = construireResume([t({ titre: "Sortir les poubelles", qui: "moi" })], noms, "elle", now);
    expect(r.sections.map((s) => s.titre)).toEqual(["Melo aujourd'hui"]);
    expect(r.phrase).toBe("Rien pour toi aujourd'hui.");
  });
});
