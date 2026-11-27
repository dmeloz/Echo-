import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.fn();
vi.mock("sonner", () => ({ toast: (...a: unknown[]) => toast(...a) }));
vi.stubGlobal("navigator", { onLine: false });
const stock = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => stock.get(k) ?? null, setItem: (k: string, v: string) => stock.set(k, v), removeItem: (k: string) => stock.delete(k) });

import { db } from "../../data/db";
import { GENRES } from "../../sync/genres";
import { ajouterAPayer, ajouterCategorie, ajouterDepense, ajouterPoste, arreterPoste, changerValeur, commencer, estPaye, marquerPaye, noterSolde, payer, payeurDuTicket, recalculerVirements, rembourser, retirerDerniereValeur } from "./actions";
import {
  DEPART, aRemplir, avancee, avances, avecTickets, bilan, debutBudget, depenseDuTicket, duA, echeancesDu, bornes, changer, chf, cleCategorie, dernierSolde, duMois, effets, enveloppes, historique, lireMontant, moisDe, nettoyerAPayer, nettoyerCategorie, nettoyerDepense, nettoyerPoste,
  nettoyerSolde, nomMois, parMois, periode, plusMoisB, posteRempli, proposerVirements, toutesCategories, valeurDe, type Depense, type Poste,
} from "./donnees";
import { budget } from "./index";

// Un foyer d'essai (des chiffres ronds, pas ceux d'un vrai foyer).
const M = "2026-12";
const poste = (x: Partial<Poste> & Pick<Poste, "id" | "sorte">, c: number): Poste => ({ nom: x.id, rythme: "mois", valeurs: [{ des: "2026-11", c, quand: 1 }], cree: 1, ...x });
const FOYER: Poste[] = [
  poste({ id: "revenu-moi", sorte: "revenu", qui: "moi" }, 300_000),
  poste({ id: "revenu-elle", sorte: "revenu", qui: "elle" }, 500_000),
  poste({ id: "assurance", sorte: "perso", qui: "moi" }, 40_000),
  poste({ id: "leasing", sorte: "perso", qui: "elle" }, 60_000),
  poste({ id: "virement-moi", sorte: "virement", qui: "moi" }, 140_000),
  poste({ id: "virement-elle", sorte: "virement", qui: "elle" }, 260_000),
  poste({ id: "loyer", sorte: "foyer", compte: "commun" }, 200_000),
  poste({ id: "courses", sorte: "foyer", compte: "commun", cat: "courses" }, 50_000),
  poste({ id: "internet", sorte: "foyer", compte: "facture" }, 10_000),
  poste({ id: "assurance-voiture", sorte: "foyer", compte: "facture", rythme: "an", groupe: "Véhicules" }, 120_000),
  poste({ id: "part-plaisir", sorte: "part" }, 25),
];
const annuler = () => (toast.mock.calls.at(-1)![1] as { action: { onClick: () => Promise<unknown> } }).action.onClick();

beforeEach(async () => {
  await Promise.all([db.budget_postes.clear(), db.budget_depenses.clear(), db.budget_categories.clear(), db.budget_soldes.clear(), db.budget_apayer.clear()]);
  stock.clear(); toast.mockClear();
});

describe("le mois de budget", () => {
  it("commence le 25 et porte le nom du mois où il finit", () => {
    expect(moisDe("2026-11-24")).toBe("2026-11");
    expect(moisDe("2026-11-25")).toBe("2026-12");
    expect(moisDe("2026-12-24")).toBe("2026-12");
    expect(moisDe("2026-12-25")).toBe("2027-01"); // passe l'année
    expect(bornes("2026-12")).toEqual({ du: "2026-11-25", au: "2026-12-24" });
    expect(bornes("2027-01")).toEqual({ du: "2026-12-25", au: "2027-01-24" });
    expect(nomMois("2026-12")).toBe("Décembre");
    expect(periode("2026-12")).toBe("25 nov. – 24 déc.");
    expect(plusMoisB("2026-12", 1)).toBe("2027-01");
    expect(plusMoisB("2027-01", -1)).toBe("2026-12");
  });
  it("sait où on en est dans le mois", () => {
    expect(avancee(M, "2026-11-25")).toEqual({ passes: 1, total: 30, restants: 30 });
    expect(avancee(M, "2026-12-24")).toEqual({ passes: 30, total: 30, restants: 1 });
    expect(avancee(M, "2026-12-30").restants).toBe(0);
    expect(avancee(M, "2026-11-01")).toEqual({ passes: 0, total: 30, restants: 30 });
  });
});

