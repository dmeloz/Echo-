import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fauxServeur } from "./faux-serveur";

// La synchro à deux, contre un faux serveur : un test par défaut trouvé à la relecture.
const toast = vi.fn();
vi.mock("sonner", () => ({ toast: (...a: unknown[]) => toast(...a) }));
const reseau = { onLine: true };
vi.stubGlobal("navigator", reseau);
const stock = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => stock.get(k) ?? null, setItem: (k: string, v: string) => stock.set(k, v), removeItem: (k: string) => stock.delete(k) });
const { etat, supa } = fauxServeur();
vi.mock("./client", () => ({ get supa() { return supa; } }));
vi.mock("../lib/echo/discussions", () => ({ annoncer: () => undefined, motDeLAutre: () => "" }));

import { db } from "../data/db";
import { auJour } from "../lib/dates";
import type { Tache } from "../lib/types";
import { lireBases, lireFile } from "./file";
import { appliquer, demarrer, rejoindreFoyer, synchroFinie } from "./moteur";

const tache = (id: string, x: Partial<Tache> = {}): Tache => ({ id, titre: "Pain", qui: "moi", jour: auJour(), heure: "", niveau: null, repete: "", note: "", fait: null, faitLe: null, suite: null, cree: 1, ...x });
// Attendre la fin de la synchro en cours.
const calme = async () => { await new Promise((r) => setTimeout(r, 20)); await synchroFinie(); };
// Dans l'app, chaque changement relance un envoi tout seul (suivre) ; ici on le lance à la main.
const synchro = async () => { await demarrer(); await calme(); };
// Ce téléphone est déjà dans le foyer F, à la place « moi ».
async function dansLeFoyer() {
  await db.reglages.bulkPut([{ cle: "foyer", valeur: { id: "F", userId: "moi-1" } }, { cle: "proprio", valeur: "moi" }, { cle: "membres", valeur: [{ userId: "autre-1", prenom: "Sarah", place: "elle" }] }]);
  await demarrer();
  await synchroFinie();
}

beforeEach(async () => {
  await calme();
  await Promise.all(db.tables.map((t) => t.clear()));
  stock.clear(); toast.mockClear();
  etat.elements.length = 0; etat.membres.length = 0; etat.appels.length = 0;
  etat.panne = false; etat.refuser = () => false; etat.user = "moi-1"; etat.rpc = {};
  etat.membres.push({ foyer_id: "F", user_id: "autre-1", prenom: "Sarah", place: "elle" });
});

