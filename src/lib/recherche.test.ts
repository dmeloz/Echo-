import { describe, expect, it } from "vitest";
import type { Tache } from "./types";
import { chercherTaches } from "./recherche";

let n = 0;
const t = (x: Partial<Tache>): Tache => ({ id: "t" + ++n, titre: "Tâche", qui: "moi", jour: "2026-11-22", heure: "", niveau: null, repete: "", note: "", fait: null, faitLe: null, cree: n, ...x });

describe("recherche", () => {
  const liste = [t({ titre: "Prendre rendez-vous chez le vétérinaire" }), t({ titre: "Courses", note: "Penser au café" }), t({ titre: "Ranger", etapes: [{ id: "e", texte: "Le garage", fait: false }] })];
  it("ignore les accents et les majuscules", () => { expect(chercherTaches(liste, "VETERI").map((x) => x.titre)).toEqual(["Prendre rendez-vous chez le vétérinaire"]); });
  it("cherche aussi dans la note et les étapes", () => {
    expect(chercherTaches(liste, "cafe")).toHaveLength(1);
    expect(chercherTaches(liste, "garage")).toHaveLength(1);
  });
  it("ne renvoie rien pour une recherche vide", () => { expect(chercherTaches(liste, "  ")).toEqual([]); });
});