describe("les montants datés", () => {
  it("une valeur vaut à partir de son mois, pas avant", () => {
    const p = changer(FOYER[6], { c: 210_000, des: "2027-02", quand: 5 });
    expect(valeurDe(p, "2026-10")).toBeNull(); // le poste n'existait pas encore
    expect(valeurDe(p, "2026-12")).toBe(200_000);
    expect(valeurDe(p, "2027-01")).toBe(200_000);
    expect(valeurDe(p, "2027-02")).toBe(210_000);
    expect(valeurDe(p, "2027-09")).toBe(210_000);
  });
  it("« une seule fois » ne vaut que pour son mois", () => {
    const p = changer(FOYER[7], { c: 65_000, des: M, une: true, quand: 5 });
    expect(valeurDe(p, M)).toBe(65_000);
    expect(valeurDe(p, "2027-01")).toBe(50_000);
    expect(valeurDe(p, "2026-11")).toBe(50_000);
  });
  it("reposer une valeur pour le même mois : la plus récente gagne, l'ancienne reste dans l'historique", () => {
    let p = changer(FOYER[6], { c: 210_000, des: M, quand: 5 });
    p = changer(p, { c: 220_000, des: M, quand: 6 });
    expect(p.valeurs).toHaveLength(3);
    expect(valeurDe(p, M)).toBe(220_000);
    expect(historique(p).map((v) => v.c)).toEqual([220_000, 210_000, 200_000]);
  });
  it("une valeur durable reposée après un « une seule fois » du même mois passe devant", () => {
    let p = changer(FOYER[6], { c: 50_000, des: M, une: true, quand: 5 });
    expect(valeurDe(p, M)).toBe(50_000);
    p = changer(p, { c: 150_000, des: M, quand: 6 });
    expect(valeurDe(p, M)).toBe(150_000);
    expect(effets([FOYER[4], FOYER[5], changer(FOYER[6], { c: 50_000, des: M, une: true, quand: 5 })], "loyer", { c: 150_000, des: M })).not.toEqual([]);
    // Un « une seule fois » posé après garde la main sur son mois, pas sur le suivant.
    p = changer(p, { c: 70_000, des: M, une: true, quand: 7 });
    expect([valeurDe(p, M), valeurDe(p, "2027-01")]).toEqual([70_000, 150_000]);
  });
  it("zéro n'est « à remplir » que tant que personne ne l'a choisi", () => {
    const vide = poste({ id: "x", sorte: "foyer" }, 0);
    expect(aRemplir(vide, M)).toBe(true);
    expect(aRemplir(changer(vide, { c: 0, des: M, par: "moi" }), M)).toBe(false);
    expect(aRemplir(FOYER[6], M)).toBe(false);
    expect([posteRempli(vide), posteRempli(FOYER[6]), posteRempli(null)]).toEqual([false, true, false]);
    expect(GENRES.budget_poste.garderLocal!(FOYER[6], vide)).toBe(true);
    expect(GENRES.budget_poste.garderLocal!(vide, FOYER[6])).toBe(false);
    expect(GENRES.budget_poste.garderLocal!(FOYER[6], FOYER[6])).toBe(false); // deux lignes remplies : celle du foyer gagne
  });
  it("un poste arrêté reste dans les mois d'avant", () => {
    const p = { ...FOYER[8], fin: "2027-01" };
    expect(valeurDe(p, M)).toBe(10_000);
    expect(valeurDe(p, "2027-01")).toBeNull();
  });
  it("un poste à l'année met un douzième de côté chaque mois", () => {
    expect(parMois(FOYER[9], M)).toBe(10_000);
    expect(parMois(poste({ id: "x", sorte: "foyer", rythme: "an" }, 11_800), M)).toBe(983); // 118 par an : 9.83 par mois
  });
});

