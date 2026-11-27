import { describe, expect, it } from "vitest";
import { lieuDe, lireMeteo, phraseMeteo, routeGlissante, type Heure, type Meteo } from "./meteo";
import { phraseDepart } from "./trajet";
import { construireResume } from "./resume";

const h = (x: Partial<Heure> = {}): Heure => ({ t: 8, pluie: 0, neige: 0, code: 1, ...x });
const jour = (f: (i: number) => Partial<Heure> = () => ({})) => Array.from({ length: 24 }, (_, i) => h(f(i)));
const m = (heures: Record<string, Heure[]>): Meteo => ({ quand: 0, lieu: "x", heures });
const J = "2026-11-28", HIER = "2026-11-27";

describe("le lieu de la météo", () => {
  it("la ville écrite d'abord, sinon le code postal de l'adresse, jamais un bout de rue", () => {
    expect(lieuDe("Morges", "rue du Lac 3, 1000 Lausanne")).toBe("Morges");
    expect(lieuDe("", "chemin des Fleurs 12 1000")).toBe("1000");
    expect(lieuDe("", "Lausanne, rue du Lac")).toBe("");
    expect(lieuDe("", "rue du Lac 3")).toBe("");
    expect(lieuDe("", "")).toBe("");
  });
});

describe("lire Open-Meteo", () => {
  const temps = (j: string) => Array.from({ length: 24 }, (_, i) => `${j}T${String(i).padStart(2, "0")}:00`);
  it("range par jour, et refuse ce qui est abîmé", () => {
    const t = [...temps(HIER), ...temps(J)], n = (v: number) => t.map(() => v);
    const r = lireMeteo({ hourly: { time: t, temperature_2m: n(3), precipitation: n(0), snowfall: n(0.4), weather_code: n(73) } }, "x", 5)!;
    expect(Object.keys(r.heures)).toEqual([HIER, J]);
    expect(r.heures[J][7]).toEqual({ t: 3, pluie: 0, neige: 0.4, code: 73 });
    expect(lireMeteo({ hourly: { time: t, temperature_2m: [1] } }, "x")).toBeNull();
    expect(lireMeteo(null, "x")).toBeNull();
    // Un jour incomplet n'est pas gardé.
    expect(lireMeteo({ hourly: { time: t.slice(0, 30), temperature_2m: n(3).slice(0, 30), precipitation: n(0).slice(0, 30), snowfall: n(0).slice(0, 30), weather_code: n(0).slice(0, 30) } }, "x")!.heures[J]).toBeUndefined();
  });
});

describe("la phrase du temps", () => {
  it("dit la température et le temps du matin et de l'après-midi", () => {
    const neigeMatin = m({ [J]: jour((i) => (i < 12 ? { t: 3, neige: 0.3, code: 73 } : { t: 5, code: 3 })) });
    expect(phraseMeteo(neigeMatin, J, 7)).toBe("3° (jusqu'à 5°), neige ce matin, couvert cet après-midi");
    expect(phraseMeteo(m({ [J]: jour(() => ({ t: 12, code: 0 })) }), J, 0)).toBe("12°, soleil toute la journée");
    expect(phraseMeteo(m({ [J]: jour((i) => ({ t: 9, pluie: i >= 13 ? 1.2 : 0, code: i >= 13 ? 61 : 2 })) }), J, 14)).toBe("9°, pluie cet après-midi");
    expect(phraseMeteo(m({ [J]: jour(() => ({ t: -0.2, code: 3 })) }), J, 21)).toBe("0°, couvert ce soir");
  });
  it("rien si on n'a pas la météo de ce jour", () => {
    expect(phraseMeteo(null, J)).toBe("");
    expect(phraseMeteo(m({ [HIER]: jour() }), J)).toBe("");
  });
  it("entre dans le résumé seulement si on l'a", () => {
    const noms = { moi: "Dany", elle: "Sarah" };
    expect(construireResume([], noms, "moi", new Date(2026, 10, 28, 7), undefined, false, "3°, neige ce matin").phrase).toBe("Dehors : 3°, neige ce matin. Rien de prévu aujourd'hui. Profite.");
    expect(construireResume([], noms, "moi", new Date(2026, 10, 28, 7)).phrase).toBe("Rien de prévu aujourd'hui. Profite.");
  });
});

describe("la route glisse", () => {
  it("neige autour du départ", () => {
    expect(routeGlissante(m({ [J]: jour((i) => (i === 5 ? { neige: 0.2, code: 71 } : {})) }), J, "07:30")).toBe("neige");
    expect(routeGlissante(m({ [J]: jour((i) => (i === 8 ? { code: 85 } : {})) }), J, "07:30")).toBe("neige");
    expect(routeGlissante(m({ [J]: jour((i) => (i === 15 ? { neige: 1, code: 73 } : {})) }), J, "07:30")).toBeNull();
  });
  it("gel : zéro ou moins au départ après de la pluie, même tombée la veille au soir", () => {
    const froid = jour((i) => ({ t: i < 9 ? -1 : 4 }));
    expect(routeGlissante(m({ [HIER]: jour((i) => (i >= 21 ? { pluie: 0.4, code: 61 } : {})), [J]: froid }), J, "07:30")).toBe("gel");
    expect(routeGlissante(m({ [HIER]: jour(), [J]: froid }), J, "07:30")).toBeNull(); // froid mais sec
    expect(routeGlissante(m({ [J]: jour((i) => ({ pluie: i < 6 ? 1 : 0 })) }), J, "07:30")).toBeNull(); // mouillé mais doux
  });
  it("rien sans météo, ou avec une heure illisible", () => {
    expect(routeGlissante(null, J, "07:30")).toBeNull();
    expect(routeGlissante(m({ [J]: jour() }), J, "")).toBeNull();
  });
});

describe("la ligne « pars à »", () => {
  const hh = (x: string) => x.replace(":", " h ").replace(/^0/, "");
  const moto = { depart: "07:30", minutes: 20, mode: "moto" as const };
  it("propose les transports quand ça glisse, sinon reste simple", () => {
    expect(phraseDepart(moto, hh)).toBe("pars à 7 h 30");
    expect(phraseDepart({ ...moto, glisse: "neige", autrement: { depart: "07:10", minutes: 40, mode: "transports" } }, hh)).toBe("neige : plutôt les transports, pars à 7 h 10 (à moto : 7 h 30)");
    expect(phraseDepart({ ...moto, glisse: "gel" }, hh)).toBe("route gelée : prudence à moto, pars à 7 h 30");
  });
  it("ne propose plus un départ passé", () => {
    const d = { ...moto, glisse: "neige" as const, autrement: { depart: "07:10", minutes: 40, mode: "transports" as const } };
    expect(phraseDepart(d, hh, "07:11")).toBe("neige : prudence à moto, pars à 7 h 30");
    expect(phraseDepart({ ...d, autrement: { ...d.autrement, depart: "07:40" } }, hh, "07:31")).toBe("neige : plutôt les transports, pars à 7 h 40");
    expect(phraseDepart(d, hh, "07:30")).toBe("");
    expect(phraseDepart(moto, hh, "07:29")).toBe("pars à 7 h 30");
  });
});
