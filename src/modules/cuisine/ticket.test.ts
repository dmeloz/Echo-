import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.fn();
vi.mock("sonner", () => ({ toast: (...a: unknown[]) => toast(...a) }));
vi.stubGlobal("navigator", { onLine: false });
const memoire = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => memoire.get(k) ?? null, setItem: (k: string, v: string) => memoire.set(k, v), removeItem: (k: string) => memoire.delete(k) });

import { db } from "../../data/db";
import { lireFile } from "../../sync/file";
import { ajouterArticles } from "./actions";
import { nettoyerLecture, nettoyerTicket } from "./donnees";
import { dejaRange, jourDuTicket, rangerTicket } from "./ticket";

const NOW = new Date("2026-11-27T18:00:00");
const brut = {
  lisible: true, magasin: "Migros", date: "2026-11-27", total: 23.4, monnaie: "CHF", remarque: "",
  lignes: [
    { nom: "Lait demi-écrémé", qte: "1 L", prix: 1.6, lieu: "frigo", jours: 7, course: "Lait", sur: true },
    { nom: "Blanc de poulet", qte: "500 g", prix: 9.8, lieu: "frigo", jours: 2, course: "", sur: true },
    { nom: "Riz basmati", qte: "1 kg", prix: 3.2, lieu: "placard", jours: 9, course: "Riz", sur: false },
    { nom: "Sac en papier", qte: "", prix: 0.3, lieu: "poubelle", jours: 0, course: "Lait", sur: true },
    { nom: "", qte: "", prix: 1, lieu: "frigo", jours: 0, course: "", sur: true },
  ],
};

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
  memoire.clear(); toast.mockClear();
});

describe("ce qu'Echo a lu sur le ticket", () => {
  it("garde les lignes valides, borne les lieux et ne coche un article qu'une fois", () => {
    const lu = nettoyerLecture(brut, ["Lait", "Riz"]);
    expect(lu.lignes.map((l) => l.nom)).toEqual(["Lait demi-écrémé", "Blanc de poulet", "Riz basmati", "Sac en papier"]);
    expect(lu.lignes[3]).toMatchObject({ lieu: "aucun", course: "" }); // lieu inconnu, « Lait » déjà pris par la première ligne
    expect(lu.lignes[2].jours).toBe(0); // pas de date estimée hors du frigo
    expect(lu.lignes[2].sur).toBe(false);
  });
  it("refuse un article qui n'est pas dans la liste, et un ticket sans ligne", () => {
    expect(nettoyerLecture(brut, []).lignes.every((l) => !l.course)).toBe(true);
    expect(nettoyerLecture({ lisible: true, lignes: [] }, []).lisible).toBe(false);
    expect(nettoyerLecture("n'importe quoi", []).lisible).toBe(false);
  });
  it("prend le jour écrit sur le ticket seulement s'il est plausible", () => {
    const lu = nettoyerLecture(brut, []);
    expect(jourDuTicket(lu, NOW)).toBe("2026-11-27");
    expect(jourDuTicket({ ...lu, date: "2027-01-01" }, NOW)).toBe("2026-11-27");
    expect(jourDuTicket({ ...lu, date: "2024-01-01" }, NOW)).toBe("2026-11-27");
    expect(jourDuTicket({ ...lu, date: "2026-11-25" }, NOW)).toBe("2026-11-25");
    expect(nettoyerLecture({ ...brut, date: "2026-11-31" }, []).date).toBe("");
    expect(nettoyerLecture({ ...brut, date: "2026-13-45" }, []).date).toBe("");
    expect(nettoyerLecture({ ...brut, lignes: Array.from({ length: 90 }, (_, i) => ({ nom: "Produit " + i, lieu: "placard" })) }, []).remarque).toMatch(/80 premières/);
  });
});