describe("le bilan du mois : tout est calculé", () => {
  const b = bilan(FOYER, M);
  it("ce qui reste à chacun = salaire − charges perso − virement", () => {
    expect(b.reste).toEqual({ moi: 120_000, elle: 180_000 });
  });
  it("le reste du commun = ce qui est versé − les charges du foyer, puis partagé", () => {
    expect(b.entree).toBe(400_000);
    expect(b.foyer).toBe(270_000);
    expect(b.parCompte).toEqual({ commun: 250_000, facture: 20_000 });
    expect(b.resteCommun).toBe(130_000);
    expect(b.plaisir).toBe(32_500);
    expect(b.epargne).toBe(97_500);
    expect(b.plaisir + b.epargne).toBe(b.resteCommun); // pas un centime perdu
  });
  it("un reste négatif n'est pas partagé", () => {
    const serre = bilan(FOYER.map((p) => (p.id === "loyer" ? changer(p, { c: 400_000, des: M }) : p)), M);
    expect(serre.resteCommun).toBe(-70_000);
    expect(serre.plaisir).toBe(0);
    expect(serre.epargne).toBe(0);
  });
  it("un mois d'avant ne bouge pas quand on change une valeur", () => {
    const apres = FOYER.map((p) => (p.id === "loyer" ? changer(p, { c: 230_000, des: "2027-01" }) : p));
    expect(bilan(apres, M)).toEqual(b);
    expect(bilan(apres, "2027-01").resteCommun).toBe(100_000);
  });
});

describe("ce que ça change, avant de valider", () => {
  it("une charge perso ne touche que le reste de la personne", () => {
    expect(effets(FOYER, "assurance", { c: 45_000, des: M })).toEqual([{ quoi: "reste-moi", avant: 120_000, apres: 115_000 }]);
  });
  it("une charge du foyer touche le commun, le plaisir et l'épargne", () => {
    expect(effets(FOYER, "loyer", { c: 210_000, des: M }).map((e) => [e.quoi, e.apres])).toEqual([["commun", 120_000], ["plaisir", 30_000], ["epargne", 90_000]]);
  });
  it("un virement touche la personne et le commun", () => {
    expect(effets(FOYER, "virement-moi", { c: 150_000, des: M }).map((e) => e.quoi)).toEqual(["reste-moi", "commun", "plaisir", "epargne"]);
  });
  it("rien ne bouge : aucune ligne", () => {
    expect(effets(FOYER, "loyer", { c: 200_000, des: M })).toEqual([]);
  });
});

describe("les virements calculés par Echo", () => {
  it("le même total, réparti selon les salaires", () => {
    expect(proposerVirements(FOYER, M)).toEqual({ moi: 150_000, elle: 250_000 });
  });
  it("sans salaire, pas de calcul", () => {
    expect(proposerVirements(FOYER.filter((p) => p.id !== "revenu-elle"), M)).toBeNull();
  });
  it("le calcul se pose comme un changement, et s'annule", async () => {
    await db.budget_postes.bulkAdd(FOYER);
    expect(await recalculerVirements(M, "moi")).toBe(true);
    let b = bilan(await db.budget_postes.toArray(), M);
    expect(b.virement).toEqual({ moi: 150_000, elle: 250_000 });
    expect(bilan(await db.budget_postes.toArray(), "2026-11").virement.moi).toBe(140_000); // novembre n'a pas bougé
    await annuler();
    b = bilan(await db.budget_postes.toArray(), M);
    expect(b.virement).toEqual({ moi: 140_000, elle: 260_000 });
  });
});

