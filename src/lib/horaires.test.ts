import { describe, expect, it } from "vitest";
import { construireResume } from "./resume";
import { bilanMois, decalageLundi, heuresDe, joursDuMois, lireSuite, moisVoisin, phraseDe, type Horaire } from "./horaires";

describe("horaires de travail", () => {
  it("connaît les jours du mois et où tombe le 1er", () => {
    expect(joursDuMois("2026-12")).toHaveLength(31);
    expect(joursDuMois("2027-02").at(-1)).toBe("2027-02-28");
    expect(decalageLundi("2026-12")).toBe(1); // le 1er décembre 2026 est un mardi
    expect(moisVoisin("2026-12", 1)).toBe("2027-01");
  });

  it("dit les heures comme sur la fiche", () => {
    expect(heuresDe("C1")).toBe("9 h – 14 h et 18 h 30 – 22 h 30");
    expect(phraseDe("C5")).toBe("Travail C5 · 8 h – 16 h 30");
    expect(phraseDe("VAC")).toBe("Vacances");
    expect(phraseDe("FOR")).toBe("Travail · Formation");
  });

  it("lit un mois écrit d'un coup, jour après jour", () => {
    const r = lireSuite("C5 c6 C1/8H R repos - vac zz", "2026-12");
    expect(r.jours).toEqual([["2026-12-01", "C5"], ["2026-12-02", "C6"], ["2026-12-03", "C1"], ["2026-12-04", "R"], ["2026-12-05", "R"], ["2026-12-07", "VAC"]]);
    expect(r.inconnus).toEqual(["zz"]);
  });

  it("fait le bilan du mois", () => {
    const h: Horaire[] = [{ qui: "moi", jour: "2026-12-01", code: "C5" }, { qui: "moi", jour: "2026-12-02", code: "C1" }, { qui: "moi", jour: "2026-12-25", code: "VAC" }, { qui: "moi", jour: "2027-01-02", code: "C5" }];
    expect(bilanMois(h, "2026-12")).toEqual({ travail: 2, vacances: 1, repos: 0, heures: 17.5 });
  });
});

describe("résumé du matin avec les horaires", () => {
  const now = new Date("2026-12-01T07:00:00");
  it("place le travail dans l'agenda et le dit en premier", () => {
    const r = construireResume([], { moi: "Melo", elle: "Sarah" }, "moi", now, "C1");
    expect(r.phrase.startsWith("Tu travailles de 9 h à 14 h puis de 18 h 30 à 22 h 30.")).toBe(true);
    expect(r.sections[0].lignes.map((l) => l.heure)).toEqual(["9 h", "18 h 30"]);
  });
  it("dit les vacances", () => {
    expect(construireResume([], { moi: "Melo", elle: "Sarah" }, "moi", now, "VAC").phrase).toBe("Tu es en vacances. Rien de prévu aujourd'hui. Profite.");
  });
});
