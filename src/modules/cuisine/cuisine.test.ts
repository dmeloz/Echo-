import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.fn();
vi.mock("sonner", () => ({ toast: (...a: unknown[]) => toast(...a) }));
vi.stubGlobal("navigator", { onLine: false });
const stock = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => stock.get(k) ?? null, setItem: (k: string, v: string) => stock.set(k, v), removeItem: (k: string) => stock.delete(k) });

import { db } from "../../data/db";
import { lireFile } from "../../sync/file";
import { appliquer } from "../../sync/moteur";
import { ajouterArticles, cocherArticle, rangerArticle, rangerFaits, remettreHabituels, retirerArticle } from "./actions";
import { cuisine } from "./index";
import { cleDe, devinerRayon, habituelsDus, lireArticles, lireDemande, parRayon, rythme, type Article, type Habitude } from "./donnees";

const J = 86_400_000;
const ligne = (genre: string, cle: string, data: unknown, supprime = false) => ({ genre, cle, data, supprime, par: "autre", maj: new Date().toISOString() });

beforeEach(async () => {
  await Promise.all([db.cuisine_courses.clear(), db.cuisine_habitudes.clear(), db.cuisine_gouts.clear(), db.cuisine_repas.clear(), db.reglages.clear(), db.taches.clear()]);
  stock.clear(); toast.mockClear();
});

describe("lire ce qu'on écrit", () => {
  it("sépare les articles et trouve les quantités", () => {
    expect(lireArticles("2 citrons, du lait et 500 g de bœuf haché")).toEqual([
      { nom: "Citrons", qte: "2" }, { nom: "Lait", qte: "" }, { nom: "Bœuf haché", qte: "500 g" },
    ]);
    expect(lireArticles("1,5 kg de carottes\nune botte de coriandre; des œufs")).toEqual([
      { nom: "Carottes", qte: "1,5 kg" }, { nom: "Coriandre", qte: "1 botte" }, { nom: "Œufs", qte: "" },
    ]);
    expect(lireArticles("  ,  ")).toEqual([]);
  });
  it("reconnaît le même produit au singulier, au pluriel, avec ou sans accents", () => {
    expect(cleDe("Œufs")).toBe(cleDe("oeuf"));
    expect(cleDe("Crème fraîche")).toBe("creme fraiche");
  });
  it("comprend une demande pour les courses dans la barre d'Echo, et laisse le reste aux tâches", () => {
    expect(lireDemande("plus de lait")).toEqual([{ nom: "Lait", qte: "" }]);
    expect(lireDemande("Il n'y a plus d'œufs")).toEqual([{ nom: "Œufs", qte: "" }]);
    expect(lireDemande("ajoute 2 citrons et du beurre aux courses")).toEqual([{ nom: "Citrons", qte: "2" }, { nom: "Beurre", qte: "" }]);
    expect(lireDemande("courses : pain, yaourts")).toEqual([{ nom: "Pain", qte: "" }, { nom: "Yaourts", qte: "" }]);
    expect(lireDemande("Appeler le plombier demain")).toBeNull();
    expect(lireDemande("Faire les courses samedi")).toBeNull();
    expect(cuisine.comprendre?.("plus de lait")?.titre).toBe("Lait");
  });
});

describe("les rayons", () => {
  it("devine le rayon avec les mots connus", () => {
    const r = (n: string) => devinerRayon(n);
    expect([r("Carottes"), r("Lait"), r("Œufs"), r("Bœuf haché"), r("Pois chiches"), r("Baguette"), r("Papier toilette"), r("Dentifrice"), r("Jus d'orange"), r("Truc inconnu")])
      .toEqual(["fruits", "frais", "frais", "boucherie", "epicerie", "boulangerie", "maison", "hygiene", "boissons", "autre"]);
    expect([r("Lait de coco"), r("Sauce tomate"), r("Crème solaire"), r("Pommes de terre")]).toEqual(["epicerie", "epicerie", "hygiene", "fruits"]);
  });
  it("retient un rayon corrigé à la main", async () => {
    const [a] = await ajouterArticles([{ nom: "Tahini", qte: "" }]);
    expect(a.rayon).toBe("autre");
    await rangerArticle(a, "epicerie");
    await db.cuisine_courses.clear();
    const [b] = await ajouterArticles([{ nom: "tahini", qte: "" }]);
    expect(b.rayon).toBe("epicerie");
  });
  it("range par rayon dans l'ordre du magasin, les cochés en bas", () => {
    const art = (id: string, rayon: Article["rayon"], fait: number | null = null): Article => ({ id, nom: id, qte: "", rayon, par: "moi", fait, cree: 1 });
    const g = parRayon([art("riz", "epicerie"), art("lait", "frais", 5), art("oeufs", "frais"), art("pomme", "fruits")]);
    expect(g.map((x) => [x.rayon, x.reste])).toEqual([["fruits", 1], ["frais", 1], ["epicerie", 1]]);
    expect(g[1].articles.map((a) => a.id)).toEqual(["oeufs", "lait"]);
  });
});

