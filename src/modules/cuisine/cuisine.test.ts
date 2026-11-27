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
import { preparerDemande, refuserProposition, validerSemaine, versTravail } from "./semaineEcho";
import { additionner, besoins, manquants, nettoyerRepas } from "./donnees";
import { poserRepas } from "./actions";
import { cleDe, devinerRayon, habituelsDus, lireArticles, lireDemande, parRayon, rythme, type Article, type Habitude } from "./donnees";

const J = 86_400_000;
const ligne = (genre: string, cle: string, data: unknown, supprime = false) => ({ genre, cle, data, supprime, par: "autre", maj: new Date().toISOString() });

beforeEach(async () => {
  await Promise.all([db.cuisine_stock.clear(), db.cuisine_courses.clear(), db.cuisine_habitudes.clear(), db.cuisine_gouts.clear(), db.cuisine_repas.clear(), db.reglages.clear(), db.taches.clear()]);
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
    expect(lireArticles("lait 1,5 l, tomates 4")).toEqual([{ nom: "Lait", qte: "1,5 l" }, { nom: "Tomates", qte: "4" }]);
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
    for (const phrase of ["Penser aux courses", "Rembourser Sarah pour les courses", "Plus de 30 min de sport par jour", "plus d'excuses"]) expect(lireDemande(phrase)).toBeNull();
    expect(lireDemande("on n'a plus de tahini")).toEqual([{ nom: "Tahini", qte: "" }]);
    expect(lireDemande("du lait aux courses")).toEqual([{ nom: "Lait", qte: "" }]);
    expect(cuisine.comprendre?.("plus de lait")?.titre).toBe("Lait");
  });
});

