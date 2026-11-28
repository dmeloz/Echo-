import { describe, expect, it } from "vitest";
import { aFermer, estSimple } from "./UnMessage";

describe("un seul message à la fois", () => {
  const v = (id: number, simple = true) => ({ id, arrive: id, simple });
  it("le plus récent remplace les simples informations d'avant", () => {
    expect(aFermer([v(3), v(2), v(1)])).toEqual([2, 1]);
    expect(aFermer([v(1), v(3), v(2)])).toEqual([1, 2]);
  });
  it("ne ferme jamais un message qui porte Annuler, même si un autre Annuler arrive", () => {
    expect(aFermer([v(2, false), v(1, false)])).toEqual([]);
    expect(aFermer([v(3), v(2, false), v(1)])).toEqual([1]);
  });
  it("rien à faire avec un seul message", () => { expect(aFermer([v(1)])).toEqual([]); });
  it("reconnaît ce qui compte", () => {
    const c = { className: "remplacable" };
    expect(estSimple({ id: 1, title: "Enregistré", ...c })).toBe(true);
    expect(estSimple({ id: 1, title: "Enregistré" })).toBe(false);
    expect(estSimple({ id: 1, title: "Plus aucune semaine libre à proposer." })).toBe(false);
    expect(estSimple({ id: 1, title: "Pain : ajouté", ...c, action: { label: "Annuler", onClick: () => {} } })).toBe(false);
    expect(estSimple({ id: 1, title: "Retiré", ...c, onDismiss: () => {} })).toBe(false);
    expect(estSimple({ id: 1, title: "Enregistré", ...c, onAutoClose: () => {} })).toBe(false);
    expect(estSimple({ id: 1, title: "Enregistré", ...c, duration: 7000 })).toBe(false);
  });
});
