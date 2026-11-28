import { describe, expect, it } from "vitest";
import { fusionner3, pareil } from "./fusion";

describe("fusion champ par champ", () => {
  const base = { id: "a", titre: "Pain", note: "", heure: "" };
  it("garde les changements des deux quand ils ne touchent pas le même champ", () => {
    expect(fusionner3(base, { ...base, heure: "18:00" }, { ...base, titre: "Pain complet" })).toEqual({ resultat: { ...base, heure: "18:00", titre: "Pain complet" }, conflits: [] });
  });
  it("même champ, même valeur : pas de conflit ; valeurs différentes : celle d'ici, et le champ est signalé", () => {
    expect(fusionner3(base, { ...base, note: "x" }, { ...base, note: "x" }).conflits).toEqual([]);
    expect(fusionner3(base, { ...base, note: "ici" }, { ...base, note: "là" })).toEqual({ resultat: { ...base, note: "ici" }, conflits: ["note"] });
  });
  it("un champ retiré d'un côté est retiré ; un champ ajouté d'un côté est ajouté", () => {
    const b = { id: "a", fin: "16:00" };
    expect(fusionner3(b, { id: "a" }, { ...b, ordre: 2 }).resultat).toEqual({ id: "a", ordre: 2 });
  });
  it("les étapes se fusionnent une par une (cochée ici, ajoutée là, retirée là)", () => {
    const e = (id: string, fait = false, texte = id) => ({ id, texte, fait });
    const r = fusionner3({ id: "a", etapes: [e("1"), e("2"), e("3")] }, { id: "a", etapes: [e("1", true), e("2"), e("3"), e("4")] }, { id: "a", etapes: [e("1"), e("3", false, "trois"), e("5")] });
    expect(r).toEqual({ resultat: { id: "a", etapes: [e("1", true), e("3", false, "trois"), e("4"), e("5")] }, conflits: [] });
    // La même étape changée différemment des deux côtés : celle d'ici, et « etapes » est signalé.
    expect(fusionner3({ etapes: [e("1")] }, { etapes: [e("1", false, "ici")] }, { etapes: [e("1", false, "là")] })).toEqual({ resultat: { etapes: [e("1", false, "ici")] }, conflits: ["etapes"] });
    // Toutes retirées : le champ disparaît.
    expect(fusionner3({ etapes: [e("1"), e("2")] }, { etapes: [e("2")] }, { etapes: [e("1")] }).resultat).toEqual({});
  });
  it("pareil : l'ordre des champs et un champ absent ou vide ne comptent pas", () => {
    expect(pareil({ a: 1, b: undefined, c: [{ x: 1 }] }, { c: [{ x: 1 }], a: 1 })).toBe(true);
    expect(pareil({ a: 1 }, { a: 2 })).toBe(false);
    expect(pareil([1, 2], [1])).toBe(false);
  });
});
