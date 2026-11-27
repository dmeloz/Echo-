import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.fn();
vi.mock("sonner", () => ({ toast: (...a: unknown[]) => toast(...a) }));
vi.stubGlobal("navigator", { onLine: false });
const garde = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => garde.get(k) ?? null, setItem: (k: string, v: string) => garde.set(k, v), removeItem: (k: string) => garde.delete(k) });

import { db } from "../../data/db";
import { rangerFaits } from "./actions";
import { chercherProduit, rangerScanne } from "./codeBarres";
import { codeValide, lieuProbable, magasinHabituel, magasinsConnus, nettoyerHabitude, nomMagasin, type LectureTicket, type LigneTicket } from "./donnees";
import { rangerTicket } from "./ticket";

const annuler = () => toast.mock.calls.at(-1)![1].action.onClick();
const ligne = (nom: string, x: Partial<LigneTicket> = {}): LigneTicket => ({ nom, qte: "", prix: 1, lieu: "placard", jours: 0, course: "", sur: true, ...x });
const ticket = (magasin: string, lignes: LigneTicket[]): LectureTicket => ({ lisible: true, magasin, date: "2026-11-27", total: lignes.length, monnaie: "CHF", lignes, remarque: "" });
const now = new Date("2026-11-27T18:00:00");

beforeEach(async () => {
  await Promise.all([db.cuisine_stock.clear(), db.cuisine_courses.clear(), db.cuisine_habitudes.clear(), db.cuisine_tickets.clear(), db.cuisine_codes.clear(), db.reglages.clear()]);
  toast.mockClear();
});

describe("plusieurs magasins", () => {
  it("reconnaît l'enseigne d'un ticket", () => {
    expect([nomMagasin("MIGROS NYON"), nomMagasin("Migros Gland"), nomMagasin("lidl"), nomMagasin(" * "), nomMagasin("")]).toEqual(["Migros", "Migros", "Lidl", "", ""]);
  });

  it("retient où chaque produit s'achète, et Annuler l'oublie", async () => {
    await db.cuisine_courses.put({ id: "a", nom: "Lait", qte: "", rayon: "frais", par: "moi", fait: null, cree: 1 });
    await rangerTicket(ticket("MIGROS NYON", [ligne("Lait entier 1L", { course: "Lait", lieu: "frigo" }), ligne("Riz basmati")]), [ligne("Lait entier 1L", { course: "Lait", lieu: "frigo" }), ligne("Riz basmati")], now);
    const lidl = [ligne("Riz basmati"), ligne("Riz basmati")];
    await rangerTicket(ticket("Lidl", lidl), lidl, now);
    await rangerTicket({ ...ticket("Lidl", lidl), total: 9 }, lidl, now);
    const habitudes = await db.cuisine_habitudes.toArray();
    expect(magasinHabituel(habitudes.find((h) => h.cle === "lait"))).toBe("Migros"); // sous le nom de l'article de la liste
    expect(habitudes.find((h) => h.cle === "riz basmati")!.ou).toEqual({ Migros: 1, Lidl: 2 }); // une fois par ticket
    expect(magasinHabituel(habitudes.find((h) => h.cle === "riz basmati"))).toBe("Lidl");
    expect(magasinsConnus(habitudes)).toEqual(["Lidl", "Migros"]);
    await annuler();
    expect((await db.cuisine_habitudes.get("riz basmati"))!.ou).toEqual({ Migros: 1, Lidl: 1 });
    // Ranger les courses garde ce qu'Echo sait du magasin.
    await rangerFaits(true);
    expect((await db.cuisine_habitudes.get("lait"))!.ou).toEqual({ Migros: 1 });
    expect((await db.cuisine_habitudes.get("lait"))!.achats.length).toBe(1);
  });

  it("ne garde d'une habitude venue d'ailleurs que des magasins plausibles", () => {
    expect(nettoyerHabitude({ cle: "lait", nom: "Lait", rayon: "frais", achats: [], ou: { "MIGROS nyon": 2, x: 1, Coop: "3", Lidl: 0 } })!.ou).toEqual({ Migros: 2 });
    expect(nettoyerHabitude({ cle: "lait", nom: "Lait", rayon: "frais", achats: [] })!.ou).toBeUndefined();
  });
});

describe("le code-barres", () => {
  it("vérifie le chiffre de contrôle", () => {
    expect([codeValide("7610200012340"), codeValide("7610200012341"), codeValide("96385074"), codeValide("036000291452"), codeValide("123"), codeValide("76102000123ab")]).toEqual([true, false, true, true, false, false]);
  });
  it("devine où ranger", () => {
    expect([lieuProbable("Crème entière"), lieuProbable("Pizza surgelée"), lieuProbable("Lessive"), lieuProbable("Riz basmati"), lieuProbable("Truc inconnu")]).toEqual(["frigo", "congelateur", "maison", "placard", "placard"]);
  });
  it("range le produit scanné, compte le deuxième, se souvient du code, et Annuler remet", async () => {
    const creme = { code: "7610200012340", nom: " Crème  entière ", qte: "25 cl" };
    await rangerScanne(creme, "frigo");
    expect(await db.cuisine_stock.toArray()).toMatchObject([{ nom: "Crème entière", lieu: "frigo", qte: "25 cl" }]);
    await rangerScanne(creme, "frigo");
    await rangerScanne(creme, "frigo");
    expect((await db.cuisine_stock.toArray()).map((p) => p.nb)).toEqual([3]);
    await annuler();
    expect((await db.cuisine_stock.toArray()).map((p) => p.nb)).toEqual([2]);
    // Hors ligne, un code déjà vu est retrouvé ; un code jamais vu reste à nommer.
    expect(await chercherProduit("7610200012340")).toEqual({ code: "7610200012340", nom: "Crème entière", qte: "25 cl", connu: true });
    expect(await chercherProduit("96385074")).toEqual({ code: "96385074", nom: "", qte: "", connu: false });
    await rangerScanne({ code: "96385074", nom: "Riz", qte: "" }, "placard");
    await annuler();
    expect(await db.cuisine_stock.count()).toBe(1);
  });
});
