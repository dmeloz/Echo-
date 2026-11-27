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
import { ajouterCorvees, cocherCorvee, faireCorvee, rangerFaits, reporterCorvee, retirerCorvee } from "./actions";
import { aFaire, besoin, deborde, ditFait, equilibre, jourDu, lireCorvee, nettoyerCorvee, nettoyerFait, parts, pour, trouverCorvees, type Corvee } from "./donnees";
import { maison } from "./index";
import { OUTILS_MAISON } from "./outilsEcho";

const J = 86_400_000;
const midi = (jour: string) => new Date(jour + "T12:00:00");
const NOW = midi("2026-11-27");
const corvee = (x: Partial<Corvee> = {}): Corvee => ({ id: "c1", nom: "Passer l'aspirateur", piece: "Salon", tous: 7, taille: 2, qui: "tour", fait: null, cree: midi("2026-11-20").getTime(), ...x });
const ctx = { noms: { moi: "Dany", elle: "Sarah" }, proprio: "moi" as const, now: NOW };
const annuler = () => (toast.mock.calls.at(-1)![1] as { action: { onClick: () => Promise<unknown> } }).action.onClick();

beforeEach(async () => {
  await Promise.all([db.maison_corvees.clear(), db.maison_faits.clear(), db.reglages.clear()]);
  stock.clear(); toast.mockClear();
});

describe("quand une corvée revient", () => {
  it("compte depuis la dernière fois où elle a été faite", () => {
    const c = corvee({ fait: midi("2026-11-22").getTime() });
    expect(jourDu(c)).toBe("2026-11-29");
    expect(besoin(c, NOW)).toBe(2); // dans 2 jours : bientôt
    expect(besoin(c, midi("2026-11-23"))).toBe(1);
    expect(aFaire(c, midi("2026-11-29"))).toBe(true);
  });
  it("jamais faite : à mi-chemin de son rythme, pas tout le premier jour", () => {
    expect(jourDu(corvee({ cree: NOW.getTime() }))).toBe("2026-11-30");
    expect(aFaire(corvee({ tous: 1, cree: NOW.getTime() }), NOW)).toBe(true); // une corvée de chaque jour est pour aujourd'hui
  });
  it("« pas cette fois » la repousse, sans la marquer faite", () => {
    const c = corvee({ fait: midi("2026-11-18").getTime(), report: "2026-11-29" });
    expect(jourDu(c)).toBe("2026-11-29");
    expect(aFaire(c, NOW)).toBe(false);
  });
  it("ne passe au rouge que si elle attend depuis longtemps", () => {
    expect(deborde(corvee({ fait: midi("2026-11-19").getTime() }), NOW)).toBe(false); // due hier
    expect(deborde(corvee({ fait: midi("2026-11-10").getTime() }), NOW)).toBe(true);
  });
});

describe("qui, et l'équilibre", () => {
  it("chacun son tour : l'autre que la dernière fois", () => {
    const e = { moi: 0, elle: 0 };
    expect(pour(corvee({ par: "elle" }), e)).toBe("moi");
    expect(pour(corvee({ par: "moi" }), e)).toBe("elle");
    expect(pour(corvee({ qui: "elle", par: "elle" }), e)).toBe("elle");
  });
  it("Echo choisit : celui qui en a le moins fait", () => {
    expect(pour(corvee({ qui: "echo", par: "elle" }), { moi: 60, elle: 20 })).toBe("elle");
    expect(pour(corvee({ qui: "echo", par: "elle" }), { moi: 20, elle: 20 })).toBe("moi");
  });
  it("compte les minutes des 4 dernières semaines", () => {
    const f = (par: "moi" | "elle", jours: number, min: number) => ({ id: par + jours, corvee: "c", nom: "x", par, quand: NOW.getTime() - jours * J, min });
    const e = equilibre([f("moi", 1, 40), f("elle", 2, 15), f("elle", 3, 15), f("moi", 40, 40)], NOW.getTime());
    expect(e).toEqual({ moi: 40, elle: 30 });
    expect(parts(e)).toEqual({ moi: 57, elle: 43 });
    expect(parts({ moi: 0, elle: 0 })).toEqual({ moi: 50, elle: 50 });
  });
});

