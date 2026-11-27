import { describe, expect, it } from "vitest";
import { aEnvoyer, chezLui, type Abonne, type PapierLu, type TacheLue } from "./quoi";

const a: Abonne = { id: "tel1", place: "moi", fuseau: "Europe/Zurich", aLHeure: true, matin: "07:30" };
const t = (x: Partial<TacheLue>): TacheLue => ({ id: "a", titre: "Vétérinaire", jour: "2026-11-27", heure: "", qui: "moi", fait: null, ...x });
// 2026-11-27 en hiver : Zurich = UTC+1
const a18h00 = new Date("2026-11-27T17:00:00Z"), a18h03 = new Date("2026-11-27T17:03:00Z"), a18h06 = new Date("2026-11-27T17:06:00Z"), a7h30 = new Date("2026-11-27T06:30:00Z");

describe("rappels : l'heure chez la personne", () => {
  it("convertit dans son fuseau, été comme hiver", () => {
    expect(chezLui(a18h00, "Europe/Zurich")).toEqual({ jour: "2026-11-27", minutes: 18 * 60 });
    expect(chezLui(new Date("2026-07-01T22:30:00Z"), "Europe/Zurich")).toEqual({ jour: "2026-07-02", minutes: 30 });
  });
});

describe("rappels : à l'heure d'une tâche", () => {
  it("part à l'heure, et jusqu'à 5 minutes après, pas plus", () => {
    const l = [t({ heure: "18:00" })];
    expect(aEnvoyer(a, l, a18h00)).toHaveLength(1);
    expect(aEnvoyer(a, l, a18h03)).toHaveLength(1);
    expect(aEnvoyer(a, l, a18h06)).toHaveLength(0);
    expect(aEnvoyer(a, l, new Date("2026-11-27T16:59:00Z"))).toHaveLength(0);
  });
  it("garde la même clé d'un passage à l'autre (pour ne pas l'envoyer deux fois)", () => {
    const l = [t({ heure: "18:00" })];
    expect(aEnvoyer(a, l, a18h00)[0].cle).toBe(aEnvoyer(a, l, a18h03)[0].cle);
  });
  it("seulement mes tâches et celles à deux, pas celles de l'autre, pas les faites, pas un autre jour", () => {
    const l = [t({ id: "1", heure: "18:00", qui: "elle" }), t({ id: "2", heure: "18:00", qui: "nous" }), t({ id: "3", heure: "18:00", fait: 1 }), t({ id: "4", heure: "18:00", jour: "2026-11-28" }), t({ id: "5" })];
    const r = aEnvoyer(a, l, a18h00);
    expect(r.map((e) => e.tag)).toEqual(["tache-2"]);
    expect(r[0].texte).toBe("C'est l'heure : 18 h · à faire à deux");
  });
  it("rien si ce rappel est coupé", () => expect(aEnvoyer({ ...a, aLHeure: false }, [t({ heure: "18:00" })], a18h00)).toHaveLength(0));
});

describe("rappels : le résumé du matin", () => {
  it("ne compte pas les rendez-vous passés (ils n'ont pas de case à cocher), mais garde ceux du jour", () => {
    const r = aEnvoyer(a, [t({ id: "1", titre: "Dentiste", jour: "2026-11-20", heure: "10:00", evt: true }), t({ id: "2", titre: "Réunion", heure: "16:00", evt: true })], a7h30);
    expect(r.map((e) => e.titre)).toEqual(["Une chose à faire aujourd'hui"]);
    expect(r[0].texte).toBe("Réunion à 16 h");
  });
  it("dit combien de choses et la première, retards compris", () => {
    const r = aEnvoyer(a, [t({ id: "1", heure: "15:00" }), t({ id: "2", titre: "Facture", jour: "2026-11-25" }), t({ id: "3", jour: "2026-11-28" })], a7h30);
    expect(r).toEqual([{ cle: "m|tel1|2026-11-27", titre: "2 choses à faire aujourd'hui", texte: "En premier : Vétérinaire à 15 h", tag: "matin" }]);
  });
  it("une seule chose : phrase au singulier", () => {
    expect(aEnvoyer(a, [t({})], a7h30)[0]).toMatchObject({ titre: "Une chose à faire aujourd'hui", texte: "Vétérinaire" });
  });
  it("rien à faire : pas de notification pour rien", () => expect(aEnvoyer(a, [], a7h30)).toHaveLength(0));
  it("coupé, ou pas l'heure : rien", () => {
    expect(aEnvoyer({ ...a, matin: null }, [t({})], a7h30)).toHaveLength(0);
    expect(aEnvoyer(a, [t({})], a18h00)).toHaveLength(0);
  });
  it("un fuseau inconnu ne fait pas planter (retour à Zurich)", () => expect(aEnvoyer({ ...a, fuseau: "Nimporte/Quoi" }, [t({})], a7h30)).toHaveLength(1));
});

describe("rappels : les papiers à régler", () => {
  const p = (x: Partial<PapierLu>): PapierLu => ({ id: "p1", titre: "Loyer", quoi: "payer", echeance: "2026-11-28", montant: 185000, ...x });
  it("le matin : 7 jours avant, la veille et le jour même, avec le montant", () => {
    expect(aEnvoyer(a, [], a7h30, [p({})])).toEqual([{ cle: "p|tel1|p1|2026-11-28|1", titre: "Loyer : à payer demain", texte: "1850.00 CHF", tag: "papier-p1" }]);
    expect(aEnvoyer(a, [], a7h30, [p({ echeance: "2026-11-27" })])[0].titre).toBe("Loyer : à payer aujourd'hui");
    expect(aEnvoyer(a, [], a7h30, [p({ echeance: "2026-12-04", quoi: "renouveler", titre: "Passeport", montant: undefined })])[0]).toMatchObject({ titre: "Passeport : à renouveler dans 7 jours", texte: "Dans Maison, Papiers" });
  });
  it("rien les autres jours, ni pour un papier fait, à garder ou sans date, ni hors de l'heure du matin", () => {
    expect(aEnvoyer(a, [], a7h30, [p({ echeance: "2026-11-30" }), p({ echeance: "2026-11-26" }), p({ fait: "2026-11-20" }), p({ quoi: "" }), p({ echeance: undefined }), p({ echeance: "bientôt" })])).toEqual([]);
    expect(aEnvoyer(a, [], a18h00, [p({})])).toEqual([]);
    expect(aEnvoyer({ ...a, matin: null }, [], a7h30, [p({})])).toEqual([]);
  });
  it("s'ajoute au résumé du matin sans le remplacer", () => {
    expect(aEnvoyer(a, [t({})], a7h30, [p({})]).map((e) => e.tag)).toEqual(["matin", "papier-p1"]);
  });
});
