import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.fn();
vi.mock("sonner", () => ({ toast: (...a: unknown[]) => toast(...a) }));
vi.stubGlobal("navigator", { onLine: false });
const garde = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => garde.get(k) ?? null, setItem: (k: string, v: string) => garde.set(k, v), removeItem: (k: string) => garde.delete(k) });

import { db } from "../../data/db";
import { cocherEtape, compterProduit, finirBatch, noterRepas, noterReste, oublierRecette, rangerBoites } from "./actions";
import { besoins, boites, duree, nettoyerBatch, nettoyerRecette, usageProbable, utilises, type Produit, type Repas } from "./donnees";
import { preparerDemande, prevoirRecette, repasDuBatch, versTravail } from "./semaineEcho";

const semaine = ["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"];
const annuler = () => toast.mock.calls.at(-1)![1].action.onClick();
const repas: Repas[] = [
  { jour: "2026-11-30", plat: "Chili", ingredients: [{ nom: "bœuf haché", qte: "500 g" }, { nom: "riz", qte: "250 g" }] },
  { jour: "2026-12-01", plat: "Gratin", duStock: ["Courgettes"], ingredients: [{ nom: "crème", qte: "25 cl" }] },
  { jour: "2026-12-03", plat: "Curry", congele: true },
  { jour: "2026-12-04", plat: "Pas validé", propose: true },
];

beforeEach(async () => {
  await Promise.all([db.cuisine_stock.clear(), db.cuisine_courses.clear(), db.cuisine_repas.clear(), db.cuisine_batch.clear(), db.cuisine_recettes.clear(), db.cuisine_gouts.clear(), db.cuisine_habitudes.clear(), db.reglages.clear()]);
  toast.mockClear();
});

