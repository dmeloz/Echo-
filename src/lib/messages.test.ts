import { describe, expect, it } from "vitest";
import { echecEcriture } from "./messages";

describe("le message d'échec", () => {
  it("conseille de libérer de la place seulement si le stockage est plein", () => {
    expect(echecEcriture({ name: "QuotaExceededError" })).toMatch(/manque de place/);
    expect(echecEcriture({ name: "AbortError", inner: { name: "QuotaExceededError" } })).toMatch(/manque de place/);
    expect(echecEcriture({ name: "BulkError", failures: [{ name: "QuotaExceededError" }] })).toMatch(/manque de place/);
    expect(echecEcriture({ name: "ConstraintError" })).toBe("Pas enregistré. Réessaie.");
    expect(echecEcriture(undefined)).toBe("Pas enregistré. Réessaie.");
  });
});
