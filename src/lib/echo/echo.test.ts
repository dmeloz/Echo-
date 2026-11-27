import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.stubGlobal("navigator", {});

import { db } from "../../data/db";
import { plusJours } from "../dates";
import type { Tache } from "../types";
import { MAX_TOURS, OUTILS_ECHO, outilsPourClaude } from "../../../supabase/functions/_shared/echo-outils";
import { executer, lancerEcho, type Appeler, type Bloc, type Message, type Tour } from "./boucle";
import { OUTILS_BASE, type ContexteEcho } from "./outils";
import { nettoyerJournal } from "./journal";
import { MODULES, outilsEcho } from "../../modules/registre";

const TOUS = outilsEcho(MODULES);

// Jeudi 26 novembre 2026, 10 h. Dany écrit (place « moi »).
const now = new Date(2026, 10, 26, 10, 0);
const ctx: ContexteEcho = { noms: { moi: "Dany", elle: "Sarah" }, proprio: "moi", now };
const tache = (x: Partial<Tache>): Tache => ({ id: "t1", titre: "Dentiste", qui: "moi", jour: "2026-11-26", heure: "15:00", niveau: null, repete: "", note: "", fait: null, faitLe: null, cree: 1, ...x });

// Un faux serveur : il joue les tours écrits à l'avance et garde ce qu'il a reçu.
function scenario(tours: Tour[]) {
  const recus: Message[][] = [];
  const appeler: Appeler = async (c) => { recus.push(structuredClone(c.messages)); const t = tours.shift(); if (!t) throw new Error("plus de tours"); return t; };
  return { appeler, recus };
}
const outil = (id: string, name: string, input: Record<string, unknown>): Bloc => ({ type: "tool_use", id, name, input });
const texte = (text: string): Tour => ({ content: [{ type: "text", text }], stop_reason: "end_turn" });

beforeEach(async () => {
  await db.taches.clear(); await db.horaires.clear(); await db.corbeille.clear(); await db.echo_journal.clear(); await db.reglages.clear();
});

describe("la liste fermée des outils", () => {
  it("chaque outil de la liste est exécuté par l'app, et inversement", () => {
    expect(OUTILS_ECHO.map((o) => o.name).sort()).toEqual(Object.keys(TOUS).sort());
  });
  it("un outil « lire » n'a pas d'action, un outil qui change prépare une action", () => {
    for (const o of OUTILS_ECHO) expect(!!TOUS[o.name].lire).toBe(o.genre === "lire");
  });
  it("Claude ne reçoit pas le genre, et les schémas sont stricts (tous les champs requis)", () => {
    for (const o of outilsPourClaude()) {
      expect("genre" in o).toBe(false);
      expect(o.strict).toBe(true);
      expect([...o.input_schema.required].sort()).toEqual(Object.keys(o.input_schema.properties).sort());
    }
  });
});

