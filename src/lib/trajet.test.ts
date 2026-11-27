import { describe, expect, it } from "vitest";
import { departMoto, departTransports, lireLieu, lireRoute, urlCorrespondances } from "../../supabase/functions/_shared/trajet-calcul";

describe("l'heure de départ", () => {
  it("moto : temps de route + 10 % + 10 minutes, arrondi aux 5 minutes d'avant", () => {
    // 15 min de route → 17 + 10 = 27 min ; arriver à 8:00 → partir à 7:30 (7:33 arrondi en dessous).
    expect(departMoto("08:00", 15 * 60)).toEqual({ depart: "07:30", minutes: 27 });
    expect(departMoto("00:10", 15 * 60).depart).toBe("23:40");
  });
  it("lit les réponses des services, et refuse ce qui ne va pas", () => {
    expect(lireLieu([{ lat: "46.53", lon: "6.58" }])).toEqual({ lat: 46.53, lon: 6.58 });
    expect(lireLieu([])).toBeNull();
    expect(lireRoute({ code: "Ok", routes: [{ duration: 900 }] })).toBe(900);
    expect(lireRoute({ code: "NoRoute" })).toBeNull();
  });
  it("transports : la dernière correspondance qui arrive à temps", () => {
    const c = (part: string, arrive: string) => ({ from: { departure: `2026-11-28T${part}:00+0100`, station: { name: "Renens VD" } }, to: { arrival: `2026-11-28T${arrive}:00+0100` }, products: ["S1"] });
    const r = { connections: [c("07:12", "07:40"), c("07:27", "07:55"), c("07:42", "08:10")] };
    expect(departTransports(r, "2026-11-28", "08:00")).toEqual({ depart: "07:22", minutes: 38, train: "07:27", ligne: "S1", gare: "Renens VD" });
    expect(departTransports({ connections: [c("07:42", "08:10")] }, "2026-11-28", "08:00")).toBeNull();
    expect(urlCorrespondances("Renens VD", "Lausanne", "2026-11-28", "08:00")).toContain("isArrivalTime=1");
  });
});

import { prochainDebut } from "./horaires";
describe("le prochain début de travail", () => {
  it("C1 coupé : le matin puis le soir ; rien un jour de repos ou une fois commencé", () => {
    expect(prochainDebut("C1", 7 * 60)).toBe("09:00");
    expect(prochainDebut("C1", 15 * 60)).toBe("18:30");
    expect(prochainDebut("C1", 19 * 60)).toBeNull();
    expect(prochainDebut("R", 7 * 60)).toBeNull();
    expect(prochainDebut(undefined, 0)).toBeNull();
  });
});