describe("lire ce qu'on écrit", () => {
  it("trouve le rythme dans la phrase", () => {
    expect(lireCorvee("litière du chat tous les 2 jours")).toEqual({ nom: "Litière du chat", tous: 2 });
    expect(lireCorvee("Vitres tous les trois mois")).toEqual({ nom: "Vitres", tous: 90 });
    expect(lireCorvee("draps toutes les 2 semaines")).toEqual({ nom: "Draps", tous: 14 });
    expect(lireCorvee("poubelles chaque jour")).toEqual({ nom: "Poubelles", tous: 1 });
    expect(lireCorvee("frigo une fois par mois")).toEqual({ nom: "Frigo", tous: 30 });
    expect(lireCorvee("Repassage")).toEqual({ nom: "Repassage", tous: 7 });
    expect(lireCorvee("  ")).toBeNull();
    expect(lireCorvee("chaque semaine")).toBeNull();
  });
  it("reconnaît les corvées dont parle une phrase", () => {
    const cs = [corvee(), corvee({ id: "c2", nom: "Sortir les poubelles" }), corvee({ id: "c3", nom: "Nettoyer la salle de bain" })];
    expect(trouverCorvees("j'ai passé l'aspi et sorti les poubelles", cs).map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(trouverCorvees("la salle de bain est faite", cs).map((c) => c.id)).toEqual(["c3"]);
    expect(trouverCorvees("j'ai pris un bain", cs)).toEqual([]);
  });
  it("ne prend pas une chose à faire pour une chose faite", () => {
    expect(ditFait("j'ai passé l'aspirateur")).toBe(true);
    expect(ditFait("les poubelles c'est fait")).toBe(true);
    expect(ditFait("passer l'aspirateur demain")).toBe(false);
    expect(ditFait("j'ai pas encore sorti les poubelles")).toBe(false);
    expect(ditFait("il faut passer l'aspirateur")).toBe(false);
  });
});

describe("les gestes", () => {
  it("ajoute sans doubler, et Annuler retire", async () => {
    await ajouterCorvees([{ nom: "Vaisselle", tous: 1 }, { nom: "vaisselle", tous: 2 }]);
    expect(await db.maison_corvees.count()).toBe(1);
    await ajouterCorvees([{ nom: "Vaisselle", tous: 1 }]);
    expect(toast).toHaveBeenLastCalledWith("C'est déjà dans la liste");
    await ajouterCorvees([{ nom: "Draps", tous: 14 }]);
    await annuler();
    expect((await db.maison_corvees.toArray()).map((c) => c.nom)).toEqual(["Vaisselle"]);
  });
  it("c'est fait : la corvée repart, la ligne compte pour l'équilibre, Annuler remet tout", async () => {
    const c = corvee({ fait: midi("2026-11-19").getTime(), par: "elle", report: "2026-11-26" });
    await db.maison_corvees.add(c);
    await cocherCorvee(c, "moi");
    const apres = (await db.maison_corvees.get("c1"))!;
    expect(apres.par).toBe("moi");
    expect(apres.report).toBeUndefined();
    expect(aFaire(apres, new Date())).toBe(false);
    expect(await db.maison_faits.toArray()).toMatchObject([{ corvee: "c1", par: "moi", min: 15 }]);
    await annuler();
    expect(await db.maison_corvees.get("c1")).toEqual(c);
    expect(await db.maison_faits.count()).toBe(0);
  });
  it("Annuler ne défait pas ce que l'autre a coché entre-temps", async () => {
    await db.maison_corvees.add(corvee());
    const defaire = (await faireCorvee("c1", "moi", 1000))!;
    await faireCorvee("c1", "elle", 2000);
    await defaire();
    expect((await db.maison_corvees.get("c1"))!.fait).toBe(2000);
    expect((await db.maison_faits.toArray()).map((f) => f.par)).toEqual(["elle"]);
  });
  it("pas cette fois, retirer, et le ménage des vieilles lignes", async () => {
    const c = corvee({ fait: midi("2026-11-19").getTime() });
    await db.maison_corvees.add(c);
    await reporterCorvee(c, NOW);
    expect((await db.maison_corvees.get("c1"))!.report).toBe("2026-11-29");
    expect(await db.maison_faits.count()).toBe(0);
    await retirerCorvee(c);
    expect(await db.maison_corvees.count()).toBe(0);
    await annuler();
    expect(await db.maison_corvees.count()).toBe(1);
    await db.maison_faits.bulkAdd([{ id: "v", corvee: "c1", nom: "x", par: "moi", quand: NOW.getTime() - 70 * J, min: 5 }, { id: "n", corvee: "c1", nom: "x", par: "moi", quand: NOW.getTime() - J, min: 5 }]);
    await rangerFaits(NOW.getTime());
    expect((await db.maison_faits.toArray()).map((f) => f.id)).toEqual(["n"]);
  });
});

describe("la barre d'Echo et les outils", () => {
  it("« j'ai passé l'aspi » coche la corvée, pas une tâche", async () => {
    await db.reglages.put({ cle: "proprio", valeur: "elle" });
    await db.maison_corvees.add(corvee());
    await vi.waitFor(() => expect(maison.comprendre!("j'ai passé l'aspi")).not.toBeNull());
    const p = maison.comprendre!("j'ai passé l'aspi")!;
    expect(p).toMatchObject({ titre: "Passer l'aspirateur : fait", ou: "Maison" });
    await p.faire();
    expect((await db.maison_corvees.get("c1"))!.par).toBe("elle");
    expect(maison.comprendre!("acheter un aspirateur demain")).toBeNull();
    expect(maison.comprendre!("corvée : litière tous les 2 jours")).toMatchObject({ titre: "Litière", ou: "Maison" });
  });
  it("voir_maison dit pour qui et l'état", async () => {
    await db.maison_corvees.bulkAdd([corvee({ fait: midi("2026-11-19").getTime(), par: "elle" }), corvee({ id: "c2", nom: "Draps", tous: 14, fait: NOW.getTime() - J, par: "moi", qui: "elle" })]);
    const r = (await OUTILS_MAISON.voir_maison.lire!({}, ctx)) as { corvees: Array<Record<string, string>> };
    expect(r.corvees).toMatchObject([
      { nom: "Passer l'aspirateur", etat: "à faire aujourd'hui", pour: "Dany", revient: "chaque semaine", derniereFois: "il y a 8 jours par Sarah" },
      { nom: "Draps", etat: "peut attendre", pour: "Sarah" },
    ]);
  });
  it("corvee_faite : petite chose pour soi, demandée pour l'autre, et se défait", async () => {
    await db.maison_corvees.bulkAdd([corvee(), corvee({ id: "c2", nom: "Sortir les poubelles" })]);
    const a = await OUTILS_MAISON.corvee_faite.preparer!({ corvees: ["aspirateur", "poubelles"], par: "moi" }, ctx);
    if (typeof a === "string") throw new Error(a);
    expect(a).toMatchObject({ genre: "petit", libelle: "Fait : Passer l'aspirateur, Sortir les poubelles", details: ["par Dany"] });
    const defaire = await a.faire();
    expect(await db.maison_faits.count()).toBe(2);
    await defaire();
    expect(await db.maison_faits.count()).toBe(0);
    expect((await db.maison_corvees.get("c1"))!.fait).toBeNull();
    expect(await OUTILS_MAISON.corvee_faite.preparer!({ corvees: ["aspirateur"], par: "elle" }, ctx)).toMatchObject({ genre: "gros", details: ["par Sarah"] });
    expect(await OUTILS_MAISON.corvee_faite.preparer!({ corvees: ["repassage"], par: "moi" }, ctx)).toContain("Pas de corvée");
  });
  it("ajouter_corvee refuse un doublon et un rythme faux", async () => {
    await db.maison_corvees.add(corvee());
    expect(await OUTILS_MAISON.ajouter_corvee.preparer!({ nom: "passer l'aspirateur", tousLesJours: 7, taille: "moyen", qui: "tour", piece: "" }, ctx)).toContain("déjà");
    expect(await OUTILS_MAISON.ajouter_corvee.preparer!({ nom: "Litière", tousLesJours: 0, taille: "vite", qui: "tour", piece: "" }, ctx)).toContain("entre 1 et 365");
    const a = await OUTILS_MAISON.ajouter_corvee.preparer!({ nom: "litière du chat", tousLesJours: 2, taille: "vite", qui: "elle", piece: "" }, ctx);
    if (typeof a === "string") throw new Error(a);
    const defaire = await a.faire();
    expect((await db.maison_corvees.toArray()).find((c) => c.nom === "Litière du chat")).toMatchObject({ tous: 2, taille: 1, qui: "elle" });
    await defaire();
    expect(await db.maison_corvees.count()).toBe(1);
  });
});

describe("le foyer", () => {
  it("ne garde que les formes attendues", () => {
    expect(nettoyerCorvee({ id: "a", nom: " Vitres ", tous: 90, taille: 9, qui: "x", fait: 0, report: "demain", cree: 5 })).toEqual({ id: "a", nom: "Vitres", piece: "", tous: 90, taille: 2, qui: "tour", fait: null, cree: 5 });
    expect(nettoyerCorvee({ id: "a", nom: "Vitres", tous: 0 })).toBeNull();
    expect(nettoyerCorvee({ id: "a", nom: "", tous: 7 })).toBeNull();
    expect(nettoyerFait({ id: "f", corvee: "a", nom: "Vitres", par: "elle", quand: 10, min: 40 })).toEqual({ id: "f", corvee: "a", nom: "Vitres", par: "elle", quand: 10, min: 40 });
    expect(nettoyerFait({ id: "f", par: "lui", quand: 10, min: 40 })).toBeNull();
    expect(nettoyerFait({ id: "f", par: "moi", quand: 10, min: 9999 })).toBeNull();
  });
  it("une corvée cochée ici part au foyer, et celle de l'autre arrive", async () => {
    await db.maison_corvees.add(corvee());
    await faireCorvee("c1", "moi");
    expect(Object.keys(lireFile())).toEqual(expect.arrayContaining(["corvee:c1", expect.stringMatching(/^corvee_faite:/)]));
    const ligne = (genre: string, cle: string, data: unknown) => ({ genre, cle, data, supprime: false, par: "autre", maj: new Date().toISOString() });
    await appliquer([ligne("corvee", "c9", corvee({ id: "c9", nom: "Draps" })), ligne("corvee_faite", "f9", { id: "f9", corvee: "c9", nom: "Draps", par: "elle", quand: 5, min: 15 })], false, "moi");
    expect((await db.maison_corvees.get("c9"))!.nom).toBe("Draps");
    expect((await db.maison_faits.get("f9"))!.par).toBe("elle");
  });
});
