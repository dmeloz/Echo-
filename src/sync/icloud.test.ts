import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { Tache } from "../lib/types";
import { fusionner } from "./icloud";

const base = (x: Partial<Tache>): Tache => ({ id: "x", titre: "T", qui: "moi", jour: "2026-12-03", heure: "", niveau: null, repete: "", note: "", fait: null, faitLe: null, cree: 1, ...x });
const lu = (x: Record<string, unknown>) => ({ uid: "u1", rid: "", titre: "Dentiste", note: "", jour: "2026-12-03", heure: "15:00", fin: "16:00", serie: false, href: "https://p1-caldav.icloud.com/1/calendars/home/u1.ics", ...x });

describe("fusion avec iCloud", () => {
  it("ajoute, garde le même id pour un événement créé dans Echo, et retire ce qui a disparu", () => {
    const echo = base({ id: "abc", titre: "Resto", evt: true, ical: { uid: "abc", href: "https://p1-caldav.icloud.com/1/calendars/home/abc.ics" } });
    const parti = base({ id: "ic-vieux", titre: "Annulé", evt: true, ical: { uid: "vieux", href: "https://p1-caldav.icloud.com/1/calendars/home/vieux.ics" } });
    const tache = base({ id: "t1", titre: "Courses" });
    const r = { place: "moi" as const, calendriers: [], evenements: [lu({}), lu({ uid: "abc", titre: "Resto", heure: "", fin: "", href: echo.ical!.href })] };
    const { mettre, retirer } = fusionner([echo, parti, tache], r, "2026-11-26", "2027-02-24", 5);
    expect(mettre.map((t) => t.titre)).toEqual(["Dentiste"]);
    expect(mettre[0]).toMatchObject({ evt: true, heure: "15:00", fin: "16:00", qui: "moi", ical: { uid: "u1" } });
    expect(mettre[0].id.startsWith("ic-")).toBe(true);
    expect(retirer).toEqual(["ic-vieux"]);
  });

  it("une occurrence répétée a son propre id, le même à chaque lecture", () => {
    const r = { place: "elle" as const, calendriers: [], evenements: [lu({ rid: "2026-12-10", jour: "2026-12-10", serie: true }), lu({ rid: "2026-12-17", jour: "2026-12-17", serie: true })] };
    const a = fusionner([], r, "2026-11-26", "2027-02-24").mettre;
    const b = fusionner([], r, "2026-11-26", "2027-02-24").mettre;
    expect(new Set(a.map((t) => t.id)).size).toBe(2);
    expect(a.map((t) => t.id)).toEqual(b.map((t) => t.id));
    expect(a[0].qui).toBe("elle");
  });

  it("ne retire rien d'un calendrier qui n'a pas pu être lu", () => {
    const vieux = base({ id: "ic-v", evt: true, ical: { uid: "v", href: "https://p1-caldav.icloud.com/1/calendars/travail/v.ics" } });
    const r = { place: "moi" as const, calendriers: [], evenements: [], echecs: ["https://p1-caldav.icloud.com/1/calendars/travail/"] };
    expect(fusionner([vieux], r, "2026-11-26", "2027-02-24").retirer).toEqual([]);
  });

  it("2. un événement créé dans Echo garde ses étapes, son importance, son ordre et sa répétition après une lecture d'iCloud", () => {
    const href = "https://p1-caldav.icloud.com/1/calendars/home/abc.ics";
    const echo = base({ id: "abc", titre: "Resto", qui: "nous", heure: "19:00", evt: true, niveau: 2, ordre: 3, repete: "an", note: "Table pour 2",
      etapes: [{ id: "e1", texte: "Réserver", fait: true }], cree: 7, ical: { uid: "abc", href } });
    // iCloud le renvoie avec une heure de fin (ajoutée par iCloud) et un titre corrigé sur l'iPhone.
    const r = { place: "moi" as const, calendriers: [], evenements: [lu({ uid: "abc", titre: "Resto italien", note: "Table pour 2", heure: "19:00", fin: "20:00", href })] };
    const { mettre, retirer } = fusionner([echo], r, "2026-11-26", "2027-02-24", 99);
    expect(retirer).toEqual([]);
    expect(mettre).toEqual([{ ...echo, titre: "Resto italien", fin: "20:00" }]);
    // Un événement venu d'iCloud qui perd son heure de fin la perd aussi dans Echo, sans rien d'autre.
    const sansFin = fusionner(mettre, { ...r, evenements: [lu({ uid: "abc", titre: "Resto italien", note: "Table pour 2", heure: "19:00", fin: "", href })] }, "2026-11-26", "2027-02-24").mettre;
    expect(sansFin[0]).toEqual({ ...echo, titre: "Resto italien" });
    expect("fin" in sansFin[0]).toBe(false);
  });
});
