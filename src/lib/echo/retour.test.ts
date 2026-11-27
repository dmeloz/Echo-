import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.stubGlobal("navigator", {});

import { db } from "../../data/db";
import type { Tache } from "../types";
import { executer } from "./boucle";
import type { Action, ContexteEcho } from "./outils";
import { DUREE_RETOUR, MAX_RETOURS, annulables, annulerDuJournal, garderRetours, suivre } from "./retour";

const ctx: ContexteEcho = { noms: { moi: "Dany", elle: "Sarah" }, proprio: "moi", now: new Date(2026, 10, 26, 10, 0) };
const tache = (x: Partial<Tache>): Tache => ({ id: "t1", titre: "Dentiste", qui: "moi", jour: "2026-11-26", heure: "15:00", niveau: null, repete: "", note: "", fait: null, faitLe: null, cree: 1, ...x });
const action = (faire: Action["faire"]): Action => ({ outil: "essai", genre: "petit", libelle: "Essai", details: [], faire });
const idJournal = async () => (await db.echo_journal.toArray())[0].id;

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); });

describe("suivre", () => {
  it("note ce qui est ajouté, changé et supprimé, et rien d'autre", async () => {
    await db.taches.bulkAdd([tache({ id: "a" }), tache({ id: "b" }), tache({ id: "c" })]);
    const { retours } = await suivre(async () => {
      await db.taches.add(tache({ id: "n" }));
      await db.taches.update("a", { heure: "16:00" });
      await db.taches.delete("b");
      await db.reglages.put({ cle: "x", valeur: 1 });
    });
    const par = Object.fromEntries(retours.map((r) => [r.cle, r]));
    expect(Object.keys(par).sort()).toEqual(["a", "b", "n"]);
    expect(par.n.avant).toBeNull();
    expect((par.a.avant as Tache).heure).toBe("15:00");
    expect((par.a.apres as Tache).heure).toBe("16:00");
    expect(par.b.apres).toBeNull();
    // Après l'action, plus rien n'est noté.
    const apres = await suivre(async () => {});
    await db.taches.update("c", { heure: "09:00" });
    expect(apres.retours).toEqual([]);
  });
  it("retire ses écoutes même si l'action échoue", async () => {
    await expect(suivre(async () => { throw new Error("raté"); })).rejects.toThrow("raté");
    expect((await suivre(async () => { await db.taches.add(tache({})); })).retours).toHaveLength(1);
  });
});

describe("annuler depuis le journal", () => {
  it("remet tout comme avant et barre la ligne", async () => {
    await db.taches.bulkAdd([tache({ id: "a" }), tache({ id: "b" })]);
    await executer(action(async () => {
      await db.taches.add(tache({ id: "n" }));
      await db.taches.update("a", { heure: "16:00" });
      await db.taches.delete("b");
      return async () => {};
    }), "essai", ctx);
    const id = await idJournal();
    expect((await annulables()).has(id)).toBe(true);
    expect(await annulerDuJournal(id)).toEqual({ remis: 3, changes: 0 });
    expect(await db.taches.get("n")).toBeUndefined();
    expect((await db.taches.get("a"))!.heure).toBe("15:00");
    expect(await db.taches.get("b")).toBeTruthy();
    expect((await db.echo_journal.get(id))!.annule).toBeTruthy();
    // Une seule fois.
    expect((await annulables()).has(id)).toBe(false);
    expect(await annulerDuJournal(id)).toBeNull();
  });
  it("laisse ce que quelqu'un a changé depuis", async () => {
    await db.taches.bulkAdd([tache({ id: "a" }), tache({ id: "b" })]);
    await executer(action(async () => {
      await db.taches.update("a", { heure: "16:00" });
      await db.taches.update("b", { heure: "17:00" });
      return async () => {};
    }), "essai", ctx);
    await db.taches.update("a", { heure: "18:00" });
    expect(await annulerDuJournal(await idJournal())).toEqual({ remis: 1, changes: 1 });
    expect((await db.taches.get("a"))!.heure).toBe("18:00");
    expect((await db.taches.get("b"))!.heure).toBe("15:00");
  });
  it("ne barre pas la ligne quand rien n'a pu être remis", async () => {
    await db.taches.add(tache({ id: "a" }));
    await executer(action(async () => { await db.taches.update("a", { heure: "16:00" }); return async () => {}; }), "essai", ctx);
    await db.taches.update("a", { heure: "18:00" });
    const id = await idJournal();
    expect(await annulerDuJournal(id)).toEqual({ remis: 0, changes: 1 });
    expect((await db.echo_journal.get(id))!.annule).toBeFalsy();
  });
  it("l'Annuler du message retire aussi le retour gardé", async () => {
    await db.taches.add(tache({ id: "a" }));
    const f = await executer(action(async () => { await db.taches.update("a", { heure: "16:00" }); return async () => { await db.taches.update("a", { heure: "15:00" }); }; }), "essai", ctx);
    await f.annuler();
    expect((await annulables()).size).toBe(0);
  });
  it("oublie après 7 jours et ne garde que les dernières actions", async () => {
    const r = [{ table: "taches", cle: "a", avant: null, apres: tache({ id: "a" }) }];
    for (let i = 0; i < MAX_RETOURS + 5; i++) await garderRetours(`j${i}`, r, 1000 + i);
    const s = await annulables(2000);
    expect(s.size).toBe(MAX_RETOURS);
    expect(s.has("j0")).toBe(false);
    expect((await annulables(2000 + DUREE_RETOUR)).size).toBe(0);
    expect(await annulerDuJournal(`j${MAX_RETOURS + 4}`, 2000 + DUREE_RETOUR)).toBeNull();
  });
});
