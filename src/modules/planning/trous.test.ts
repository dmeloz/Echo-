import { describe, expect, it } from "vitest";
import { trous } from "./semaine";
import type { Tache } from "../../lib/types";

const t = (heure: string, fin = ""): Tache => ({ id: heure, titre: heure, qui: "moi", jour: "2026-11-28", heure, fin, niveau: null, repete: "", note: "", fait: null, faitLe: null, cree: 1 }) as Tache;

describe("les trous de la journée", () => {
  it("trouve les trous de 2 h ou plus entre 8 h et 21 h", () => {
    expect(trous([t("10:00"), t("16:00", "17:00")], 0)).toEqual([{ de: 8 * 60, a: 10 * 60 }, { de: 11 * 60, a: 16 * 60 }, { de: 17 * 60, a: 21 * 60 }]);
  });
  it("aujourd'hui, part de maintenant (arrondi à la demi-heure)", () => {
    expect(trous([], 19 * 60 + 10)).toEqual([]);
    expect(trous([], 17 * 60 + 10)).toEqual([{ de: 17 * 60 + 30, a: 21 * 60 }]);
  });
});
