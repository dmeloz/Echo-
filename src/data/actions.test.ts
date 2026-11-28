import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.stubGlobal("navigator", {});

import { auJour } from "../lib/dates";
import type { Tache } from "../lib/types";
import { DELAI_CORBEILLE, aDemain, ajouter, cocher, decocher, premierLancement, remettre, supprimer, viderVieilleCorbeille } from "./actions";
import { db } from "./db";

const nouvelle = async (x: Partial<Tache> = {}) => {
  await ajouter({ titre: "Test", qui: "moi", jour: auJour(), heure: "", niveau: null, repete: "", note: "", ...x });
  return (await db.taches.toArray()).at(-1)!;
};

beforeEach(async () => { await db.taches.clear(); await db.photos.clear(); await db.reglages.clear(); await db.corbeille.clear(); });

describe("les données (vraie base, en mémoire)", () => {
  it("premier lancement : les exemples ne sont posés qu'une fois, même lancé deux fois en même temps", async () => {
    await Promise.all([premierLancement(), premierLancement()]);
    await premierLancement();
    expect(await db.taches.count()).toBe(6);
  });

  it("cocher puis annuler remet la tâche comme avant", async () => {
    const t = await nouvelle();
    await cocher(t);
    expect((await db.taches.get(t.id))!.faitLe).toBe(auJour());
    await decocher(t.id);
    expect(await db.taches.get(t.id)).toMatchObject({ fait: null, faitLe: null });
  });

  it("deux touchers rapides ne créent pas deux fois la tâche qui revient", async () => {
    const t = await nouvelle({ repete: "semaine" });
    await Promise.all([cocher(t), cocher(t)]);
    expect(await db.taches.count()).toBe(2);
    expect((await db.taches.get(t.id))!.fait).toBeTruthy();
  });

  it("annuler une tâche qui revient retire la suivante", async () => {
    const t = await nouvelle({ repete: "jour" });
    await cocher(t);
    expect(await db.taches.count()).toBe(2);
    await decocher(t.id);
    expect(await db.taches.count()).toBe(1);
  });

  it("à demain déplace la tâche sans la perdre", async () => {
    const t = await nouvelle();
    await aDemain(t);
    expect((await db.taches.get(t.id))!.jour).toBe(auJour(1));
  });

  it("supprimer garde les photos tant que la tâche est à la corbeille, puis les enlève", async () => {
    await ajouter({ titre: "Avec photo", qui: "moi", jour: auJour(), heure: "", niveau: null, repete: "", note: "" }, [new Blob(["x"])]);
    const t = (await db.taches.toArray())[0];
    expect(await db.photos.count()).toBe(1);
    await supprimer(t.id);
    expect(await db.taches.count()).toBe(0);
    expect(await db.photos.count()).toBe(1);
    await viderVieilleCorbeille(Date.now() + DELAI_CORBEILLE + 60_000);
    expect(await db.photos.count()).toBe(0);
  });

  it("corbeille : une tâche effacée se remet, et part pour de bon après 30 jours", async () => {
    const t = await nouvelle({ titre: "À garder" });
    await supprimer(t.id);
    expect(await db.taches.count()).toBe(0);
    expect((await db.corbeille.get(t.id))?.par).toBe("Dany");
    await remettre(t.id);
    expect((await db.taches.get(t.id))?.titre).toBe("À garder");
    expect(await db.corbeille.count()).toBe(0);
    await supprimer(t.id);
    await viderVieilleCorbeille(Date.now() + DELAI_CORBEILLE - 60_000);
    expect(await db.corbeille.count()).toBe(1);
    await viderVieilleCorbeille(Date.now() + DELAI_CORBEILLE + 60_000);
    expect(await db.corbeille.count()).toBe(0);
  });

  it("cocher note qui l'a fait", async () => {
    await db.reglages.put({ cle: "proprio", valeur: "elle" });
    const t = await nouvelle();
    await cocher(t);
    expect((await db.taches.get(t.id))?.faitPar).toBe("elle");
  });
});