describe("rejoindre à nouveau le foyer", () => {
  it("1. un téléphone qui revient ne renvoie pas ses vieilles copies, et une tâche supprimée ne revient pas", async () => {
    // Ce téléphone était dans le foyer, il a été déconnecté : il a un nouveau compte et de vieilles copies.
    await db.reglages.bulkPut([{ cle: "foyer", valeur: { id: "F", userId: "ancien" } }, { cle: "proprio", valeur: "moi" }]);
    await db.taches.bulkPut([tache("a", { titre: "Vieux titre" }), tache("b"), tache("c", { titre: "Jamais partie" }), tache("d", { titre: "Changée hors ligne" })]);
    await db.horaires.put({ qui: "moi", jour: "2026-12-01", code: "C1" });
    stock.clear(); // ces copies ne sont pas des changements en attente…
    await db.taches.update("d", { titre: "Changée ici" }); // …sauf celle-ci, vraiment changée sur ce téléphone
    etat.poser("tache", "a", tache("a", { titre: "Titre de Sarah" }));
    etat.poser("tache", "b", null, "autre-1", true); // supprimée par Sarah entre-temps
    etat.poser("tache", "d", tache("d", { titre: "Changée hors ligne" }));
    etat.poser("horaire", "moi|2026-12-01", { qui: "moi", jour: "2026-12-01", code: "C6" });
    etat.user = "moi-2";
    etat.rpc.rejoindre_foyer = () => [{ foyer: "F", place: "moi" }];

    await rejoindreFoyer("123456", "Dany");
    await calme();

    expect((etat.lire("tache", "a")?.data as Tache).titre).toBe("Titre de Sarah");
    expect(etat.lire("tache", "b")?.supprime).toBe(true);
    expect((etat.lire("tache", "c")?.data as Tache).titre).toBe("Jamais partie"); // ce que le foyer n'avait pas part
    expect((etat.lire("tache", "d")?.data as Tache).titre).toBe("Changée ici"); // un vrai changement en attente part aussi
    expect((etat.lire("horaire", "moi|2026-12-01")?.data as { code: string }).code).toBe("C6");
    expect((await db.taches.get("a"))?.titre).toBe("Titre de Sarah");
    expect(await db.taches.get("b")).toBeUndefined();
    expect((await db.horaires.get(["moi", "2026-12-01"]))?.code).toBe("C6");
    expect(lireFile()).toEqual({});
  });

  it("1 bis. si le foyer ne peut pas être lu, rien ne part ; ça reprend à la synchro suivante", async () => {
    await db.taches.put(tache("c"));
    stock.clear();
    etat.rpc.rejoindre_foyer = () => [{ foyer: "F", place: "moi" }];
    etat.poser("tache", "z", tache("z"));
    etat.panne = (quoi) => quoi === "lire:elements";
    await rejoindreFoyer("123456", "Dany");
    await calme();
    expect(etat.lire("tache", "c")).toBeUndefined();
    expect(await db.taches.get("z")).toBeUndefined(); // rien reçu non plus : on partage d'abord
    etat.panne = false;
    await synchro();
    expect(etat.lire("tache", "c")).toBeTruthy();
    expect(await db.taches.get("z")).toBeTruthy();
  });

  it("5. en changeant de place, les corvées (à qui, faite par) et les corvées faites suivent la personne", async () => {
    await db.reglages.put({ cle: "proprio", valeur: "moi" });
    await db.maison_corvees.bulkPut([
      { id: "v", nom: "Vaisselle", piece: "Cuisine", tous: 1, taille: 2, qui: "moi", fait: 5, par: "moi", cree: 1 },
      { id: "l", nom: "Lit", piece: "Chambre", tous: 1, taille: 1, qui: "libre", fait: 6, par: "elle", cree: 1 },
    ]);
    await db.maison_faits.put({ id: "f", corvee: "v", nom: "Vaisselle", par: "moi", quand: 5, min: 10 });
    await db.maison_papiers.put({ id: "p", titre: "Bail", dossier: "logement", emetteur: "", note: "", quoi: "", repete: "", photos: [], cree: 1 });
    await db.budget_depenses.put({ id: "x", jour: "2026-11-27", c: 1200, quoi: "Pain", cat: "courses", qui: "moi", cree: 1 });
    await db.taches.put(tache("t", { qui: "moi", fait: 3, faitLe: auJour(), faitPar: "moi" }));
    await db.corbeille.put({ id: "k", tache: tache("k", { qui: "elle" }), par: "Dany", quand: 1 });
    etat.rpc.rejoindre_foyer = () => [{ foyer: "F", place: "elle" }];

    await rejoindreFoyer("123456", "Dany");
    await calme();

    expect(await db.maison_corvees.get("v")).toMatchObject({ qui: "elle", par: "elle" });
    expect(await db.maison_corvees.get("l")).toMatchObject({ qui: "libre", par: "moi" });
    expect((await db.maison_faits.get("f"))?.par).toBe("elle");
    expect((await db.budget_depenses.get("x"))?.qui).toBe("elle");
    expect(await db.taches.get("t")).toMatchObject({ qui: "elle", faitPar: "elle" });
    expect((await db.corbeille.get("k"))?.tache.qui).toBe("moi");
    expect(await db.maison_papiers.get("p")).toBeTruthy(); // un papier n'est à personne : il ne change pas
    // Et c'est bien la version échangée qui est partie au foyer.
    expect(etat.lire("corvee", "v")?.data).toMatchObject({ qui: "elle", par: "elle" });
    expect(etat.lire("corvee_faite", "f")?.data).toMatchObject({ par: "elle" });
  });
});

