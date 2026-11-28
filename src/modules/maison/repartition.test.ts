import { describe, expect, it } from "vitest";
import type { Horaire } from "../../lib/horaires";
import { nettoyerCorvee, pour, pourMoi, type Corvee, type Fait } from "./donnees";
import { minutesDeChacun, repartir } from "./repartition";

const now = new Date("2026-11-30T09:00:00"); // un lundi
const jour = (n: number) => new Date(Date.UTC(2026, 10, 30 + n)).toISOString().slice(0, 10);
const c = (x: Partial<Corvee>): Corvee => ({ id: x.nom ?? "c", nom: "c", piece: "", tous: 7, taille: 2, qui: "libre", fait: null, cree: now.getTime() - 30 * 86_400_000, ...x });
const travaille = (qui: "moi" | "elle", jours: number[], code: Horaire["code"] = "C5"): Horaire[] => jours.map((j) => ({ qui, jour: jour(j), code }));

describe("Maison : répartir la semaine", () => {
  it("compte combien de fois une corvée revient dans les 7 jours", () => {
    const p = repartir([c({ nom: "Vaisselle", tous: 1, taille: 1 }), c({ nom: "Sols", tous: 7, taille: 3 })], [], [], now);
    expect(Object.fromEntries(p.parts.map((x) => [x.corvee.nom, x.fois]))).toEqual({ Vaisselle: 7, Sols: 1 });
    expect(p.jusqu).toBe(jour(6));
  });
  it("donne plus à celui qui travaille moins cette semaine", () => {
    const corvees = ["A", "B", "C", "D", "E", "F"].map((nom) => c({ nom, taille: 3 }));
    const p = repartir(corvees, [...travaille("moi", [0, 1, 2, 3, 4, 5]), ...travaille("elle", [0])], [], now);
    const m = minutesDeChacun(p.parts);
    expect(m.elle).toBeGreaterThan(m.moi);
    expect(p.travail.moi).toBeGreaterThan(p.travail.elle);
  });
  it("sans horaires, partage à peu près moitié-moitié, et tient compte de ce qui a déjà été fait", () => {
    const corvees = ["A", "B", "C", "D"].map((nom) => c({ nom, taille: 2 }));
    expect(minutesDeChacun(repartir(corvees, [], [], now).parts)).toEqual({ moi: 30, elle: 30 });
    const faits: Fait[] = [{ id: "f", corvee: "x", nom: "x", par: "moi", quand: now.getTime() - 86_400_000, min: 240 }];
    const m = minutesDeChacun(repartir(corvees, [], faits, now).parts);
    expect(m.elle).toBeGreaterThan(m.moi);
  });
  it("laisse à sa personne une corvée donnée pour de bon, et ignore l'entretien et ce qui tombe plus tard", () => {
    const p = repartir([c({ nom: "Litière", qui: "elle" }), c({ nom: "Filtre", entretien: true }), c({ nom: "Cave", tous: 180, fait: now.getTime() })], [], [], now);
    expect(p.parts.map((x) => [x.corvee.nom, x.qui, x.fixe])).toEqual([["Litière", "elle", true]]);
  });
});

describe("Maison : une corvée prise pour la semaine", () => {
  it("compte pour la personne jusqu'au dernier jour, puis redevient libre", () => {
    const x = c({ pris: "elle", prisJusqu: jour(6) });
    expect(pour(x, now)).toBe("elle");
    expect(pourMoi(x, "moi", now)).toBe(false);
    expect(pour(x, new Date("2026-12-08T09:00:00"))).toBeNull();
  });
  it("une corvée donnée pour de bon garde sa personne", () => {
    expect(pour(c({ qui: "moi", pris: "elle", prisJusqu: jour(6) }), now)).toBe("moi");
  });
  it("passe la synchro, et une valeur abîmée est oubliée", () => {
    expect(nettoyerCorvee({ ...c({}), pris: "elle", prisJusqu: "2026-12-06" })).toMatchObject({ pris: "elle", prisJusqu: "2026-12-06" });
    expect(nettoyerCorvee({ ...c({}), pris: "lui", prisJusqu: "2026-12-06" })).not.toHaveProperty("pris");
  });
});