describe("la liste de courses", () => {
  it("ajoute sans doubler, et remet un article déjà coché", async () => {
    await ajouterArticles([{ nom: "Lait", qte: "" }, { nom: "Œufs", qte: "6" }]);
    await ajouterArticles([{ nom: "lait", qte: "2 l" }]);
    let liste = await db.cuisine_courses.toArray();
    expect(liste).toHaveLength(2);
    expect(liste.find((a) => a.nom === "Lait")?.qte).toBe("2 l");
    const oeufs = liste.find((a) => a.nom === "Œufs")!;
    await cocherArticle(oeufs.id);
    expect((await db.cuisine_courses.get(oeufs.id))?.fait).toBeTruthy();
    await ajouterArticles([{ nom: "oeufs", qte: "" }]);
    liste = await db.cuisine_courses.toArray();
    expect(liste).toHaveLength(2);
    expect(liste.find((a) => a.nom === "Œufs")?.fait).toBeNull();
  });
  it("note dans la file de synchro ce qui change", async () => {
    const [a] = await ajouterArticles([{ nom: "Pain", qte: "" }]);
    expect(Object.keys(lireFile())).toEqual(["course:" + a.id]);
  });
  it("reçoit les articles de l'autre téléphone, ignore une ligne abîmée ou d'un genre inconnu", async () => {
    await appliquer([
      ligne("course", "c1", { id: "c1", nom: "Beurre", qte: "", rayon: "frais", par: "elle", fait: null, cree: 1 }),
      ligne("course", "c2", { id: "autre", nom: "Faux" }),
      ligne("course", "c3", { nom: "" }),
      ligne("gout", "elle", { qui: "elle", aime: ["Riz"], evite: "", rechauffe: "oui", maj: 2 }),
      ligne("futur", "x", { a: 1 }),
    ], false, "moi");
    expect((await db.cuisine_courses.toArray()).map((a) => a.nom)).toEqual(["Beurre"]);
    expect((await db.cuisine_gouts.get("elle"))?.aime).toEqual(["Riz"]);
    expect(lireFile()).toEqual({}); // ce qui vient de l'autre ne repart pas
    await appliquer([ligne("course", "c1", null, true)], false, "moi");
    expect(await db.cuisine_courses.count()).toBe(0);
  });
});

describe("les achats habituels", () => {
  const now = Date.UTC(2026, 10, 27);
  const hab = (x: Partial<Habitude> = {}): Habitude => ({ cle: "lait", nom: "Lait", qte: "2 l", rayon: "frais", achats: [now - 21 * J, now - 14 * J, now - 7 * J], refus: 0, ...x });

  it("trouve le rythme à partir de trois achats", () => {
    expect(rythme([1, 2])).toBeNull();
    expect(rythme(hab().achats)).toBe(7 * J);
    expect(rythme([now, now + 1000, now + 2000])).toBeNull(); // trois fois le même jour : pas un rythme
  });
  it("remet l'article quand c'est le moment, une seule fois", () => {
    expect(habituelsDus([hab()], [], now).map((a) => [a.nom, a.qte, a.par])).toEqual([["Lait", "2 l", "echo"]]);
    expect(habituelsDus([hab()], [], now - 3 * J)).toEqual([]); // trop tôt
    expect(habituelsDus([hab()], [{ id: "x", nom: "lait", qte: "", rayon: "frais", par: "moi", fait: null, cree: 1 }], now)).toEqual([]);
    expect(habituelsDus([hab({ refus: 3 })], [], now)).toEqual([]);
    expect(habituelsDus([hab()], [], now)[0].id).toBe(habituelsDus([hab()], [], now + 1000)[0].id); // deux téléphones : la même ligne
  });
  it("retient les achats en rangeant les courses faites, puis apprend quand on retire son ajout", async () => {
    await db.cuisine_habitudes.put(hab({ achats: [now - 21 * J, now - 14 * J] }));
    await db.cuisine_courses.bulkAdd([
      { id: "a", nom: "Lait", qte: "2 l", rayon: "frais", par: "moi", fait: now - 7 * J, cree: 1 },
      { id: "b", nom: "Pain", qte: "", rayon: "boulangerie", par: "moi", fait: null, cree: 1 },
    ]);
    expect(await rangerFaits(false, now)).toBe(1);
    expect((await db.cuisine_courses.toArray()).map((a) => a.id)).toEqual(["b"]);
    expect((await db.cuisine_habitudes.get("lait"))?.achats).toHaveLength(3);

    expect(await remettreHabituels(now)).toBe(1);
    expect(await remettreHabituels(now)).toBe(0);
    const remis = (await db.cuisine_courses.toArray()).find((a) => a.par === "echo")!;
    await retirerArticle(remis);
    const h = await db.cuisine_habitudes.get("lait");
    expect(h?.refus).toBe(1);
    expect(h?.pause).toBeGreaterThan(Date.now());
    expect(await remettreHabituels(now)).toBe(0);
  });
  it("ne remet rien si le réglage est éteint", async () => {
    await db.cuisine_habitudes.put(hab());
    await db.reglages.put({ cle: "cuisineHabituels", valeur: false });
    expect(await remettreHabituels(now)).toBe(0);
  });
});
