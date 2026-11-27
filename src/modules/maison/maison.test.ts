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
import { ajouterAppareil, ajouterContact, ajouterCorvees, ajouterPapier, ajouterPhotosPapier, retirerPhotoPapier, ajouterReparation, papierFait, retirerPapier, cocherCorvee, etatReparation, faireCorvee, rangerFaits, rangerReparations, reporterCorvee, retirerCorvee } from "./actions";
import { aPayer, apresFait, bientot, devinerDossier, lireMontant, lirePapier, nettoyerPapier, quandPapier, texteMontant, type Papier, aFaire, besoin, deborde, ditFait, equilibre, gestesPour, jourDu, lireContact, lireCorvee, nettoyerAppareil, nettoyerContact, nettoyerCorvee, nettoyerFait, nettoyerReparation, nomRythme, parts, pour, pourMoi, texteGarantie, trouverCorvees, type Corvee } from "./donnees";
import { maison } from "./index";
import { OUTILS_MAISON } from "./outilsEcho";

const J = 86_400_000;
const midi = (jour: string) => new Date(jour + "T12:00:00");
const NOW = midi("2026-11-27");
const corvee = (x: Partial<Corvee> = {}): Corvee => ({ id: "c1", nom: "Passer l'aspirateur", piece: "Salon", tous: 7, taille: 2, qui: "libre", fait: null, cree: midi("2026-11-20").getTime(), ...x });
const ctx = { noms: { moi: "Dany", elle: "Sarah" }, proprio: "moi" as const, now: NOW };
const annuler = () => (toast.mock.calls.at(-1)![1] as { action: { onClick: () => Promise<unknown> } }).action.onClick();