describe("envoyer", () => {
  it("6. une ligne refusée par le serveur ne bloque ni les autres envois, ni la réception", async () => {
    await dansLeFoyer();
    etat.refuser = (l) => l.cle === "mauvaise";
    await db.taches.bulkPut([tache("bonne-1"), tache("mauvaise"), tache("bonne-2")]);
    etat.poser("tache", "de-sarah", tache("de-sarah", { qui: "elle" }));
    await synchro();
    expect(etat.lire("tache", "bonne-1")).toBeTruthy();
    expect(etat.lire("tache", "bonne-2")).toBeTruthy();
    expect(etat.lire("tache", "mauvaise")).toBeUndefined();
    expect(await db.taches.get("de-sarah")).toBeTruthy(); // la réception a continué
    expect(Object.keys(lireFile())).toEqual(["tache:mauvaise"]); // elle attend, sans être perdue
    // Elle n'est pas renvoyée en boucle…
    etat.appels.length = 0;
    await synchro();
    expect(etat.appels.filter((a) => a === "ecrire:elements")).toEqual([]);
    // …mais elle repart dès qu'elle change.
    etat.refuser = () => false;
    await db.taches.update("mauvaise", { titre: "Corrigée" });
    await synchro();
    expect((etat.lire("tache", "mauvaise")?.data as Tache).titre).toBe("Corrigée");
    expect(lireFile()).toEqual({});
  });

  it("6 bis. une panne de réseau ne retire rien de la file", async () => {
    await dansLeFoyer();
    etat.panne = true;
    await db.taches.put(tache("a"));
    await synchro();
    expect(Object.keys(lireFile())).toEqual(["tache:a"]);
    etat.panne = false;
    await synchro();
    expect(etat.lire("tache", "a")).toBeTruthy();
  });
});

describe("recevoir", () => {
  it("7. un horaire reçu illisible n'efface pas l'horaire d'ici ; un horaire supprimé, si", async () => {
    await db.horaires.bulkPut([{ qui: "elle", jour: "2026-12-02", code: "C1" }, { qui: "elle", jour: "2026-12-03", code: "C1" }]);
    stock.clear();
    await appliquer([
      { genre: "horaire", cle: "elle|2026-12-02", data: { qui: "elle", jour: "2026-12-02", code: "UN-CODE-DU-FUTUR" }, supprime: false, par: "autre-1", maj: "x" },
      { genre: "horaire", cle: "elle|2026-12-03", data: null, supprime: true, par: "autre-1", maj: "x" },
    ], false, "moi-1");
    expect((await db.horaires.get(["elle", "2026-12-02"]))?.code).toBe("C1");
    expect(await db.horaires.get(["elle", "2026-12-03"])).toBeUndefined();
  });

  it("8. un geste fait pendant qu'un lot arrive n'est pas écrasé par ce lot", async () => {
    await db.taches.put(tache("a", { titre: "Avant" }));
    stock.clear();
    // Le geste part, et le lot du foyer arrive avant qu'il ait fini de s'écrire.
    const geste = db.taches.update("a", { titre: "Mon geste" });
    const lot = appliquer([{ genre: "tache", cle: "a", data: tache("a", { titre: "Version du foyer" }), supprime: false, par: "autre-1", maj: "x" }], false, "moi-1");
    await Promise.all([geste, lot]);
    expect((await db.taches.get("a"))?.titre).toBe("Mon geste");
    expect(Object.keys(lireFile())).toEqual(["tache:a"]); // et il partira au foyer
  });
});