describe("les dépenses et les enveloppes", () => {
  const dep = (x: Partial<Depense>): Depense => ({ id: "d" + Math.random(), jour: "2026-11-27", c: 1000, quoi: "", cat: "courses", qui: "commun", cree: 1, ...x });
  it("ne compte que les dépenses du mois de budget", () => {
    const ds = [dep({ jour: "2026-11-24" }), dep({ jour: "2026-11-25", c: 2000 }), dep({ jour: "2026-12-24", c: 3000 }), dep({ jour: "2026-12-25" })];
    expect(duMois(ds, M).map((d) => d.c)).toEqual([3000, 2000]);
  });
  it("Courses a son budget ; Plaisir reçoit sa part du reste commun", () => {
    const e = enveloppes(FOYER, [dep({ c: 8_500 }), dep({ c: 3_200, cat: "plaisir", qui: "moi" })], M);
    expect(e).toEqual([
      { cat: "courses", nom: "courses", budget: 50_000, depense: 8_500, reste: 41_500 },
      { cat: "plaisir", nom: "Plaisir", budget: 32_500, depense: 3_200, reste: 29_300 },
    ]);
  });
  it("garde une dépense, puis l'annule", async () => {
    const d = await ajouterDepense({ c: 3_200, quoi: "  Pizza  à emporter ", cat: "plaisir", qui: "moi" }, new Date("2026-11-27T12:00:00"));
    expect(d).toMatchObject({ jour: "2026-11-27", quoi: "Pizza à emporter", c: 3_200 });
    expect(await ajouterDepense({ c: 0, quoi: "rien", cat: "divers", qui: "commun" })).toBeNull();
    await annuler();
    expect(await db.budget_depenses.count()).toBe(0);
  });
  it("trois catégories de base, et celles qu'on crée sont gardées une seule fois", async () => {
    expect(toutesCategories([]).map((c) => c.nom)).toEqual(["Courses", "Plaisir", "Frais divers"]);
    expect((await ajouterCategorie("cadeaux de Noël"))!.id).toBe("cadeaux-de-noel");
    await ajouterCategorie("Cadeaux de noel");
    expect((await ajouterCategorie("courses"))!.nom).toBe("Courses"); // une catégorie de base n'est pas recréée
    const creees = await db.budget_categories.toArray();
    expect(creees).toHaveLength(1);
    expect(toutesCategories(creees).map((c) => c.nom)).toEqual(["Courses", "Plaisir", "Frais divers", "Cadeaux de Noël"]);
    expect(cleCategorie("  Été & vacances ")).toBe("ete-vacances");
  });
});