describe("les rayons", () => {
  it("devine le rayon avec les mots connus", () => {
    const r = (n: string) => devinerRayon(n);
    expect([r("Carottes"), r("Lait"), r("Œufs"), r("Bœuf haché"), r("Pois chiches"), r("Baguette"), r("Papier toilette"), r("Dentifrice"), r("Jus d'orange"), r("Truc inconnu")])
      .toEqual(["fruits", "frais", "frais", "boucherie", "epicerie", "boulangerie", "maison", "hygiene", "boissons", "autre"]);
    expect([r("Lait de coco"), r("Sauce tomate"), r("Crème solaire"), r("Pommes de terre")]).toEqual(["epicerie", "epicerie", "hygiene", "fruits"]);
    expect([r("Essuie-tout"), r("Pizza"), r("Haricots"), r("Lave-vaisselle")]).toEqual(["maison", "surgeles", "fruits", "maison"]);
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

describe("la semaine proposée par Echo", () => {
  const semaine = ["2026-11-30", "2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"];
  const noms = { moi: "Dany", elle: "Sarah" };
  const travail = versTravail([
    { qui: "moi", jour: "2026-11-30", code: "C5" }, { qui: "moi", jour: "2026-12-02", code: "C6" }, { qui: "moi", jour: "2026-12-03", code: "C1" }, { qui: "moi", jour: "2026-12-04", code: "R" },
    ...semaine.slice(0, 5).map((jour) => ({ qui: "elle" as const, jour, code: "FIX" as const })),
  ]);

  it("compte les portions du soir selon les horaires, et la gamelle des jours de travail fixes", () => {
    const b = besoins(semaine, travail);
    expect(b.map((x) => x.soir)).toEqual([2, 2, 1, 1, 2, 2, 2]); // mercredi (jusqu'à 21 h) et jeudi (coupé jusqu'à 22 h 30) : une seule portion
    expect(b[2].absents).toEqual(["moi"]);
    expect(b.map((x) => x.gamelle)).toEqual(["elle", "elle", "elle", "elle", "elle", null, null]);
  });
  it("garde les champs d'un repas proposé et écarte un repas abîmé", () => {
    expect(nettoyerRepas({ jour: "2026-12-03", plat: "Bœuf carottes", congele: true, propose: true, gamelle: " Chili de mardi ", ingredients: [{ nom: "carottes", qte: "1 kg" }, { nom: "" }, 3] }))
      .toEqual({ jour: "2026-12-03", plat: "Bœuf carottes", congele: true, propose: true, gamelle: "Chili de mardi", ingredients: [{ nom: "carottes", qte: "1 kg" }] });
    expect(nettoyerRepas({ jour: "2026-12-03", plat: "Riz" })).toEqual({ jour: "2026-12-03", plat: "Riz" });
    expect(nettoyerRepas({ jour: "jeudi", plat: "Riz" })).toBeNull();
  });
  it("ne met aux courses que ce qui manque, chaque produit une fois", () => {
    const repas = [
      { jour: "2026-11-30", plat: "Chili", ingredients: [{ nom: "haricots rouges", qte: "1 boîte" }, { nom: "riz", qte: "300 g" }, { nom: "oignons", qte: "2" }] },
      { jour: "2026-12-01", plat: "Curry", ingredients: [{ nom: "Riz", qte: "200 g" }, { nom: "pois chiches", qte: "1 boîte" }] },
    ];
    expect(manquants(repas, [{ id: "s", nom: "Oignon", lieu: "placard", cree: 1 }])).toEqual([
      { nom: "Haricots rouges", qte: "1 boîte", jours: ["2026-11-30"] }, { nom: "Riz", qte: "500 g", jours: ["2026-11-30", "2026-12-01"] }, { nom: "Pois chiches", qte: "1 boîte", jours: ["2026-12-01"] },
    ]);
    expect([additionner("1,5 kg", "500 g"), additionner("2", "3"), additionner("", "1 botte")]).toEqual(["1,5 kg + 500 g", "5", "1 botte"]);
  });
  it("prépare la demande : jours, goûts par prénom, stock, plats gardés et récents", async () => {
    await db.cuisine_gouts.put({ qui: "elle", aime: ["Riz"], evite: "champignons", rechauffe: "oui", maj: 1 });
    await db.cuisine_stock.bulkPut([
      { id: "r", nom: "Riz", lieu: "placard", reste: "moitie", cree: 1 }, { id: "l", nom: "Lessive", lieu: "maison", cree: 1 },
      { id: "b", nom: "Beurre", lieu: "frigo", reste: "peu", cree: 1 }, { id: "y", nom: "Yaourts", lieu: "frigo", cree: 1 },
      { id: "s", nom: "Courgettes", lieu: "frigo", avant: "2026-12-01", cree: 1 },
    ]);
    await db.cuisine_repas.bulkPut([{ jour: "2026-11-25", plat: "Lasagnes" }, { jour: "2026-11-30", plat: "Poulet rôti" }, { jour: "2026-12-01", plat: "Vieux plat", propose: true }]);
    const b = besoins(semaine, travail).slice(1, 3);
    const d = await preparerDemande(b, noms, semaine, ["Chili"], new Date("2026-11-27T10:00:00"));
    expect(d.jours).toEqual([{ jour: "2026-12-01", soir: 2, gamelle: true }, { jour: "2026-12-02", soir: 1, gamelle: true }]);
    expect(d.gamellePour).toBe("Sarah");
    expect(d.gouts).toEqual([{ prenom: "Sarah", aime: ["Riz"], evite: "champignons", rechauffe: "oui" }]);
    // Le frigo d'abord (ce qui presse en tête), sans les produits de la maison ni ce qui est presque fini.
    expect(d.stock).toEqual([
      { nom: "Courgettes", avant: "2026-12-01", lieu: "frigo", moitie: false }, { nom: "Yaourts", avant: "", lieu: "frigo", moitie: false },
      { nom: "Riz", avant: "", lieu: "placard", moitie: true },
    ]);
    expect([d.aujourdhui, d.cuisine]).toEqual(["2026-11-27", "2026-11-29"]);
    expect(d.gardes).toEqual([{ jour: "2026-11-30", plat: "Poulet rôti" }]);
    expect(d.recents).toEqual(["Lasagnes"]);
    expect(d.eviter).toEqual(["Chili"]);
  });
  it("valide la proposition : les repas restent, ce qui manque part aux courses, et Annuler remet tout", async () => {
    await db.cuisine_stock.put({ id: "s", nom: "Riz", lieu: "placard", cree: 1 });
    await db.cuisine_courses.bulkPut([
      { id: "deja", nom: "Pain", qte: "", rayon: "boulangerie", par: "moi", fait: null, cree: 1 },
      { id: "pris", nom: "Haricots rouges", qte: "3 boîtes", rayon: "epicerie", par: "moi", fait: 5, cree: 1 },
    ]);
    await db.cuisine_repas.bulkPut([
      { jour: "2026-11-30", plat: "Chili", propose: true, ingredients: [{ nom: "haricots rouges", qte: "1 boîte" }, { nom: "riz", qte: "300 g" }] },
      { jour: "2026-12-01", plat: "Curry", propose: true, ingredients: [{ nom: "pois chiches", qte: "1 boîte" }] },
    ]);
    await validerSemaine(semaine);
    expect((await db.cuisine_repas.toArray()).every((r) => !r.propose)).toBe(true);
    // Un article déjà dans la liste (même coché) n'est pas touché ; le nouveau sait pour quel repas il est là.
    expect(await db.cuisine_courses.get("pris")).toMatchObject({ qte: "3 boîtes", fait: 5 });
    const pois = (await db.cuisine_courses.toArray()).find((a) => a.nom === "Pois chiches")!;
    expect(pois).toMatchObject({ rayon: "epicerie", pour: ["2026-12-01"] });
    expect(await db.cuisine_courses.count()).toBe(3);
    // Ajouté par quelqu'un d'autre entre-temps : Annuler ne l'emporte pas.
    await db.cuisine_courses.put({ id: "lait", nom: "Lait", qte: "", rayon: "frais", par: "elle", fait: null, cree: 2 });
    await toast.mock.calls.at(-1)![1].action.onClick();
    expect((await db.cuisine_courses.toArray()).map((a) => a.id).sort()).toEqual(["deja", "lait", "pris"]);
    expect((await db.cuisine_repas.toArray()).every((r) => r.propose)).toBe(true);
    await refuserProposition(semaine);
    expect(await db.cuisine_repas.count()).toBe(0);
  });
});

describe("changer un repas validé", () => {
  it("écrire ou retirer un plat fait repartir ses courses, et un plat écrit sur une proposition n'est plus une proposition", async () => {
    await db.cuisine_repas.bulkPut([{ jour: "2026-12-01", plat: "Curry", ingredients: [{ nom: "pois chiches", qte: "1 boîte" }] }, { jour: "2026-12-02", plat: "Dahl", propose: true }]);
    await db.cuisine_courses.bulkPut([
      { id: "a", nom: "Pois chiches", qte: "1 boîte", rayon: "epicerie", par: "moi", fait: null, cree: 1, pour: ["2026-12-01"] },
      { id: "b", nom: "Riz", qte: "500 g", rayon: "epicerie", par: "moi", fait: null, cree: 1, pour: ["2026-12-01", "2026-12-03"] },
    ]);
    await poserRepas("2026-12-01", "Restes");
    expect((await db.cuisine_courses.toArray()).map((a) => [a.id, a.pour])).toEqual([["b", ["2026-12-03"]]]);
    expect(await db.cuisine_repas.get("2026-12-01")).toEqual({ jour: "2026-12-01", plat: "Restes" });
    await toast.mock.calls.at(-1)![1].action.onClick();
    expect(await db.cuisine_courses.count()).toBe(2);
    await poserRepas("2026-12-02", "Raclette");
    await refuserProposition(["2026-12-01", "2026-12-02"]);
    expect((await db.cuisine_repas.get("2026-12-02"))?.plat).toBe("Raclette");
  });
});

describe("lien de recette", () => {
  it("garde une page web, refuse le reste", async () => {
    const { lienRecette, nettoyerRecette, cleDe } = await import("./donnees");
    expect(lienRecette("marmiton.org/recettes/lasagnes")).toBe("https://marmiton.org/recettes/lasagnes");
    expect(lienRecette("javascript:alert(1)")).toBe("");
    expect(lienRecette("bonjour")).toBe("");
    expect(lienRecette("")).toBe("");
    const r = nettoyerRecette({ cle: cleDe("Lasagnes"), plat: "Lasagnes", avis: 1, fois: 1, dernier: "", lien: "https://exemple.fr/l", maj: 1 });
    expect(r?.lien).toBe("https://exemple.fr/l");
    expect(nettoyerRecette({ cle: cleDe("Lasagnes"), plat: "Lasagnes", avis: 1, fois: 1, dernier: "", lien: "data:text/html,x", maj: 1 })?.lien).toBeUndefined();
  });
});
