import { describe, expect, it } from "vitest";
import { reprendre, sensDuChoix } from "./mouvement";

describe("le sens du mouvement", () => {
  it("un choix plus à droite vient de la droite, plus à gauche de la gauche", () => {
    expect(sensDuChoix(0, 2)).toBe("droite");
    expect(sensDuChoix(2, 1)).toBe("gauche");
  });
  it("pas de sens sans choix d'avant, ou pour le même choix", () => {
    expect(sensDuChoix(-1, 1)).toBeNull();
    expect(sensDuChoix(1, 1)).toBeNull();
    expect(sensDuChoix(1, -1)).toBeNull();
  });
});

describe("le chemin du retour", () => {
  const pile = [{ page: "#reglages|", haut: 120 }, { page: "#reglages|Réglages", haut: 40 }];
  it("revenir à une page déjà vue rend sa hauteur et oublie ce qui suit", () => {
    expect(reprendre(pile, "#reglages|")).toEqual({ haut: 120, pile: [] });
    expect(reprendre(pile, "#reglages|Réglages")).toEqual({ haut: 40, pile: [pile[0]] });
  });
  it("une page inconnue ne change rien", () => {
    expect(reprendre(pile, "#cuisine|")).toEqual({ haut: null, pile });
  });
});