describe("les gestes sur les postes", () => {
  it("le premier jour pose les lignes de départ, sans rien doubler", async () => {
    expect(await commencer(new Date("2026-11-27T12:00:00"))).toBe(DEPART.length);
    expect(await commencer(new Date("2026-11-27T12:00:00"))).toBe(0);
    const b = bilan(await db.budget_postes.toArray(), M);
    expect(b.pctPlaisir).toBe(25);
    expect(b.foyer).toBe(0);
  });
  it("changer une valeur ajoute une ligne datée ; Annuler remet l'ancienne", async () => {
    await db.budget_postes.bulkAdd(FOYER);
    expect(await changerValeur("assurance", { c: 45_000, des: "2027-01", par: "moi" })).toBe(true);
    let p = (await db.budget_postes.get("assurance"))!;
    expect([valeurDe(p, M), valeurDe(p, "2027-01")]).toEqual([40_000, 45_000]);
    await annuler();
    p = (await db.budget_postes.get("assurance"))!;
    expect(valeurDe(p, "2027-01")).toBe(40_000);
    expect(await changerValeur("inconnu", { c: 1, des: M })).toBe(false);
  });
  it("revenir à la valeur d'avant, sans jamais vider un poste", async () => {
    await db.budget_postes.bulkAdd(FOYER);
    expect(await retirerDerniereValeur("loyer")).toBe(false); // une seule valeur : rien à retirer
    await changerValeur("loyer", { c: 210_000, des: "2027-01", quand: 9 });
    await changerValeur("loyer", { c: 220_000, des: "2027-01", quand: 10 }); // une correction pour le même mois
    expect(await retirerDerniereValeur("loyer")).toBe(true);
    expect(valeurDe((await db.budget_postes.get("loyer"))!, "2027-01")).toBe(210_000); // la valeur juste avant, pas celle de décembre
    expect(await retirerDerniereValeur("loyer")).toBe(true);
    expect(valeurDe((await db.budget_postes.get("loyer"))!, "2027-01")).toBe(200_000);
    await changerValeur("part-plaisir", { c: 30, des: M });
    expect(toast.mock.calls.at(-1)![0]).toBe("part-plaisir : 30 %");
  });
  it("ajouter une charge, sans doublon ; l'arrêter la garde dans le passé", async () => {
    const p = (await ajouterPoste({ nom: "netflix", sorte: "perso", qui: "elle", c: 2_000, des: M }))!;
    expect(p).toMatchObject({ nom: "Netflix", qui: "elle", rythme: "mois" });
    expect(await ajouterPoste({ nom: "Netflix ", sorte: "perso", qui: "elle", c: 2_000, des: M })).toBeNull();
    expect(await ajouterPoste({ nom: "Netflix", sorte: "perso", qui: "moi", c: 2_000, des: M })).not.toBeNull(); // la même chez l'autre : permis
    await arreterPoste(p, "2027-01");
    const la = (await db.budget_postes.get(p.id))!;
    expect([valeurDe(la, M), valeurDe(la, "2027-01")]).toEqual([2_000, null]);
  });
  it("le dernier solde noté est celui qu'on montre", async () => {
    await noterSolde("epargne", 300_000, new Date("2026-11-20T12:00:00"));
    await noterSolde("epargne", 335_000, new Date("2026-11-27T12:00:00"));
    const soldes = await db.budget_soldes.toArray();
    expect(dernierSolde(soldes, "epargne")!.c).toBe(335_000);
    expect(dernierSolde(soldes, "facture")).toBeNull();
  });
});

describe("à payer : ce que le module Maison passe au Budget", () => {
  const ligne = { id: "papier-1", titre: "Acompte d'impôts", emetteur: "Canton", c: 30_000, echeance: "2026-12-31", repete: "trimestre" as const, dossier: "impots" as const, papier: "p1" };
  it("garde la ligne, sans doublon, et dit si c'est payé", async () => {
    expect(await ajouterAPayer(ligne)).toMatchObject({ id: "papier-1", paye: false, c: 30_000 });
    expect(await estPaye("papier-1")).toBe(false);
    await marquerPaye("papier-1", "2026-12-02");
    expect(await estPaye("papier-1")).toBe("2026-12-02");
    // Maison renvoie la même ligne (montant corrigé) : une seule ligne, et le paiement n'est pas défait.
    expect(await ajouterAPayer({ ...ligne, c: 31_000 })).toMatchObject({ c: 31_000, paye: "2026-12-02" });
    expect(await db.budget_apayer.count()).toBe(1);
    expect(await estPaye("inconnu")).toBe(false);
    // Cochée par erreur sur l'écran : « Annuler » la remet à payer.
    await marquerPaye("papier-1", false);
    await payer((await db.budget_apayer.get("papier-1"))!, new Date("2026-12-03T12:00:00"));
    expect(await estPaye("papier-1")).toBe("2026-12-03");
    await annuler();
    expect(await estPaye("papier-1")).toBe(false);
  });
  it("refuse une ligne qui n'a pas la bonne forme", async () => {
    expect(await ajouterAPayer({ ...ligne, c: 12.5 })).toBeNull(); // des centimes entiers
    expect(await ajouterAPayer({ ...ligne, echeance: "31.12.2026" })).toBeNull();
    expect(await ajouterAPayer({ ...ligne, titre: " " })).toBeNull();
  });
  it("prend la ligne telle que Maison la donne (« montant »)", async () => {
    expect(await ajouterAPayer({ id: "papier:p1", titre: "Facture Swisscom", emetteur: "Swisscom", montant: 8_990, echeance: "2026-12-15", repete: "mois", dossier: "abonnements", papier: "p1", paye: false })).toMatchObject({ c: 8_990, paye: false });
  });
});

