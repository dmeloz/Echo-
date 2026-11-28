import { describe, expect, it } from "vitest";
import { propositions, type Lecture } from "./lecture";

describe("lecture de la fiche", () => {
  it("ne garde que les jours lus avec un code connu, datés dans le mois", () => {
    const l: Lecture = { ligne_trouvee: true, nom_lu: "X", mois_concorde: true, remarque: "", nbJours: 31, jours: [
      { jour: 1, code: "C5", sur: true }, { jour: 2, code: "AUTRE", sur: true }, { jour: 3, code: "VIDE", sur: false },
      { jour: 18, code: "C6", sur: false }, { jour: 40, code: "C1", sur: true },
    ] };
    expect(propositions(l, "2026-12")).toEqual([{ jour: "2026-12-01", code: "C5", sur: true }, { jour: "2026-12-18", code: "C6", sur: false }]);
  });
});