describe("ranger le ticket", () => {
  it("remplit le stock, coche les courses, garde le ticket, et Annuler remet tout", async () => {
    await ajouterArticles([{ nom: "Lait", qte: "" }, { nom: "Riz", qte: "" }, { nom: "Pommes", qte: "" }], true);
    const lu = nettoyerLecture(brut, ["Lait", "Riz", "Pommes"]);
    const bilan = await rangerTicket(lu, lu.lignes, NOW);
    expect(bilan).toEqual({ stock: 3, coches: 2 });
    const stock = await db.cuisine_stock.toArray();
    expect(stock.map((p) => p.nom).sort()).toEqual(["Blanc de poulet", "Lait demi-écrémé", "Riz basmati"]);
    expect(stock.find((p) => p.nom === "Blanc de poulet")).toMatchObject({ lieu: "frigo", avant: "2026-11-29" });
    expect(stock.find((p) => p.nom === "Riz basmati")!.avant).toBeUndefined();
    const courses = await db.cuisine_courses.toArray();
    expect(courses.filter((a) => a.fait).map((a) => a.nom).sort()).toEqual(["Lait", "Riz"]);
    const [t] = await db.cuisine_tickets.toArray();
    expect(t).toMatchObject({ magasin: "Migros", date: "2026-11-27", total: 23.4, monnaie: "CHF" });
    expect(t.lignes).toHaveLength(4);
    expect(await dejaRange(lu, NOW)).toBe(true);
    // Le ticket part au foyer comme le reste.
    expect(Object.keys(lireFile())).toContain("ticket:" + t.id);

    await toast.mock.calls.at(-1)![1].action.onClick();
    expect(await db.cuisine_stock.count()).toBe(0);
    expect(await db.cuisine_tickets.count()).toBe(0);
    expect((await db.cuisine_courses.toArray()).some((a) => a.fait)).toBe(false);
  });
  it("ne double pas un produit déjà au même endroit : sa date est rafraîchie", async () => {
    await db.cuisine_stock.add({ id: "p1", nom: "Blanc de poulet", lieu: "frigo", avant: "2026-11-20", cree: 1 });
    const lu = nettoyerLecture(brut, []);
    const bilan = await rangerTicket(lu, lu.lignes.slice(1, 2), NOW);
    expect(bilan.stock).toBe(0);
    expect(await db.cuisine_stock.toArray()).toEqual([{ id: "p1", nom: "Blanc de poulet", lieu: "frigo", avant: "2026-11-29", cree: 1 }]);
    await toast.mock.calls.at(-1)![1].action.onClick();
    expect((await db.cuisine_stock.get("p1"))!.avant).toBe("2026-11-20");
  });
  it("rangé ailleurs qu'au frigo, le produit n'a pas de date ; racheté sans estimation, l'ancienne date part", async () => {
    await db.cuisine_stock.add({ id: "p1", nom: "Lait demi-écrémé", lieu: "frigo", avant: "2026-11-20", cree: 1 });
    const lu = nettoyerLecture(brut, []);
    await rangerTicket(lu, [{ ...lu.lignes[1], lieu: "congelateur" }, { ...lu.lignes[0], jours: 0 }], NOW);
    const stock = await db.cuisine_stock.toArray();
    expect(stock.find((p) => p.lieu === "congelateur")!.avant).toBeUndefined();
    expect(stock.find((p) => p.id === "p1")!.avant).toBeUndefined();
    await toast.mock.calls.at(-1)![1].action.onClick();
    expect(await db.cuisine_stock.toArray()).toEqual([{ id: "p1", nom: "Lait demi-écrémé", lieu: "frigo", avant: "2026-11-20", cree: 1 }]);
  });
  it("reconnaît un ticket déjà rangé même quand le total était illisible", async () => {
    const lu = { ...nettoyerLecture(brut, []), total: 0 };
    expect(await dejaRange(lu, NOW)).toBe(false);
    await rangerTicket(lu, lu.lignes.slice(0, 2), NOW);
    expect(await dejaRange(lu, NOW)).toBe(true);
  });
  it("une ligne décochée ou « pas au stock » ne va pas au stock", async () => {
    const lu = nettoyerLecture(brut, []);
    await rangerTicket(lu, [{ ...lu.lignes[0], lieu: "aucun" }], NOW);
    expect(await db.cuisine_stock.count()).toBe(0);
    expect((await db.cuisine_tickets.toArray())[0].lignes).toHaveLength(1);
  });
  it("nettoie un ticket reçu de l'autre téléphone", () => {
    expect(nettoyerTicket({ id: "t", date: "hier", par: "moi" })).toBeNull();
    expect(nettoyerTicket({ id: "t", date: "2026-11-27", par: "elle", total: "12", lignes: [{ nom: "Lait", prix: 1.6 }, { prix: 3 }] }))
      .toMatchObject({ total: 0, monnaie: "CHF", lignes: [{ nom: "Lait", qte: "", prix: 1.6 }] });
  });
});