describe("le batch du dimanche", () => {
  // Sarah a des horaires fixes (gamelle le midi) ; Dany travaille le soir du mardi.
  const travail = versTravail([
    { qui: "elle", jour: "2026-12-01", code: "FIX" }, { qui: "elle", jour: "2026-12-02", code: "FIX" }, { qui: "moi", jour: "2026-12-01", code: "C6" }, { qui: "elle", jour: "2026-12-07", code: "FIX" },
  ] as never);
  const tous = besoins([...semaine, "2026-12-07"], travail);

  it("compte les boîtes : les portions du soir, plus une quand le lendemain il y a une gamelle", () => {
    expect(boites(repas, tous)).toEqual([
      { jour: "2026-11-30", plat: "Chili", portions: 3, lieu: "frigo" },
      { jour: "2026-12-01", plat: "Gratin", portions: 2, lieu: "frigo" },
      { jour: "2026-12-03", plat: "Curry", portions: 2, lieu: "congelateur" },
    ]);
    // Le repas du dimanche compte la gamelle du lundi suivant.
    expect(boites([{ jour: "2026-12-06", plat: "Rôti" }], tous)[0].portions).toBe(3);
    expect(repasDuBatch(repas, "2026-12-01").map((r) => r.plat)).toEqual(["Gratin", "Curry"]);
    expect([duree(45), duree(60), duree(130)]).toEqual(["45 min", "1 h", "2 h 10"]);
  });

  it("retrouve au stock ce que les plats utilisent, sans les produits de la maison ni les boîtes", () => {
    const stock: Produit[] = [
      { id: "a", nom: "Crème entière", lieu: "frigo", nb: 6, cree: 1 }, { id: "b", nom: "Courgettes", lieu: "frigo", cree: 2 }, { id: "c", nom: "Riz", lieu: "placard", cree: 3 },
      { id: "d", nom: "Lessive", lieu: "maison", cree: 4 }, { id: "e", nom: "Yaourts", lieu: "frigo", cree: 5 }, { id: "boite-x", nom: "Chili", lieu: "frigo", repas: "2026-11-23", cree: 6 },
      { id: "f", nom: "Bœuf", lieu: "frigo", cree: 7 },
    ];
    const servis = utilises(repas, stock);
    expect(servis.map((s) => s.produit.id)).toEqual(["a", "b", "c", "f"]);
    // « Bœuf » pour « bœuf haché » : peut-être un autre produit, rien n'est décompté d'office.
    expect(servis.map(usageProbable)).toEqual(["fini", "fini", "reste", "rien"]);
  });

  it("« Batch terminé » range les boîtes, décompte le stock, et Annuler remet tout", async () => {
    await db.cuisine_stock.bulkPut([
      { id: "a", nom: "Crème", lieu: "frigo", nb: 6, cree: 1 }, { id: "b", nom: "Courgettes", lieu: "frigo", cree: 2 }, { id: "c", nom: "Riz", lieu: "placard", cree: 3 }, { id: "d", nom: "Bœuf haché", lieu: "frigo", cree: 4 },
    ]);
    await db.cuisine_batch.put({ semaine: semaine[0], etapes: [{ texte: "Lance le riz.", minutes: 5 }], duree: 90, cree: 1 });
    await cocherEtape(semaine[0], 0);
    expect((await db.cuisine_batch.get(semaine[0]))!.etapes[0].fait).toBe(true);
    const aRanger = boites(repas, tous);
    await finirBatch(semaine[0], aRanger, [{ id: "a", usage: "fini" }, { id: "b", usage: "fini" }, { id: "c", usage: "reste" }, { id: "d", usage: "rien" }], 1000);
    expect(await db.cuisine_stock.get("boite-2026-11-30")).toEqual({ id: "boite-2026-11-30", nom: "Chili", lieu: "frigo", nb: 3, repas: "2026-11-30", cree: 1000 });
    expect((await db.cuisine_stock.get("boite-2026-12-03"))!.lieu).toBe("congelateur");
    expect((await db.cuisine_stock.get("a"))!.nb).toBe(5);
    expect(await db.cuisine_stock.get("b")).toBeUndefined();
    expect((await db.cuisine_stock.get("c"))!.reste).toBe("moitie");
    expect(await db.cuisine_stock.get("d")).toBeDefined();
    expect((await db.cuisine_batch.get(semaine[0]))!.fini).toBe(1000);
    // Ranger une deuxième fois ne double pas les boîtes et ne décompte pas le stock une deuxième fois.
    await finirBatch(semaine[0], aRanger, [{ id: "a", usage: "fini" }], 2000);
    expect((await db.cuisine_stock.toArray()).filter((p) => p.repas).length).toBe(3);
    expect((await db.cuisine_stock.get("a"))!.nb).toBe(5);
    await annuler();
    expect((await db.cuisine_stock.get("boite-2026-11-30"))!.cree).toBe(1000);
    // Manger une portion d'une boîte ne met pas le plat aux courses.
    await compterProduit("boite-2026-12-01", -1);
    await noterReste("boite-2026-12-03", "fini");
    expect(await db.cuisine_courses.count()).toBe(0);
    expect(await db.cuisine_stock.get("boite-2026-12-03")).toBeUndefined();
    toast.mockClear();
    await db.cuisine_stock.clear(); await db.cuisine_batch.clear();
    await db.cuisine_stock.bulkPut([{ id: "a", nom: "Crème", lieu: "frigo", nb: 6, cree: 1 }, { id: "b", nom: "Courgettes", lieu: "frigo", cree: 2 }]);
    // Sans plan d'Echo : on peut quand même ranger, et tout annuler.
    await finirBatch(semaine[0], aRanger, [{ id: "a", usage: "fini" }, { id: "b", usage: "fini" }], 3000);
    expect((await db.cuisine_batch.get(semaine[0]))!.fini).toBe(3000);
    await annuler();
    expect((await db.cuisine_stock.toArray()).map((p) => [p.id, p.nb])).toEqual([["a", 6], ["b", undefined]]);
    expect(await db.cuisine_batch.count()).toBe(0);
  });

  it("une boîte sort du stock toute seule le surlendemain de son repas", async () => {
    await db.cuisine_stock.bulkPut([
      { id: "boite-1", nom: "Chili", lieu: "frigo", repas: "2026-11-30", cree: 1 }, { id: "boite-2", nom: "Gratin", lieu: "frigo", repas: "2026-12-01", cree: 2 }, { id: "x", nom: "Beurre", lieu: "frigo", cree: 3 },
    ]);
    expect(await rangerBoites("2026-12-01")).toBe(1); // on est le 2 décembre
    expect((await db.cuisine_stock.toArray()).map((p) => p.id).sort()).toEqual(["boite-2", "x"]);
  });

  it("ne garde d'un plan venu d'ailleurs que ce qui tient debout", () => {
    expect(nettoyerBatch({ semaine: "2026-11-30", etapes: [{ texte: " Lance le riz. ", minutes: 999 }, { texte: "" }], duree: 0 })).toMatchObject({ etapes: [{ texte: "Lance le riz.", minutes: 0 }], duree: 0 });
    expect(nettoyerBatch({ semaine: "2026-11-30", etapes: [] })).toBeNull();
    expect(nettoyerBatch({ semaine: "2026-11-30", etapes: [], fini: 5 })).toMatchObject({ fini: 5 });
    expect(nettoyerBatch({ semaine: "pas une date", etapes: [{ texte: "x", minutes: 1 }] })).toBeNull();
  });
});