describe("deux personnes changent la même tâche en même temps", () => {
  it("les changements des deux sont gardés, champ par champ", async () => {
    await dansLeFoyer();
    etat.poser("tache", "a", tache("a", { titre: "Pain", note: "", etapes: [{ id: "e1", texte: "Farine", fait: false }, { id: "e2", texte: "Levure", fait: false }] }));
    await synchro();
    reseau.onLine = false;
    // Ici : l'heure change, la première étape est cochée. Chez Sarah, pendant ce temps : le titre, une étape cochée, une étape en plus.
    await db.taches.update("a", { heure: "18:00", etapes: [{ id: "e1", texte: "Farine", fait: true }, { id: "e2", texte: "Levure", fait: false }] });
    etat.poser("tache", "a", tache("a", { titre: "Pain complet", etapes: [{ id: "e1", texte: "Farine", fait: false }, { id: "e2", texte: "Levure", fait: true }, { id: "e3", texte: "Sel", fait: false }] }));
    reseau.onLine = true;
    await synchro();

    const attendu = { titre: "Pain complet", heure: "18:00", etapes: [{ id: "e1", texte: "Farine", fait: true }, { id: "e2", texte: "Levure", fait: true }, { id: "e3", texte: "Sel", fait: false }] };
    expect(etat.lire("tache", "a")?.data).toMatchObject(attendu);
    expect(await db.taches.get("a")).toMatchObject(attendu);
    expect(toast).not.toHaveBeenCalled(); // rien ne se contredit : rien à dire
    expect(lireFile()).toEqual({});
    expect(lireBases()).toEqual({});
  });

  it("le même champ changé des deux côtés : ma version est gardée, et je suis prévenu", async () => {
    await dansLeFoyer();
    etat.poser("tache", "a", tache("a"));
    await synchro();
    reseau.onLine = false;
    await db.taches.update("a", { titre: "Pain aux noix" });
    etat.poser("tache", "a", tache("a", { titre: "Pain complet", note: "Chez le boulanger" }));
    reseau.onLine = true;
    await synchro();
    expect(etat.lire("tache", "a")?.data).toMatchObject({ titre: "Pain aux noix", note: "Chez le boulanger" });
    expect(toast).toHaveBeenCalledWith("Sarah a aussi changé le titre de « Pain aux noix ». C'est ta version qui est gardée.", expect.anything());
  });

  it("effacée ici pendant que l'autre la changeait : sa version revient, et je suis prévenu", async () => {
    await dansLeFoyer();
    etat.poser("tache", "a", tache("a"));
    await synchro();
    reseau.onLine = false;
    await db.taches.delete("a");
    etat.poser("tache", "a", tache("a", { note: "Pour samedi" }));
    reseau.onLine = true;
    await synchro();
    expect(etat.lire("tache", "a")).toMatchObject({ supprime: false, data: { note: "Pour samedi" } });
    expect((await db.taches.get("a"))?.note).toBe("Pour samedi");
    expect(toast).toHaveBeenCalledWith("Sarah a changé « Pain » pendant que tu l'effaçais : c'est gardé.", expect.anything());
    await synchro();
    expect(lireFile()).toEqual({});
    expect(lireBases()).toEqual({});
    expect(etat.lire("tache", "a")).toMatchObject({ supprime: false, data: { note: "Pour samedi" } });
  });

  it("changée ici pendant que l'autre l'effaçait : elle est gardée ; effacée ici sans autre changement : elle part", async () => {
    await dansLeFoyer();
    etat.poser("tache", "a", tache("a"));
    etat.poser("tache", "b", tache("b"));
    await synchro();
    reseau.onLine = false;
    await db.taches.update("a", { note: "Urgent" });
    await db.taches.delete("b");
    etat.poser("tache", "a", null, "autre-1", true);
    reseau.onLine = true;
    await synchro();
    expect(etat.lire("tache", "a")).toMatchObject({ supprime: false, data: { note: "Urgent" } });
    expect(etat.lire("tache", "b")?.supprime).toBe(true);
  });

  it("un article de courses : l'un le coche, l'autre change la quantité", async () => {
    await dansLeFoyer();
    const lait = { id: "l", nom: "Lait", qte: "1", rayon: "frais", par: "moi", fait: null, cree: 1 };
    etat.poser("course", "l", lait);
    await synchro();
    reseau.onLine = false;
    await db.cuisine_courses.update("l", { fait: 5, faitPar: "moi" });
    etat.poser("course", "l", { ...lait, qte: "2" });
    reseau.onLine = true;
    await synchro();
    expect(etat.lire("course", "l")?.data).toMatchObject({ qte: "2", fait: 5, faitPar: "moi" });
  });
});