describe("la boucle d'Echo", () => {
  it("une phrase sans outil : la réponse revient telle quelle, rien à confirmer", async () => {
    const s = scenario([texte("Bonjour Dany !")]);
    const r = await lancerEcho("salut", ctx, { appeler: s.appeler, outils: OUTILS_BASE, seul: false });
    expect(r).toMatchObject({ reponse: "Bonjour Dany !", aConfirmer: [], faites: [] });
    expect(s.recus[0]).toEqual([{ role: "user", content: "salut" }]);
  });

  it("regarder puis déplacer : la lecture répond tout de suite, le déplacement attend le oui", async () => {
    await db.taches.add(tache({}));
    await db.horaires.add({ qui: "moi", jour: "2026-11-27", code: "R" });
    const s = scenario([
      { content: [{ type: "text", text: "Je regarde." }, outil("a", "voir_jours", { du: "2026-11-26", au: "2026-11-27" })], stop_reason: "tool_use" },
      { content: [outil("b", "modifier_tache", { id: "t1", titre: "", jour: "2026-11-27", heure: "10:00", qui: "", important: "" })], stop_reason: "tool_use" },
      texte("Je mets le dentiste demain à 10 h, tu es en repos."),
    ]);
    const r = await lancerEcho("mets le dentiste un jour où je ne travaille pas", ctx, { appeler: s.appeler, outils: OUTILS_BASE, seul: false });
    // Le 2e appel contient le résultat de voir_jours : le repos de Dany vendredi, et le dentiste jeudi.
    const res = s.recus[1].at(-1)!.content as Array<{ content: string; tool_use_id: string }>;
    expect(res[0].tool_use_id).toBe("a");
    const vu = JSON.parse(res[0].content);
    expect(vu.jours[1]).toMatchObject({ jour: "2026-11-27", travail: { Dany: "Repos" } });
    expect(vu.jours[0].taches[0]).toMatchObject({ id: "t1", titre: "Dentiste", heure: "15:00" });
    // La tâche n'a pas bougé tant que Dany n'a pas dit oui.
    expect(r.aConfirmer).toHaveLength(1);
    expect((await db.taches.get("t1"))!.jour).toBe("2026-11-26");
    expect(r.reponse).toBe("Je mets le dentiste demain à 10 h, tu es en repos.");
    // Oui : c'est fait, noté au journal ; Annuler remet tout et marque la ligne.
    const f = await executer(r.aConfirmer[0], "phrase", ctx);
    expect(await db.taches.get("t1")).toMatchObject({ jour: "2026-11-27", heure: "10:00" });
    const [ligne] = await db.echo_journal.toArray();
    expect(ligne).toMatchObject({ par: "Dany", demande: "phrase", outil: "modifier_tache" });
    await f.annuler();
    expect(await db.taches.get("t1")).toMatchObject({ jour: "2026-11-26", heure: "15:00" });
    expect((await db.echo_journal.get(ligne.id))!.annule).toBeTypeOf("number");
  });

  it("un rendez-vous déplacé garde sa durée", async () => {
    await db.taches.add(tache({ evt: true, heure: "14:00", fin: "15:30" }));
    const a = await OUTILS_BASE.modifier_tache.preparer!({ id: "t1", titre: "", jour: "", heure: "16:00", qui: "", important: "" }, ctx);
    if (typeof a === "string") throw new Error(a);
    await a.faire();
    expect(await db.taches.get("t1")).toMatchObject({ heure: "16:00", fin: "17:30" });
  });

  it("une erreur d'outil revient à Echo (pour qu'il corrige), sans rien proposer", async () => {
    const s = scenario([
      { content: [outil("a", "cocher_tache", { id: "inconnu" })], stop_reason: "tool_use" },
      texte("Je ne trouve pas cette tâche."),
    ]);
    const r = await lancerEcho("coche le truc", ctx, { appeler: s.appeler, outils: OUTILS_BASE, seul: false });
    const res = s.recus[1].at(-1)!.content as Array<{ is_error?: boolean }>;
    expect(res[0].is_error).toBe(true);
    expect(r.aConfirmer).toEqual([]);
  });

  it("petites choses sans demander : faites tout de suite, mais effacer reste demandé", async () => {
    await db.taches.add(tache({ id: "t2", titre: "Poubelles" }));
    const s = scenario([
      { content: [
        outil("a", "ajouter_tache", { titre: "Garage", jour: "2026-11-27", heure: "", qui: "moi", repete: "", important: false, evenement: false, fin: "", etapes: [] }),
        outil("b", "supprimer_tache", { id: "t2" }),
      ], stop_reason: "tool_use" },
      texte("J'ajoute le garage, et j'efface les poubelles si tu veux."),
    ]);
    const r = await lancerEcho("garage demain et oublie les poubelles", ctx, { appeler: s.appeler, outils: OUTILS_BASE, seul: true, noter: executer });
    expect(r.faites.map((f) => f.action.outil)).toEqual(["ajouter_tache"]);
    expect(r.aConfirmer.map((a) => a.outil)).toEqual(["supprimer_tache"]);
    expect((await db.taches.toArray()).map((t) => t.titre).sort()).toEqual(["Garage", "Poubelles"]);
  });

  it("toucher aux choses de l'autre est toujours demandé, même avec le réglage", async () => {
    await db.taches.add(tache({ qui: "elle", titre: "Pharmacie" }));
    const s = scenario([
      { content: [outil("a", "cocher_tache", { id: "t1" })], stop_reason: "tool_use" },
      texte("Je coche la pharmacie de Sarah ?"),
    ]);
    const r = await lancerEcho("la pharmacie c'est fait", ctx, { appeler: s.appeler, outils: OUTILS_BASE, seul: true, noter: executer });
    expect(r.faites).toEqual([]);
    expect(r.aConfirmer[0]).toMatchObject({ outil: "cocher_tache", genre: "gros" });
  });

  it("ajouter pour l'autre, ou lui donner une tâche, est toujours demandé", async () => {
    await db.taches.add(tache({ titre: "Courses" }));
    const ajout = await OUTILS_BASE.ajouter_tache.preparer!({ titre: "Pharmacie", jour: "2026-11-27", heure: "", qui: "elle", repete: "", important: false, evenement: false, fin: "", etapes: [] }, ctx);
    const don = await OUTILS_BASE.modifier_tache.preparer!({ id: "t1", titre: "", jour: "", heure: "", qui: "elle", important: "" }, ctx);
    expect(ajout).toMatchObject({ genre: "gros" });
    expect(don).toMatchObject({ genre: "gros" });
  });

  it("cochée entre-temps par l'autre : Annuler ne défait pas son geste", async () => {
    await db.taches.add(tache({ titre: "Pharmacie" }));
    const a = await OUTILS_BASE.cocher_tache.preparer!({ id: "t1" }, ctx);
    if (typeof a === "string") throw new Error(a);
    await db.taches.update("t1", { fait: 5, faitLe: "2026-11-26", faitPar: "elle" });
    const annuler = await a.faire();
    await annuler();
    expect((await db.taches.get("t1"))!.fait).toBe(5);
  });

  it("deux actions sur la même tâche : la dernière remplace la première", async () => {
    await db.taches.add(tache({}));
    const m = (jour: string) => outil(jour, "modifier_tache", { id: "t1", titre: "", jour, heure: "", qui: "", important: "" });
    const s = scenario([
      { content: [m("2026-11-27")], stop_reason: "tool_use" },
      { content: [m("2026-11-28")], stop_reason: "tool_use" },
      texte("Samedi alors."),
    ]);
    const r = await lancerEcho("déplace le dentiste", ctx, { appeler: s.appeler, outils: OUTILS_BASE, seul: false });
    expect(r.aConfirmer).toHaveLength(1);
    expect(r.aConfirmer[0].details.join(" ")).toContain("samedi");
  });

  it("au plus 8 tours par phrase, même si Echo continue de demander des outils", async () => {
    const tours = Array.from({ length: 10 }, (_, i): Tour => ({ content: [outil("x" + i, "chercher_taches", { texte: "rien" })], stop_reason: "tool_use" }));
    const s = scenario(tours);
    const r = await lancerEcho("cherche", ctx, { appeler: s.appeler, outils: OUTILS_BASE, seul: false });
    expect(s.recus).toHaveLength(MAX_TOURS);
    expect(r.reponse).toMatch(/arrêter/);
    expect(r.suite).toBeNull(); // arrêtée en route : la phrase suivante repart de zéro
  });

  it("une discussion : Echo reçoit ce qui a été dit, et la note de l'app sur la proposition d'avant", async () => {
    const s = scenario([texte("Tu veux le garage samedi ?"), texte("D'accord, dimanche alors.")]);
    const r1 = await lancerEcho("cale le garage", ctx, { appeler: s.appeler, outils: TOUS, seul: false });
    await lancerEcho("non plutôt dimanche", ctx, { appeler: s.appeler, outils: TOUS, seul: false, discussion: r1.suite!, note: "rien n'a été fait." });
    expect(s.recus[1]).toEqual([
      { role: "user", content: "cale le garage" },
      { role: "assistant", content: [{ type: "text", text: "Tu veux le garage samedi ?" }] },
      { role: "user", content: "[Note de l'app : rien n'a été fait.]\nnon plutôt dimanche" },
    ]);
  });

  it("une discussion trop longue repart à neuf avec un rappel", async () => {
    const longue: Message[] = [];
    for (let i = 0; i < 30; i++) longue.push({ role: "user", content: "phrase " + i }, { role: "assistant", content: [{ type: "text", text: "réponse " + i }] });
    const s = scenario([texte("ok")]);
    await lancerEcho("et maintenant ?", ctx, { appeler: s.appeler, outils: TOUS, seul: false, discussion: longue });
    expect(s.recus[0]).toHaveLength(1);
    expect(s.recus[0][0].content).toMatch(/réponse 29[\s\S]*et maintenant/);
  });

  it("courses : Echo voit la liste et ajoute sans doubler", async () => {
    await db.cuisine_courses.clear();
    const a = await TOUS.ajouter_courses.preparer!({ articles: [{ nom: "Lait", qte: "2" }, { nom: "Pain", qte: "" }] }, ctx);
    if (typeof a === "string") throw new Error(a);
    await a.faire();
    const b = await TOUS.ajouter_courses.preparer!({ articles: [{ nom: "lait", qte: "" }] }, ctx);
    if (typeof b === "string") throw new Error(b);
    await b.faire();
    const vu = await TOUS.voir_courses.lire!({}, ctx) as { articles: Array<{ nom: string }> };
    expect(vu.articles.map((x) => x.nom).sort()).toEqual(["Lait", "Pain"]);
  });

  it("une réponse vide ne se garde pas comme discussion (le serveur la refuserait)", async () => {
    const s = scenario([{ content: [], stop_reason: "end_turn" }]);
    const r = await lancerEcho("salut", ctx, { appeler: s.appeler, outils: TOUS, seul: false });
    expect(r.suite).toBeNull();
  });

  it("Echo ne reçoit que les outils que l'app a (modules allumés)", async () => {
    const noms: string[][] = [];
    const appeler: Appeler = async (c) => { noms.push(c.outils); return texte("ok"); };
    await lancerEcho("salut", ctx, { appeler, outils: OUTILS_BASE, seul: false });
    expect(noms[0]).not.toContain("ajouter_courses");
    expect(noms[0]).toContain("voir_jours");
  });

  it("une longue phrase passe entière : c'est la note de l'app qui est raccourcie", async () => {
    const s = scenario([texte("ok")]);
    const phrase = "x".repeat(2990) + " FIN";
    await lancerEcho(phrase, ctx, { appeler: s.appeler, outils: TOUS, seul: false, note: "n".repeat(500) });
    const c = s.recus[0][0].content as string;
    expect(c.endsWith(" FIN")).toBe(true);
    expect(c.length).toBeLessThanOrEqual(3000);
  });

  it("Annuler des courses remet un article déjà là comme avant", async () => {
    await db.cuisine_courses.clear();
    const a0 = await TOUS.ajouter_courses.preparer!({ articles: [{ nom: "Lait", qte: "1" }] }, ctx);
    if (typeof a0 === "string") throw new Error(a0);
    await a0.faire();
    const lait = (await db.cuisine_courses.toArray())[0];
    await db.cuisine_courses.update(lait.id, { fait: 5 });
    const a = await TOUS.ajouter_courses.preparer!({ articles: [{ nom: "Lait", qte: "2" }, { nom: "Pain", qte: "" }] }, ctx);
    if (typeof a === "string") throw new Error(a);
    const defaire = await a.faire();
    expect((await db.cuisine_courses.get(lait.id))!.fait).toBeNull();
    await defaire();
    const apres = await db.cuisine_courses.toArray();
    expect(apres).toHaveLength(1);
    expect(apres[0]).toMatchObject({ fait: 5, qte: "1" });
  });

  it("ce qu'Echo ne sait pas faire est noté pour plus tard", async () => {
    await TOUS.signaler_manque.lire!({ besoin: "Envoyer un SMS à Sarah" }, ctx);
    const r = await db.reglages.get("echoManques");
    expect((r!.valeur as Array<{ besoin: string }>)[0].besoin).toBe("Envoyer un SMS à Sarah");
  });

  it("voir_jours ne montre pas plus de 14 jours", async () => {
    const r = await OUTILS_BASE.voir_jours.lire!({ du: "2026-11-26", au: plusJours("2026-11-26", 40) }, ctx) as { jours: unknown[]; note?: string };
    expect(r.jours).toHaveLength(14);
    expect(r.note).toMatch(/14 jours/);
  });

  it("les horaires fixes de Sarah sont vus sans être posés", async () => {
    const r = await OUTILS_BASE.voir_jours.lire!({ du: "2026-11-26", au: "2026-11-26" }, ctx) as { jours: Array<{ travail: Record<string, string> }> };
    expect(r.jours[0].travail.Sarah).toMatch(/Travail/);
  });
});

describe("le journal (synchro)", () => {
  it("une ligne valide passe, une ligne abîmée est écartée", () => {
    expect(nettoyerJournal({ id: "a", quand: 1, par: "Dany", demande: "x", action: "Ajouter : Garage", outil: "ajouter_tache" })).toMatchObject({ id: "a", action: "Ajouter : Garage" });
    expect(nettoyerJournal({ id: "a", quand: "hier", action: "x" })).toBeNull();
    expect(nettoyerJournal(null)).toBeNull();
  });
});