describe("le livre de recettes", () => {
  const chili = repas[0];
  it("le pouce range le plat, le même pouce l'enlève, et la fois suivante compte", async () => {
    await noterRepas(chili, 1);
    expect(await db.cuisine_recettes.get("chili")).toMatchObject({ plat: "Chili", avis: 1, fois: 1, dernier: "2026-11-30", ingredients: chili.ingredients });
    await noterRepas(chili, 1);
    expect(await db.cuisine_recettes.count()).toBe(0);
    await annuler();
    await noterRepas({ jour: "2026-12-07", plat: "chili" }, 1);
    expect(await db.cuisine_recettes.get("chili")).toMatchObject({ plat: "Chili", fois: 2, dernier: "2026-12-07", precedent: "2026-11-30", ingredients: chili.ingredients });
    // Un vieux repas du même plat ne change rien ; défaire le vote du jour rend le livre comme avant.
    await noterRepas(chili, 1);
    expect((await db.cuisine_recettes.get("chili"))!.fois).toBe(2);
    await noterRepas({ jour: "2026-12-07", plat: "chili" }, 1);
    expect(await db.cuisine_recettes.get("chili")).toMatchObject({ fois: 1, dernier: "2026-11-30" });
    await noterRepas({ jour: "2026-12-07", plat: "chili" }, 1);
    await noterRepas({ jour: "2026-12-07", plat: "chili" }, -1);
    expect(await db.cuisine_recettes.get("chili")).toMatchObject({ avis: -1, fois: 2 });
    await oublierRecette("chili");
    expect(await db.cuisine_recettes.count()).toBe(0);
    expect(nettoyerRecette({ cle: "autre", plat: "Chili", avis: 1 })).toBeNull();
    expect(nettoyerRecette({ cle: "chili", plat: "Chili", avis: 2 })).toBeNull();
  });

  it("Echo reçoit ce qu'on a aimé, et ne repropose pas ce qu'on a refusé", async () => {
    await db.cuisine_recettes.bulkPut([
      { cle: "chili", plat: "Chili", avis: 1, fois: 2, dernier: "2026-11-20", maj: 2 }, { cle: "dahl", plat: "Dahl", avis: 1, fois: 1, dernier: "2026-11-10", maj: 5 },
      { cle: "soupe", plat: "Soupe", avis: -1, fois: 1, dernier: "2026-11-12", maj: 1 },
    ]);
    await db.cuisine_stock.put({ id: "boite-1", nom: "Curry", lieu: "frigo", repas: "2026-11-30", cree: 1 });
    const d = await preparerDemande(besoins(semaine, []).slice(0, 2), { moi: "Dany", elle: "Sarah" }, semaine, ["Gratin"], new Date("2026-11-27T10:00:00"));
    expect(d.aimes).toEqual(["Dahl", "Chili"]);
    expect(d.eviter).toEqual(["Gratin", "Soupe"]);
    expect(d.stock).toEqual([]); // une boîte du batch n'est pas un ingrédient
  });

  it("« Prévoir » pose la recette au premier soir libre et met aux courses ce qu'il manque", async () => {
    const now = new Date("2026-11-27T10:00:00");
    await db.cuisine_repas.put({ jour: "2026-11-27", plat: "Poulet" });
    await db.cuisine_stock.put({ id: "r", nom: "Riz", lieu: "placard", cree: 1 });
    // Samedi soir, les deux travaillent : la recette va au dimanche.
    await db.horaires.bulkPut([{ qui: "moi", jour: "2026-11-28", code: "C6" }, { qui: "elle", jour: "2026-11-28", code: "C6" }] as never);
    await prevoirRecette({ cle: "chili", plat: "Chili", ingredients: chili.ingredients, avis: 1, fois: 1, dernier: "2026-11-20", maj: 1 }, now);
    await annuler();
    await db.horaires.clear();
    await prevoirRecette({ cle: "chili", plat: "Chili", ingredients: chili.ingredients, avis: 1, fois: 1, dernier: "2026-11-20", maj: 1 }, now);
    expect(toast.mock.calls.at(-2)![0]).toContain("dimanche");
    expect(await db.cuisine_repas.get("2026-11-28")).toEqual({ jour: "2026-11-28", plat: "Chili", ingredients: chili.ingredients });
    expect((await db.cuisine_courses.toArray()).map((a) => [a.nom, a.pour])).toEqual([["Bœuf haché", ["2026-11-28"]]]);
    await annuler();
    expect([await db.cuisine_repas.count(), await db.cuisine_courses.count()]).toEqual([1, 0]);
  });
});