beforeEach(async () => {
  await Promise.all([db.maison_corvees.clear(), db.maison_faits.clear(), db.maison_reparations.clear(), db.maison_appareils.clear(), db.maison_contacts.clear(), db.maison_papiers.clear(), db.photos.clear(), db.reglages.clear()]);
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
  it("libre par défaut, ou donnée à une personne", () => {
    expect(pour(corvee({ par: "elle" }))).toBeNull();
    expect(pour(corvee({ qui: "elle" }))).toBe("elle");
    expect(pour(corvee({ qui: "tour" as never }))).toBeNull(); // les anciennes « chacun son tour » deviennent libres
    expect(pourMoi(corvee(), "moi")).toBe(true);
    expect(pourMoi(corvee({ qui: "moi" }), "moi")).toBe(true);
    expect(pourMoi(corvee({ qui: "elle" }), "moi")).toBe(false);
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
    expect(ditFait("j'aimerais que tu passes l'aspirateur")).toBe(false);
    expect(ditFait("on attend pour la lessive")).toBe(false);
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
      { nom: "Passer l'aspirateur", etat: "à faire aujourd'hui", pour: "libre (celui qui la fait)", revient: "chaque semaine", derniereFois: "il y a 8 jours par Sarah" },
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
    expect(await OUTILS_MAISON.ajouter_corvee.preparer!({ nom: "passer l'aspirateur", tousLesJours: 7, taille: "moyen", qui: "libre", piece: "" }, ctx)).toContain("déjà");
    expect(await OUTILS_MAISON.ajouter_corvee.preparer!({ nom: "Litière", tousLesJours: 0, taille: "vite", qui: "libre", piece: "" }, ctx)).toContain("entre 1 et 365");
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
    expect(nettoyerCorvee({ id: "a", nom: " Vitres ", tous: 90, taille: 9, qui: "x", fait: 0, report: "demain", cree: 5 })).toEqual({ id: "a", nom: "Vitres", piece: "", tous: 90, taille: 2, qui: "libre", fait: null, cree: 5 });
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

describe("l'entretien", () => {
  it("la garantie se lit en clair", () => {
    const a = { id: "a", nom: "Lave-linge", piece: "", achat: "2025-03-12", garantie: 24, cree: 0 };
    expect(texteGarantie(a, NOW)).toBe("Sous garantie jusqu'au 12 mars 2027");
    expect(texteGarantie({ ...a, garantie: 12 }, NOW)).toBe("Garantie finie le 12 mars 2026");
    expect(texteGarantie({ ...a, achat: undefined }, NOW)).toBe("");
    expect(texteGarantie({ ...a, garantie: 0 }, NOW)).toBe("");
  });
  it("propose les gestes habituels d'un appareil", () => {
    expect(gestesPour("Lave-linge Bosch").map((g) => g.nom)).toEqual(["Lavage à vide à 90°", "Nettoyer le filtre du lave-linge"]);
    expect(gestesPour("Machine à café")[0]).toMatchObject({ nom: "Détartrer la machine à café", tous: 60 });
    expect(gestesPour("Fourgon")).toEqual([]);
    expect(gestesPour("Télé")).toEqual([]);
    expect(nomRythme(60)).toBe("Tous les 2 mois");
    expect(lireCorvee("détartrer la bouilloire", 90)).toEqual({ nom: "Détartrer la bouilloire", tous: 90 });
    expect(lireCorvee("détartrer la bouilloire tous les 2 mois", 90)!.tous).toBe(60);
  });
  it("lit un contact écrit en une ligne", () => {
    expect(lireContact("plombier Martin 079 123 45 67")).toEqual({ nom: "Plombier Martin", role: "Plombier", tel: "079 123 45 67" });
    expect(lireContact("Régie du Lac : +41 21 555 00 11")).toEqual({ nom: "Régie du Lac", role: "Régie", tel: "+41 21 555 00 11" });
    expect(lireContact("Jean Dupont")).toEqual({ nom: "Jean Dupont", role: "", tel: "" });
    expect(lireContact("  ")).toBeNull();
  });
  it("une réparation se note, avance, puis quitte la liste avec Annuler", async () => {
    const r = (await ajouterReparation("le robinet goutte"))!;
    expect(r).toMatchObject({ nom: "Le robinet goutte", etat: 1 });
    expect(await ajouterReparation("Le robinet goutte")).toBeNull();
    await db.maison_reparations.update(r.id, { note: "régie prévenue" });
    await etatReparation(r, 3); // la ligne à l'écran n'a pas encore la note : elle ne doit pas se perdre
    expect((await db.maison_reparations.get(r.id))!).toMatchObject({ etat: 3, fini: expect.any(Number), note: "régie prévenue" });
    expect(await ajouterReparation("le robinet goutte", {}, true)).not.toBeNull(); // réparée : la même panne peut revenir
    await annuler();
    expect((await db.maison_reparations.get(r.id))!).toMatchObject({ etat: 1, note: "régie prévenue" });
    expect(maison.comprendre!("Réparer le vélo samedi")).toBeNull(); // sans « à réparer », c'est une tâche
  });
  it("les réparations finies depuis plus d'un an sont rangées", async () => {
    await db.maison_reparations.bulkAdd([
      { id: "v", nom: "Vieille", etat: 3, note: "", cree: 0, fini: NOW.getTime() - 400 * J },
      { id: "r", nom: "Récente", etat: 3, note: "", cree: 0, fini: NOW.getTime() - 30 * J },
      { id: "o", nom: "Ouverte", etat: 1, note: "", cree: 0 },
    ]);
    await rangerReparations(NOW.getTime());
    expect((await db.maison_reparations.toArray()).map((r) => r.id).sort()).toEqual(["o", "r"]);
  });
  it("un appareil ou un contact n'est pas doublé", async () => {
    expect(await ajouterAppareil("lave-linge")).toMatchObject({ nom: "Lave-linge", garantie: 0 });
    expect(await ajouterAppareil("Lave-Linge")).toBeNull();
    expect(await ajouterContact({ nom: "Plombier Martin", role: "Plombier", tel: "0791234567" })).not.toBeNull();
    expect(await ajouterContact({ nom: "plombier martin", role: "", tel: "" })).toBeNull();
  });
  it("un geste d'entretien est une corvée rangée à part", async () => {
    const [c] = await ajouterCorvees([{ nom: "Détartrer la machine à café", tous: 60, entretien: true, appareil: "a1" }], true);
    expect(c).toMatchObject({ entretien: true, appareil: "a1", tous: 60 });
    expect(nettoyerCorvee(c)).toEqual(c);
  });
  it("Echo note une réparation et la voit", async () => {
    expect(maison.comprendre!("à réparer : la poignée de la porte")).toMatchObject({ titre: "la poignée de la porte", ou: "Maison, à réparer" });
    const a = await OUTILS_MAISON.noter_reparation.preparer!({ nom: "Robinet qui goutte", note: "régie prévenue" }, ctx);
    if (typeof a === "string") throw new Error(a);
    expect(a).toMatchObject({ genre: "petit", libelle: "À réparer : Robinet qui goutte", details: ["régie prévenue"] });
    const defaire = await a.faire();
    expect(await OUTILS_MAISON.voir_maison.lire!({}, ctx)).toMatchObject({ aReparer: [{ nom: "Robinet qui goutte", etat: "à faire", note: "régie prévenue" }] });
    expect(await OUTILS_MAISON.noter_reparation.preparer!({ nom: "robinet qui goutte", note: "" }, ctx)).toMatch(/déjà noté/);
    await (defaire as () => Promise<void>)();
    expect(await db.maison_reparations.count()).toBe(0);
  });
  it("ne garde que les formes attendues, et tout part au foyer", async () => {
    expect(nettoyerReparation({ id: "r", nom: "Robinet", etat: 7, note: 3, fini: 9, cree: 1 })).toEqual({ id: "r", nom: "Robinet", etat: 1, note: "", cree: 1 });
    expect(nettoyerReparation({ id: "r", nom: "Robinet", etat: 3, note: "ok", fini: 9, cree: 1 })).toEqual({ id: "r", nom: "Robinet", etat: 3, note: "ok", cree: 1, fini: 9 });
    expect(nettoyerAppareil({ id: "a", nom: "Four", achat: "hier", garantie: 2.5, cree: 1 })).toEqual({ id: "a", nom: "Four", piece: "", garantie: 0, cree: 1 });
    expect(nettoyerContact({ id: "c", nom: "Régie", tel: "<021> 555", cree: 1 })).toEqual({ id: "c", nom: "Régie", role: "", tel: "021 555", cree: 1 });
    expect(nettoyerContact({ id: "c" })).toBeNull();
    await ajouterReparation("Ampoule du couloir", {}, true);
    await ajouterAppareil("Four");
    await ajouterContact({ nom: "Régie", role: "Régie", tel: "" });
    expect(Object.keys(lireFile())).toEqual(expect.arrayContaining([expect.stringMatching(/^reparation:/), expect.stringMatching(/^appareil:/), expect.stringMatching(/^contact:/)]));
  });
});

describe("les papiers", () => {
  const papier = (x: Partial<Papier> = {}): Papier => ({ id: "p1", titre: "Facture Swisscom", dossier: "abonnements", emetteur: "", note: "", quoi: "payer", echeance: "2026-12-15", montant: 8990, repete: "", photos: [], cree: 1, ...x });
  it("lit un montant en francs", () => {
    expect(lireMontant("89.90")).toBe(8990);
    expect(lireMontant("89,9 CHF")).toBe(8990);
    expect(lireMontant("1'250.-")).toBe(125000);
    expect(lireMontant("rien")).toBeUndefined();
    expect(texteMontant(125005)).toMatch(/^1.250\.05 CHF$/);
  });
  it("lit une ligne écrite : titre, dossier, montant, échéance", () => {
    expect(lirePapier("facture Swisscom 89.90 le 15.12", NOW)).toEqual({ titre: "Facture Swisscom", dossier: "abonnements", quoi: "payer", echeance: "2026-12-15", montant: 8990 });
    // Une date déjà passée cette année : c'est l'an prochain.
    expect(lirePapier("Acompte impôts 450.- le 10.01", NOW)).toMatchObject({ dossier: "impots", quoi: "payer", echeance: "2027-01-10", montant: 45000 });
    expect(lirePapier("Passeport de Sarah expire le 3 mars 2028", NOW)).toMatchObject({ dossier: "identite", quoi: "renouveler", echeance: "2028-03-03" });
    expect(lirePapier("Bail de l'appartement", NOW)).toEqual({ titre: "Bail de l'appartement", dossier: "logement", quoi: "" });
    expect(lirePapier("   ", NOW)).toBeNull();
    // Le petit mot « le » ou « au » n'est jamais la fin d'un autre mot.
    expect(lirePapier("Assurance Mobile le 15.12", NOW)).toMatchObject({ titre: "Assurance Mobile", echeance: "2026-12-15" });
    expect(lirePapier("Facture eau 45.- 15.12", NOW)).toMatchObject({ titre: "Facture eau", echeance: "2026-12-15", montant: 4500 });
    expect(lirePapier("Loyer bureau 3 mars", NOW)).toMatchObject({ titre: "Loyer bureau", echeance: "2027-03-03" });
    // Un prix qui ressemble à un jour reste un prix ; une année ou « A4 » n'est pas un montant.
    expect(lirePapier("facture Swisscom 29.05 le 15.12", NOW)).toEqual({ titre: "Facture Swisscom", dossier: "abonnements", quoi: "payer", echeance: "2026-12-15", montant: 2905 });
    expect(lirePapier("Parking 12.05", NOW)).toEqual({ titre: "Parking", dossier: "autre", quoi: "payer", montant: 1205 });
    expect(lirePapier("Déclaration d'impôts 2026", NOW)).toEqual({ titre: "Déclaration d'impôts 2026", dossier: "impots", quoi: "" });
    expect(lirePapier("Facture A4 89.90 le 15.12", NOW)).toMatchObject({ titre: "Facture A4", montant: 8990, echeance: "2026-12-15" });
    expect(lirePapier("Garage 450", NOW)).toMatchObject({ titre: "Garage", montant: 45000 });
    expect(lirePapier("Vignette 15.12.2026", NOW)).toMatchObject({ titre: "Vignette", echeance: "2026-12-15" });
    expect(devinerDossier("Prime caisse maladie")).toBe("sante");
    expect(devinerDossier("Carnet du chat")).toBe("autre");
  });
  it("dit ce qui arrive bientôt", () => {
    expect(bientot(papier(), NOW)).toBe(true);
    expect(quandPapier(papier(), NOW)).toBe("dans 18 jours");
    expect(quandPapier(papier({ echeance: "2026-11-25" }), NOW)).toBe("c'était il y a 2 jours");
    expect(bientot(papier({ echeance: "2027-03-01" }), NOW)).toBe(false);
    expect(bientot(papier({ fait: "2026-11-20" }), NOW)).toBe(false);
    expect(bientot(papier({ quoi: "" }), NOW)).toBe(false);
  });
  it("une fois fait : fini, ou reparti à la prochaine échéance", () => {
    expect(apresFait(papier(), NOW)).toMatchObject({ fait: "2026-11-27", echeance: "2026-12-15" });
    expect(apresFait(papier({ repete: "mois" }), NOW)).toMatchObject({ echeance: "2027-01-15", fait: undefined });
    expect(apresFait(papier({ repete: "an", echeance: "2024-12-31" }), NOW).echeance).toBe("2026-12-31");
    // Fin de mois : le 31 janvier + 1 mois ne saute pas en mars.
    const fev = apresFait(papier({ repete: "mois", echeance: "2027-01-31" }), NOW);
    expect(fev).toMatchObject({ echeance: "2027-02-28", jour: 31 });
    // … et revient au 31 dès que le mois le permet.
    expect(apresFait(fev, midi("2027-02-20")).echeance).toBe("2027-03-31");
    expect(apresFait(apresFait(fev, midi("2027-02-20")), midi("2027-03-20")).echeance).toBe("2027-04-30");
  });
  it("se range, se coche et se retire, avec Annuler", async () => {
    const p = (await ajouterPapier({ titre: "loyer", quoi: "payer", echeance: "2026-12-01", montant: 185000, repete: "mois" }))!;
    expect(p).toMatchObject({ titre: "Loyer", dossier: "logement", photos: [] });
    expect(await ajouterPapier({ titre: "LOYER" })).toBeNull();
    await papierFait(p, NOW);
    expect(await db.maison_papiers.get(p.id)).toMatchObject({ echeance: "2027-01-01" });
    await annuler();
    expect(await db.maison_papiers.get(p.id)).toMatchObject({ echeance: "2026-12-01" });
    const oublier = vi.fn(async () => {});
    await retirerPapier(p, oublier);
    expect(await db.maison_papiers.count()).toBe(0);
    await annuler();
    expect(await db.maison_papiers.count()).toBe(1);
    expect(oublier).not.toHaveBeenCalled();
  });
  it("les photos : la liste ne perd rien, et le ménage retire celles que plus aucun papier ne porte", async () => {
    const { envoyerEnAttente } = await import("./photosPapiers");
    const p = (await ajouterPapier({ titre: "Bail" }, true))!;
    await Promise.all([ajouterPhotosPapier(p.id, ["aaaa1111.jpg"]), ajouterPhotosPapier(p.id, ["bbbb2222.jpg"])]);
    expect((await db.maison_papiers.get(p.id))!.photos.sort()).toEqual(["aaaa1111.jpg", "bbbb2222.jpg"]);
    await retirerPhotoPapier(p.id, "aaaa1111.jpg");
    expect((await db.maison_papiers.get(p.id))!.photos).toEqual(["bbbb2222.jpg"]);
    const blob = new Blob(["x"]), t = NOW.getTime();
    await db.photos.bulkPut([
      { id: "aaaa1111.jpg", tacheId: `papier:${p.id}`, blob, cree: t - 2 * J }, { id: "bbbb2222.jpg", tacheId: `papier:${p.id}`, blob, cree: t - 2 * J },
      { id: "cccc3333.jpg", tacheId: `papier:${p.id}`, blob, cree: t - 1000 }, { id: "photo-tache", tacheId: "t1", blob, cree: t - 9 * J },
    ]);
    await envoyerEnAttente(t);
    expect((await db.photos.toArray()).map((x) => x.id).sort()).toEqual(["bbbb2222.jpg", "cccc3333.jpg", "photo-tache"]);
  });
  it("donne au Budget la ligne à payer convenue", () => {
    expect(aPayer(papier({ emetteur: "Swisscom", repete: "mois" }))).toEqual({ id: "papier:p1", titre: "Facture Swisscom", emetteur: "Swisscom", montant: 8990, echeance: "2026-12-15", repete: "mois", dossier: "abonnements", papier: "p1", paye: false });
    expect(aPayer(papier({ fait: "2026-11-27" }))).toMatchObject({ paye: "2026-11-27" });
    expect(aPayer(papier({ quoi: "renouveler" }))).toBeNull();
    expect(aPayer(papier({ montant: undefined }))).toBeNull();
  });
  it("Echo range un papier et le voit ; une phrase suffit aussi", async () => {
    expect(maison.comprendre!("facture : Swisscom 89.90 le 15.12")).toMatchObject({ titre: "Facture Swisscom", ou: "Papiers, Abonnements" });
    expect(await OUTILS_MAISON.ranger_papier.preparer!({ titre: "Prime ménage", aFaire: "payer", pourLe: "", montantFrancs: 300 }, ctx)).toMatch(/date/);
    expect(await OUTILS_MAISON.ranger_papier.preparer!({ titre: "Prime ménage", aFaire: "payer", pourLe: "2026-02-31", montantFrancs: 300 }, ctx)).toMatch(/date/);
    const a = await OUTILS_MAISON.ranger_papier.preparer!({ titre: "Prime assurance ménage", dossier: "assurances", aFaire: "payer", pourLe: "2026-12-31", montantFrancs: 312.5, revient: "an", deQui: "La Mobilière", note: "" }, ctx);
    if (typeof a === "string") throw new Error(a);
    expect(a).toMatchObject({ genre: "petit", libelle: "Papier : Prime assurance ménage" });
    const defaire = await a.faire();
    expect(await OUTILS_MAISON.voir_papiers.lire!({}, ctx)).toMatchObject({ papiers: [{ titre: "Prime assurance ménage", dossier: "Assurances", deQui: "La Mobilière", aFaire: "à payer", pourLe: "2026-12-31", revient: "chaque année" }] });
    expect(await OUTILS_MAISON.ranger_papier.preparer!({ titre: "prime assurance ménage", aFaire: "", pourLe: "" }, ctx)).toMatch(/déjà rangé/);
    await (defaire as () => Promise<void>)();
    expect(await db.maison_papiers.count()).toBe(0);
  });
  it("ne garde que les formes attendues, et part au foyer", async () => {
    expect(nettoyerPapier({ id: "p", titre: "Bail", dossier: "cave", quoi: "voler", repete: "jour", montant: -4, echeance: "demain", photos: ["../x.jpg", "abcd1234.jpg", 3], cree: 1 })).toEqual({ id: "p", titre: "Bail", dossier: "autre", emetteur: "", note: "", quoi: "", repete: "", photos: ["abcd1234.jpg"], cree: 1 });
    expect(nettoyerPapier({ id: "p" })).toBeNull();
    expect(nettoyerPapier({ id: "p", titre: "Loyer", echeance: "2026-02-31", repete: "mois", jour: 31, cree: 1 })).toEqual({ id: "p", titre: "Loyer", dossier: "autre", emetteur: "", note: "", quoi: "", repete: "mois", jour: 31, photos: [], cree: 1 });
    await ajouterPapier({ titre: "Bail" }, true);
    expect(Object.keys(lireFile())).toEqual(expect.arrayContaining([expect.stringMatching(/^papier:/)]));
  });
});
