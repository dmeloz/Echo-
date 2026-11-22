import { describe, expect, it } from "vitest";
import { auJour, heureFr, libelleJour, plusJours } from "./dates";
import { niveauPropose } from "./importance";
import { tachesDuJour } from "./journee";
import type { Tache } from "./types";
import { nettoyerNoms, nettoyerTache, prochainJour } from "./valider";

const base: Tache = { id: "a", titre: "Test", qui: "moi", jour: "2026-11-21", heure: "", niveau: null, repete: "", note: "", fait: null, faitLe: null, cree: 1 };
const samedi = new Date("2026-11-21T10:00:00");

describe("nettoyerTache (fichier de sauvegarde)", () => {
  it("garde une tâche saine telle quelle", () => {
    expect(nettoyerTache({ ...base, heure: "09:30", niveau: 2, repete: "semaine" })).toMatchObject({ id: "a", heure: "09:30", niveau: 2, repete: "semaine" });
  });
  it("refuse ce qui n'est pas une tâche", () => {
    for (const x of [null, 3, "x", {}, { titre: "   " }, { titre: 12 }]) expect(nettoyerTache(x)).toBeNull();
  });
  it("répare les champs abîmés au lieu de planter", () => {
    const t = nettoyerTache({ titre: "Abîmée", jour: 42, heure: "25:99", qui: "voisin", niveau: 9, repete: "mois", note: null, fait: "oui", etapes: [{ texte: "ok" }, { texte: "" }, null] }, "2026-11-21")!;
    expect(t).toMatchObject({ jour: "2026-11-21", heure: "", qui: "moi", niveau: null, repete: "", note: "", fait: null, faitLe: null });
    expect(t.etapes).toHaveLength(1);
    expect(t.id).toBeTruthy();
  });
  it("coupe les textes trop longs", () => {
    expect(nettoyerTache({ titre: "x".repeat(500) })!.titre).toHaveLength(140);
  });
});

describe("nettoyerNoms", () => {
  const d = { moi: "Melo", elle: "Sarah" };
  it("garde des prénoms valides", () => expect(nettoyerNoms({ moi: " Max ", elle: "Zoé" }, d)).toEqual({ moi: "Max", elle: "Zoé" }));
  it("revient aux prénoms par défaut si c'est abîmé", () => {
    expect(nettoyerNoms(null, d)).toEqual(d);
    expect(nettoyerNoms({ moi: 3, elle: "" }, d)).toEqual(d);
  });
});

describe("tâches qui reviennent", () => {
  it("chaque jour : demain", () => expect(prochainJour("2026-11-21", "jour", "2026-11-21")).toBe("2026-11-22"));
  it("chaque semaine : dans 7 jours", () => expect(prochainJour("2026-11-21", "semaine", "2026-11-21")).toBe("2026-11-28"));
  it("en retard de longtemps : saute au prochain jour après aujourd'hui, même jour de semaine", () => {
    expect(prochainJour("2026-11-01", "semaine", "2026-11-21")).toBe("2026-11-22");
    expect(prochainJour("2026-11-01", "jour", "2026-11-21")).toBe("2026-11-22");
  });
  it("passe les fins de mois, d'année et le changement d'heure", () => {
    expect(plusJours("2026-12-31", 1)).toBe("2027-01-01");
    expect(plusJours("2028-02-28", 1)).toBe("2028-02-29");
    expect(plusJours("2026-10-24", 1)).toBe("2026-10-25");
    expect(plusJours("2026-10-25", 1)).toBe("2026-10-26");
  });
});

describe("la journée", () => {
  it("aujourd'hui = pas faites jusqu'à aujourd'hui (retards compris), et faites aujourd'hui", () => {
    const r = tachesDuJour([
      base, { ...base, id: "b", jour: "2026-11-19" }, { ...base, id: "c", jour: "2026-11-22" },
      { ...base, id: "d", fait: 1, faitLe: "2026-11-21" }, { ...base, id: "e", fait: 1, faitLe: "2026-11-20" },
    ], samedi);
    expect(r.ouvertes.map((t) => t.id)).toEqual(["a", "b"]);
    expect(r.faites.map((t) => t.id)).toEqual(["d"]);
  });
  it("juste avant et juste après minuit", () => {
    expect(auJour(0, new Date("2026-11-21T23:59:30"))).toBe("2026-11-21");
    expect(auJour(0, new Date("2026-11-22T00:00:30"))).toBe("2026-11-22");
  });
});

describe("importance proposée", () => {
  const p = (titre: string, x: Partial<Tache> = {}) => niveauPropose({ titre, jour: "2026-11-21", heure: "", ...x }, samedi);
  it("facture ou rendez-vous = important", () => { expect(p("Payer la facture")).toBe(2); expect(p("Vétérinaire")).toBe(2); });
  it("« un jour » = plus tard", () => expect(p("Trier le tiroir, un jour")).toBe(0));
  it("heure proche = important, heure lointaine = normal", () => { expect(p("Appeler", { heure: "11:00" })).toBe(2); expect(p("Appeler", { heure: "18:00" })).toBe(1); });
  it("en retard monte d'un cran", () => expect(p("Appeler", { jour: "2026-11-20" })).toBe(2));
});

describe("dates en clair", () => {
  it("dit aujourd'hui, demain, hier, puis le jour", () => {
    expect(libelleJour("2026-11-21", samedi)).toBe("Aujourd'hui");
    expect(libelleJour("2026-11-22", samedi)).toBe("Demain");
    expect(libelleJour("2026-11-20", samedi)).toBe("Hier");
    expect(libelleJour("2026-11-26", samedi)).toMatch(/^Jeudi 26/);
  });
  it("écrit l'heure à la française", () => { expect(heureFr("09:00")).toBe("09 h"); expect(heureFr("19:30")).toBe("19 h 30"); });
});
