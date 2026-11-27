import { describe, expect, it } from "vitest";
import { aFermer } from "./UnMessage";

describe("un seul message à la fois", () => {
  const bouton = { label: "Annuler" };
  it("le plus récent remplace les anciens", () => {
    expect(aFermer([{ id: 3 }, { id: 2 }, { id: 1 }])).toEqual([2, 1]);
    expect(aFermer([{ id: 2, action: bouton }, { id: 1, action: bouton }])).toEqual([1]);
    expect(aFermer([{ id: 2, action: bouton }, { id: 1 }])).toEqual([1]);
  });
  it("garde « Annuler » quand le suivant n'est qu'une information", () => {
    expect(aFermer([{ id: 2 }, { id: 1, action: bouton }])).toEqual([]);
    expect(aFermer([{ id: 3 }, { id: 2, action: bouton }, { id: 1, action: bouton }])).toEqual([1]);
    expect(aFermer([{ id: 3 }, { id: 2 }, { id: 1, action: bouton }])).toEqual([2]);
  });
  it("rien à faire avec un seul message", () => { expect(aFermer([{ id: 1 }])).toEqual([]); });
});