describe("lot 2 : les tickets de Cuisine, Entre nous, les échéances du jour", () => {
  const ticket = (x = {}) => ({ id: "t1", magasin: "Migros", date: "2026-11-26", total: 53.4, monnaie: "CHF", cree: 5, ...x });
  const dep = (x: Partial<Depense>): Depense => ({ id: "d1", jour: "2026-11-27", c: 3_200, quoi: "Pizza", cat: "plaisir", qui: "moi", cree: 1, ...x });
  it("un ticket en francs compte dans les Courses, payé par le compte commun", () => {
    expect(depenseDuTicket(ticket())).toEqual({ id: "ticket:t1", jour: "2026-11-26", c: 5_340, quoi: "Migros", cat: "courses", qui: "commun", cree: 5 });
    expect(depenseDuTicket(ticket({ monnaie: "EUR" }))).toBeNull();
    expect(depenseDuTicket(ticket({ total: 0 }))).toBeNull();
    expect(depenseDuTicket(ticket({ magasin: "" }))!.quoi).toBe("Ticket de caisse");
    expect(enveloppes(FOYER, avecTickets([], [ticket()]), M)[0]).toMatchObject({ cat: "courses", depense: 5_340, reste: 44_660 });
  });
  it("un ticket retouché n'est compté qu'une fois ; retiré de Cuisine, il ne compte plus", async () => {
    const [d] = avecTickets([], [ticket()]);
    await payeurDuTicket(d, "elle");
    let stockees = await db.budget_depenses.toArray();
    expect(avecTickets(stockees, [ticket()])).toEqual([{ ...d, qui: "elle" }]);
    expect(avecTickets(stockees, [])).toEqual([]);
    await annuler();
    stockees = await db.budget_depenses.toArray();
    expect(avecTickets(stockees, [ticket()])).toEqual([d]);
    await payeurDuTicket(dep({}), "elle"); // une dépense à la main n'est pas un ticket : rien
    expect(await db.budget_depenses.count()).toBe(0);
  });
  it("un ticket d'avant le budget, ou déjà noté à la main, n'est pas compté", () => {
    expect(debutBudget(FOYER)).toBe("2026-10-25"); // les valeurs d'essai valent à partir de novembre
    expect(debutBudget([])).toBeNull();
    expect(avecTickets([], [ticket({ date: "2026-10-24" }), ticket({ id: "t2" })], "2026-10-25").map((d) => d.id)).toEqual(["ticket:t2"]);
    const main = dep({ id: "m", jour: "2026-11-26", c: 5_340, cat: "courses", qui: "commun" });
    expect(avecTickets([main], [ticket()])).toEqual([main]); // la même course : une seule fois
    expect(avecTickets([{ ...main, cat: "plaisir" }], [ticket()])).toHaveLength(2);
  });
  it("toucher le payeur déjà choisi ne rouvre pas une dette rendue ; Annuler respecte un changement fait depuis", async () => {
    const [d] = avecTickets([], [ticket()]);
    await payeurDuTicket(d, "elle");
    const premier = toast.mock.calls.at(-1)![1] as { action: { onClick: () => Promise<unknown> } };
    await rembourser("elle", await db.budget_depenses.toArray(), new Date("2026-11-28T12:00:00"));
    const rendue = (await db.budget_depenses.get(d.id))!;
    await payeurDuTicket(rendue, "elle");
    expect((await db.budget_depenses.get(d.id))!.rembourse).toBe("2026-11-28");
    await premier.action.onClick(); // l'Annuler du premier geste arrive trop tard : la ligne a changé depuis
    expect((await db.budget_depenses.get(d.id))!.rembourse).toBe("2026-11-28");
  });
  it("Entre nous : ce que chacun a avancé, jusqu'à ce que ce soit rendu", async () => {
    await db.budget_depenses.bulkAdd([dep({}), dep({ id: "d2", c: 1_000, qui: "moi", jour: "2026-11-20" }), dep({ id: "d3", qui: "commun" }), dep({ id: "d4", qui: "elle", c: 500 })]);
    let toutes = await db.budget_depenses.toArray();
    expect(duA(toutes)).toEqual({ moi: 4_200, elle: 500 });
    expect(avances(toutes, "moi").map((d) => d.id)).toEqual(["d1", "d2"]); // la plus récente d'abord
    expect(await rembourser("moi", toutes, new Date("2026-11-28T12:00:00"))).toBe(2);
    toutes = await db.budget_depenses.toArray();
    expect(duA(toutes)).toEqual({ moi: 0, elle: 500 });
    expect(toutes.find((d) => d.id === "d1")!.rembourse).toBe("2026-11-28");
    expect(enveloppes(FOYER, toutes, M)[1].depense).toBe(3_200 + 3_200 + 500); // rendue ou non, la dépense reste dans son enveloppe (celle du 20 est du mois d'avant)
    await annuler();
    expect(duA(await db.budget_depenses.toArray())).toEqual({ moi: 4_200, elle: 500 });
    expect(await rembourser("moi", [])).toBe(0);
  });
  it("le remboursement ne voyage que pour une dépense payée par quelqu'un", () => {
    expect(nettoyerDepense(dep({ rembourse: "2026-11-28" }))).toMatchObject({ rembourse: "2026-11-28" });
    expect(nettoyerDepense(dep({ qui: "commun", rembourse: "2026-11-28" }))).not.toHaveProperty("rembourse");
    expect(nettoyerDepense({ ...dep({}), rembourse: "hier" })).not.toHaveProperty("rembourse");
  });
  it("les échéances d'un jour : factures du jour, retards seulement aujourd'hui, charges à l'année datées", () => {
    const f = (id: string, echeance: string, paye: false | string = false) => ({ id, titre: id, emetteur: "", c: 10_000, echeance, repete: "" as const, dossier: "autre" as const, paye, cree: 1 });
    const apayer = [f("hier", "2026-11-26"), f("jour", "2026-11-27"), f("payee", "2026-11-27", "2026-11-27"), f("demain", "2026-11-28")];
    const postes = [{ ...FOYER[9], echeance: "11-28" }, { ...FOYER[6], echeance: "11-28" }]; // le loyer est au mois : sa date ne compte pas
    expect(echeancesDu("2026-11-27", "2026-11-27", apayer, postes).map((e) => [e.cle, !!e.retard])).toEqual([["hier", true], ["jour", false]]);
    expect(echeancesDu("2026-11-28", "2026-11-27", apayer, postes)).toEqual([{ cle: "demain", titre: "demain", c: 10_000 }, { cle: "assurance-voiture", titre: "assurance-voiture", c: 120_000 }]);
    expect(echeancesDu("2026-11-29", "2026-11-27", apayer, postes)).toEqual([]);
    // Vue d'un jour passé : la facture restée impayée est bien dite en retard.
    expect(echeancesDu("2026-11-26", "2026-11-27", apayer, postes)).toEqual([{ cle: "hier", titre: "hier", c: 10_000, retard: true }]);
    // La même facture déjà suivie dans « À payer » (même jour, même montant) : pas dite deux fois, même payée.
    expect(echeancesDu("2026-11-28", "2026-11-27", [{ ...f("papier", "2026-11-28", "2026-11-28"), c: 120_000 }], postes)).toEqual([]);
    // Un 29 février tombe le 28 les années sans 29.
    const bissextile = [{ ...FOYER[9], echeance: "02-29" }];
    expect(echeancesDu("2027-02-28", "2026-11-27", [], bissextile)).toHaveLength(1);
    expect(echeancesDu("2028-02-28", "2026-11-27", [], bissextile)).toHaveLength(0);
    expect(echeancesDu("2028-02-29", "2026-11-27", [], bissextile)).toHaveLength(1);
    // Un poste arrêté au mois de budget suivant est encore annoncé le jour où sa facture tombe.
    expect(echeancesDu("2026-11-28", "2026-11-27", [], [{ ...FOYER[9], echeance: "11-28", fin: "2026-12" }])).toHaveLength(1);
  });
});

