import { describe, expect, it } from "vitest";
import { codeFixe, completer, feriesVaud } from "./fixes";
import { phraseDe, type Horaire } from "./horaires";
import { compte, joursVacances, lundiDe, proposer, semainesDe } from "./vacances";
import type { Noms } from "./types";

const noms: Noms = { moi: "Dany", elle: "Sarah" };

describe("horaires fixes de Sarah", () => {
  it("connaît les jours fériés vaudois", () => {
    const f = feriesVaud(2027);
    expect([...f.keys()]).toEqual(["2027-01-01", "2027-01-02", "2027-03-26", "2027-03-29", "2027-05-06", "2027-05-17", "2027-08-01", "2027-09-20", "2027-12-25"]);
  });

  it("calcule chaque jour : travail en semaine, repos le week-end, férié", () => {
    expect(codeFixe("2026-11-26")).toBe("FIX"); // jeudi
    expect(codeFixe("2026-11-28")).toBe("R"); // samedi
    expect(codeFixe("2027-03-29")).toBe("FER"); // lundi de Pâques
    expect(phraseDe("FIX")).toBe("Travail · 7 h 30 – 17 h");
  });

  it("ajoute ses horaires seulement pour Sarah, et ce qui est posé passe devant", () => {
    const poses: Horaire[] = [{ qui: "elle", jour: "2026-11-27", code: "VAC" }];
    const h = completer(poses, noms, "2026-11-26", "2026-11-28");
    expect(h).toEqual(expect.arrayContaining([
      { qui: "elle", jour: "2026-11-26", code: "FIX" },
      { qui: "elle", jour: "2026-11-27", code: "VAC" },
      { qui: "elle", jour: "2026-11-28", code: "R" },
    ]));
    expect(h.filter((x) => x.qui === "moi")).toEqual([]);
    expect(h).toHaveLength(3);
  });
});

describe("vacances", () => {
  it("compte les semaines : 5 jours = une semaine, jamais plus d'une par semaine", () => {
    const l = "2027-07-19";
    const h: Horaire[] = [
      ...joursVacances(l, noms, "elle").map((jour) => ({ qui: "elle" as const, jour, code: "VAC" as const })),
      ...joursVacances(l, noms, "moi").map((jour) => ({ qui: "moi" as const, jour, code: "VAC" as const })),
    ];
    expect(joursVacances(l, noms, "elle")).toHaveLength(5);
    expect(joursVacances(l, noms, "moi")).toHaveLength(7);
    expect(compte(semainesDe(h, "elle", 2027))).toBe(1);
    expect(compte(semainesDe(h, "moi", 2027))).toBe(1);
    expect(lundiDe("2027-07-25")).toBe(l);
  });

  it("propose le reste : d'abord ensemble, puis Dany seul, sans reprendre une semaine prise", () => {
    const deja: Horaire[] = joursVacances("2027-07-19", noms, "elle").map((jour) => ({ qui: "elle" as const, jour, code: "VAC" as const }));
    const p = proposer(deja, noms, 2027);
    expect(p.some((x) => x.lundi === "2027-07-19")).toBe(false);
    const sem = (q: "moi" | "elle") => p.filter((x) => x.qui.includes(q)).length;
    expect(sem("elle")).toBe(3);
    expect(sem("moi")).toBe(6);
    expect(p.filter((x) => x.qui.length === 2)).toHaveLength(3);
    expect(p.every((x) => x.lundi.startsWith("2027"))).toBe(true);
  });
});
