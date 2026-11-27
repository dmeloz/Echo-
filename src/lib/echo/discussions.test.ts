import { beforeEach, describe, expect, it, vi } from "vitest";
const stock = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => stock.get(k) ?? null, setItem: (k: string, v: string) => stock.set(k, v), removeItem: (k: string) => stock.delete(k) });
import { anciennes, archiver, avecMot, chargerFil, clore, garderFil, motDeLAutre, nonLu, nouveauFil, oublierAncienne, rappelDe, REPRISE, RAPPEL, titreDe, MAX_ANCIENNES } from "./discussions";

const echange = (moi: string, echo = "ok") => ({ moi, echo });
beforeEach(() => stock.clear());

describe("les discussions avec Echo", () => {
  it("la discussion en cours survit à la fermeture de l'app", () => {
    const f = { ...nouveauFil(1000), echanges: [echange("bonjour")] };
    garderFil(f);
    expect(chargerFil(1000 + 60_000)?.echanges[0].moi).toBe("bonjour");
  });
  it("trop vieille, elle part chez les anciennes", () => {
    garderFil({ ...nouveauFil(1000), echanges: [echange("demain je dois…")] });
    expect(chargerFil(1000 + REPRISE)).toBeNull();
    expect(anciennes()).toHaveLength(1);
    expect(chargerFil(1000 + REPRISE + 1)).toBeNull();
  });
  it("une discussion vide ne se garde pas ; la même discussion n'est rangée qu'une fois ; 20 au plus", () => {
    archiver(nouveauFil());
    expect(anciennes()).toHaveLength(0);
    const f = { ...nouveauFil(1), echanges: [echange("a")] };
    archiver(f); archiver({ ...f, echanges: [echange("a"), echange("b")] });
    expect(anciennes()).toHaveLength(1);
    expect(anciennes()[0].echanges).toHaveLength(2);
    for (let i = 0; i < 25; i++) archiver({ ...nouveauFil(i), echanges: [echange(`n${i}`)] });
    expect(anciennes()).toHaveLength(MAX_ANCIENNES);
    expect(anciennes()[0].echanges[0].moi).toBe("n24");
    oublierAncienne(anciennes()[0].id);
    expect(anciennes()[0].echanges[0].moi).toBe("n23");
  });
  it("le rappel de la discussion précédente : récent seulement, sauf reprise exprès", () => {
    const a = { id: "x", debut: 0, quand: 0, echanges: [echange("demain je dois aller à Landi", "9 h Landi")] };
    expect(rappelDe(a, 30 * 60_000)).toContain("Landi");
    expect(rappelDe(a, 30 * 60_000)).toContain("il y a 30 min");
    expect(rappelDe(a, RAPPEL + 1)).toBe("");
    expect(rappelDe(a, RAPPEL + 1, 1500, true)).toContain("Landi");
    expect(rappelDe(undefined)).toBe("");
  });
  it("le rappel garde les derniers échanges et tient dans sa place", () => {
    const a = { id: "x", debut: 0, quand: 0, echanges: Array.from({ length: 10 }, (_, i) => echange(`phrase ${i} ${"x".repeat(100)}`, "r".repeat(200))) };
    const r = rappelDe(a, 1000, 700);
    expect(r.length).toBeLessThanOrEqual(700);
    expect(r).toContain("phrase 9");
    expect(r).not.toContain("phrase 0");
  });
  it("un stockage abîmé ne casse rien", () => {
    stock.set("echo-discussion", "{pas du json");
    stock.set("echo-discussions", "42");
    expect(chargerFil()).toBeNull();
    expect(anciennes()).toEqual([]);
  });
  it("le titre est la première phrase", () => {
    expect(titreDe({ echanges: [echange("Organise   ma journée")] })).toBe("Organise ma journée");
    expect(titreDe({ echanges: [] })).toBe("Discussion");
  });
  it("une proposition restée sans réponse passe à « pas fait », et Echo le saura", () => {
    const f = { ...nouveauFil(1000), echanges: [{ moi: "rdv", echo: "je propose", actions: [{ texte: "a", etat: "fait" as const }, { texte: "b", etat: "propose" as const }] }] };
    garderFil(f);
    const g = chargerFil(2000, "Dany")!;
    expect(g.echanges[0].actions!.map((a) => a.etat)).toEqual(["fait", "non"]);
    expect(g.note).toContain("Dany n'a pas répondu");
    expect(clore(g).laissee).toBe(false);
    archiver(f);
    expect(anciennes()[0].echanges[0].actions![1].etat).toBe("non");
  });
  it("une entrée d'une autre forme est écartée", () => {
    stock.set("echo-discussion", JSON.stringify({ id: "a", debut: 1, quand: 1, suite: [], echanges: [{ moi: "x" }] }));
    expect(chargerFil(2)).toBeNull();
    stock.set("echo-discussions", JSON.stringify([{ id: "b", debut: 1, quand: "hier", echanges: [] }, { id: "c", debut: 1, quand: 1, echanges: [{ moi: "a", echo: "b" }] }]));
    expect(anciennes().map((a) => a.id)).toEqual(["c"]);
  });
});

describe("Echo prend l'initiative", () => {
  it("son mot entre dans la discussion, sans phrase de la personne, et Echo le saura", () => {
    const f = avecMot(null, { texte: "Bonjour Dany !", note: "ce matin, tu as écrit…" }, 1000);
    expect(f.echanges).toEqual([{ moi: "", echo: "Bonjour Dany !" }]);
    expect(f).toMatchObject({ nouveau: true, note: "ce matin, tu as écrit…", quand: 1000 });
    expect(titreDe(f)).toBe("Bonjour Dany !");
  });
  it("un mot pas encore lu ne part pas chez les anciennes ; une fois lu, si", () => {
    garderFil(avecMot(null, { texte: "Bonjour", note: "" }, 1000));
    expect(nonLu()).toBe(true);
    expect(chargerFil(1000 + 3 * REPRISE)?.echanges).toHaveLength(1);
    garderFil({ ...avecMot(null, { texte: "Bonjour", note: "" }, 1000), nouveau: false });
    expect(chargerFil(1000 + REPRISE)).toBeNull();
    expect(nonLu()).toBe(false);
  });
  it("ce que l'autre a fait, en une phrase", () => {
    expect(motDeLAutre("Sarah", ["a ajouté « Dentiste »", "a terminé « Poubelles »"])?.texte).toBe("Sarah a ajouté « Dentiste », a terminé « Poubelles ».");
    expect(motDeLAutre("Sarah", Array.from({ length: 7 }, (_, i) => `a ajouté « ${i} »`))?.texte).toMatch(/et 2 autres choses\.$/);
    expect(motDeLAutre("Sarah", [])).toBeNull();
  });
});
