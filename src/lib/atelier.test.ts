import { expect, test } from "vitest";
import { cssDe, ecrireCouleur, lireCouleur, nombreDeChangements } from "./atelier";

test("lit et récrit les couleurs", () => {
  expect(lireCouleur("#2f6bff")).toEqual({ hex: "#2f6bff", a: 1 });
  expect(lireCouleur("#fff")).toEqual({ hex: "#ffffff", a: 1 });
  expect(lireCouleur("rgb(18 40 58 / .1)")).toEqual({ hex: "#12283a", a: 0.1 });
  expect(lireCouleur("rgba(255, 255, 255, 0.6)")).toEqual({ hex: "#ffffff", a: 0.6 });
  expect(lireCouleur("var(--bleu)")).toBeNull();
  expect(ecrireCouleur({ hex: "#12283a", a: 0.1 })).toBe("rgb(18 40 58 / 0.1)");
  expect(ecrireCouleur({ hex: "#2f6bff", a: 1 })).toBe("#2f6bff");
});

test("écrit le CSS des changements", () => {
  const e = { jetons: { "--bleu": "#0055ff" }, regles: { ".g": { "border-radius": "20px" }, ".vide": {} }, libre: " .x { color: red; } ", textes: [], demandes: [] };
  expect(cssDe(e)).toBe(":root {\n  --bleu: #0055ff;\n}\n\n.g {\n  border-radius: 20px;\n}\n\n.x { color: red; }");
  expect(cssDe(e, true)).toContain("border-radius: 20px !important;");
  expect(nombreDeChangements(e)).toBe(3);
});