describe("écrire et lire un montant", () => {
  it("écrit les francs, et les centimes seulement s'il y en a", () => {
    expect(chf(200_000)).toBe("2 000");
    expect(chf(983)).toBe("9.83");
    expect(chf(66_460)).toBe("664.60");
    expect(chf(-7_000)).toBe("−70");
    expect(chf(0)).toBe("0");
  });
  it("lit ce qu'on tape", () => {
    expect(lireMontant("32")).toBe(3_200);
    expect(lireMontant("32,5")).toBe(3_250);
    expect(lireMontant("1'870")).toBe(187_000);
    expect(lireMontant("2 000.00 CHF")).toBe(200_000);
    expect(lireMontant("368.40")).toBe(36_840);
    expect(lireMontant("")).toBeNull();
    expect(lireMontant("douze")).toBeNull();
    expect(lireMontant("-5")).toBeNull();
    expect(lireMontant("1000000")).toBe(100_000_000);
    expect(lireMontant("1200000")).toBeNull(); // au-delà du plafond, comme pour ce qui arrive du foyer
  });
});

describe("ce qui arrive du foyer est nettoyé", () => {
  it("garde un poste correct et jette ses valeurs abîmées", () => {
    const p = nettoyerPoste({ ...FOYER[6], valeurs: [{ des: "2026-11", c: 200_000, quand: 1 }, { des: "novembre", c: 5 }, { des: "2026-12", c: -3 }, { des: "2026-12", c: 1.5 }], compte: "ailleurs", inconnu: 1 });
    expect(p).toEqual({ id: "loyer", nom: "loyer", sorte: "foyer", compte: "commun", rythme: "mois", valeurs: [{ des: "2026-11", c: 200_000, quand: 1 }], cree: 1 });
  });
  it("refuse ce qui n'a pas la bonne forme", () => {
    expect(nettoyerPoste({ ...FOYER[0], qui: undefined })).toBeNull(); // un salaire sans personne
    expect(nettoyerPoste({ ...FOYER[6], valeurs: [] })).toBeNull();
    expect(nettoyerPoste({ ...FOYER[6], sorte: "cadeau" })).toBeNull();
    expect(nettoyerDepense({ id: "d", jour: "2026-11-27", c: 0 })).toBeNull();
    expect(nettoyerDepense({ id: "d", jour: "hier", c: 100 })).toBeNull();
    expect(nettoyerDepense({ id: "d", jour: "2026-11-27", c: 100, qui: "voisin" })).toMatchObject({ qui: "commun", cat: "divers" });
    expect(nettoyerCategorie({ id: "autre-cle", nom: "Cadeaux" })).toBeNull(); // la clé doit être celle du nom
    expect(nettoyerCategorie({ id: "cadeaux", nom: "Cadeaux" })).toMatchObject({ id: "cadeaux" });
    expect(nettoyerSolde({ id: "s", compte: "poche", c: 1, jour: "2026-11-27" })).toBeNull();
    expect(nettoyerAPayer({ id: "a", titre: "Facture", c: 100, echeance: "2026-12-01", dossier: "mystere", paye: "oui" })).toMatchObject({ dossier: "autre", paye: false, repete: "" });
  });
  it("chaque table du Budget part au foyer", () => {
    for (const g of ["budget_poste", "budget_depense", "budget_categorie", "budget_solde", "budget_apayer"]) expect(GENRES[g]).toBeDefined();
    expect(GENRES.budget_poste.nettoyer(FOYER[0])).toEqual(FOYER[0]);
  });
});

describe("le module", () => {
  it("est construit, avec sa page et sa tuile", () => {
    expect(budget).toMatchObject({ id: "budget", etat: "construit" });
    expect(budget.Page).toBeDefined();
    expect(budget.Tuile).toBeDefined();
  });
});
