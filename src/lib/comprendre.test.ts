import { describe, expect, it } from "vitest";
import { comprendre } from "./comprendre";
import { niveauPropose } from "./importance";

const samedi = new Date("2026-11-21T17:00:00");
const noms = { moi: "Melo", elle: "Sarah" };

describe("comprendre", () => {
  it("jour, heure et pour qui", () => {
    expect(comprendre("Appeler la banque demain 10h pour nous", noms, samedi)).toMatchObject({ titre: "Appeler la banque", jour: "2026-11-22", heure: "10:00", qui: "nous" });
  });
  it("chaque mardi à 20h30", () => {
    expect(comprendre("sortir les poubelles chaque mardi à 20h30", noms, samedi)).toMatchObject({ titre: "Sortir les poubelles", jour: "2026-11-24", heure: "20:30", repete: "semaine" });
  });
  it("prénom de Sarah et « heures »", () => {
    expect(comprendre("Médecin vendredi à 9 heures pour Sarah", noms, samedi)).toMatchObject({ titre: "Médecin", jour: "2026-11-27", heure: "09:00", qui: "elle" });
  });
  it("ce soir et urgent", () => {
    expect(comprendre("rappeler maman ce soir urgent", noms, samedi)).toMatchObject({ titre: "Rappeler maman", heure: "19:00", niveau: 2 });
  });
  it("le même jour de la semaine = la semaine prochaine", () => {
    expect(comprendre("courses samedi", noms, samedi).jour).toBe("2026-11-28");
  });
});

describe("importance proposée", () => {
  it("facture = important", () => expect(niveauPropose({ titre: "Payer la facture", jour: "2026-11-21", heure: "" }, samedi)).toBe(2));
  it("un jour = plus tard", () => expect(niveauPropose({ titre: "Trier les papiers, un jour", jour: "2026-11-21", heure: "" }, samedi)).toBe(0));
  it("heure dans moins de 2 h = important", () => expect(niveauPropose({ titre: "Vétérinaire", jour: "2026-11-21", heure: "18:30" }, samedi)).toBe(2));
  it("en retard = monte d'un cran", () => expect(niveauPropose({ titre: "Arroser", jour: "2026-11-20", heure: "" }, samedi)).toBe(2));
});
