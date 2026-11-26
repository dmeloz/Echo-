import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.fn();
vi.mock("sonner", () => ({ toast: (...a: unknown[]) => toast(...a) }));
vi.stubGlobal("navigator", { onLine: false });
const stock = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => stock.get(k) ?? null, setItem: (k: string, v: string) => stock.set(k, v), removeItem: (k: string) => stock.delete(k) });

import { db } from "../data/db";
import { ajouter, cocher, supprimer } from "../data/actions";
import { auJour } from "../lib/dates";
import { lireFile } from "./file";
import type { Tache } from "../lib/types";
import { appliquer } from "./moteur";

const tache = (id: string, x = {}): Tache => ({ id, titre: "Pain", qui: "elle", jour: auJour(), heure: "", niveau: null, repete: "", note: "", fait: null, faitLe: null, cree: 1, ...x });

beforeEach(async () => { await db.taches.clear(); await db.horaires.clear(); await db.reglages.clear(); stock.clear(); toast.mockClear(); });

describe("la synchro du foyer", () => {
  it("note dans la file ce qui change sur ce téléphone (ajout, case cochée, suppression, horaire)", async () => {
    await ajouter({ titre: "Test", qui: "moi", jour: auJour(), heure: "", niveau: null, repete: "", note: "" });
    const t = (await db.taches.toArray())[0];
    stock.clear();
    await cocher(t);
    expect(Object.keys(lireFile())).toEqual(["tache:" + t.id]);
    stock.clear();
    await supprimer(t.id);
    expect(Object.keys(lireFile())).toEqual(["tache:" + t.id]);
    await db.horaires.put({ qui: "moi", jour: "2026-11-26", code: "C1" });
    expect(Object.keys(lireFile())).toContain("horaire:moi|2026-11-26");
  });

  it("ce qui arrive de l'autre téléphone ne repart pas, et prévient quand l'autre ajoute ou termine", async () => {
    await db.reglages.put({ cle: "membres", valeur: [{ userId: "s", prenom: "Sarah", place: "elle" }] });
    await appliquer([{ genre: "tache", cle: "a", data: tache("a"), supprime: false, par: "s", maj: "x" }], false, "m");
    expect(await db.taches.get("a")).toBeTruthy();
    expect(lireFile()).toEqual({});
    expect(toast).toHaveBeenCalledWith("Sarah a ajouté « Pain »", expect.anything());
    await appliquer([{ genre: "tache", cle: "a", data: tache("a", { fait: 5, faitLe: auJour() }), supprime: false, par: "s", maj: "y" }], false, "m");
    expect(toast).toHaveBeenLastCalledWith("Sarah a terminé « Pain »", expect.anything());
    await appliquer([{ genre: "tache", cle: "a", data: null, supprime: true, par: "s", maj: "z" }], false, "m");
    expect(await db.taches.get("a")).toBeUndefined();
    expect(lireFile()).toEqual({});
  });

  it("un changement pas encore envoyé d'ici n'est pas écrasé ; rien n'est annoncé au premier chargement", async () => {
    await db.taches.put(tache("b", { titre: "Ma version" }));
    await appliquer([{ genre: "tache", cle: "b", data: tache("b", { titre: "Autre" }), supprime: false, par: "s", maj: "x" },
      { genre: "tache", cle: "c", data: tache("c"), supprime: false, par: "s", maj: "x" },
      { genre: "horaire", cle: "elle|2026-11-26", data: { qui: "elle", jour: "2026-11-26", code: "C1" }, supprime: false, par: "s", maj: "x" }], true, "m");
    expect((await db.taches.get("b"))?.titre).toBe("Ma version");
    expect(await db.taches.get("c")).toBeTruthy();
    expect(await db.horaires.get(["elle", "2026-11-26"])).toBeTruthy();
    expect(toast).not.toHaveBeenCalled();
  });
});

describe("tout effacer", () => {
  it("part aussi au foyer (chaque tâche effacée est notée)", async () => {
    const { toutEffacer } = await import("../data/actions");
    await db.taches.put(tache("d"));
    stock.clear();
    await toutEffacer();
    expect(Object.keys(lireFile())).toContain("tache:d");
  });
});
