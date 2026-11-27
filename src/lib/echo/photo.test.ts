import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: vi.fn() }));
vi.stubGlobal("navigator", {});

import { db } from "../../data/db";
import { MAX_PHOTO, MODELE_ECHO, MODELE_PLAN, demandeTour, photoDe, phraseDe, tailleConversation, toursDepuisPhrase } from "../../../supabase/functions/_shared/echo-outils";
import { NOTE_PHOTO, lancerEcho, type Appeler, type Bloc, type Message, type Tour } from "./boucle";
import { OUTILS_BASE, type ContexteEcho } from "./outils";
import { preparerPhoto } from "./photo";

const ctx: ContexteEcho = { noms: { moi: "Dany", elle: "Sarah" }, proprio: "moi", now: new Date(2026, 10, 26, 10, 0) };
const texte = (t: string): Tour => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn" });
const outil = (id: string, name: string, input: Record<string, unknown>): Bloc => ({ type: "tool_use", id, name, input });
function scenario(tours: Tour[]) {
  const recus: Message[][] = [];
  const appeler: Appeler = async (c) => { recus.push(structuredClone(c.messages)); return tours.shift()!; };
  return { appeler, recus };
}
const PHOTO = "QUJD".repeat(50);

beforeEach(async () => { await Promise.all(db.tables.map((t) => t.clear())); });

describe("une photo pour Echo", () => {
  it("part avec la phrase, reste le temps des outils, et n'est pas gardée dans la discussion", async () => {
    const s = scenario([{ content: [outil("a", "voir_jours", { du: "2026-11-26", au: "2026-11-26" })], stop_reason: "tool_use" }, texte("Facture Swisscom, 89 fr., à payer avant le 15.")]);
    const r = await lancerEcho("c'est quoi ce courrier ?", ctx, { appeler: s.appeler, outils: OUTILS_BASE, seul: false, photo: PHOTO });
    for (const recu of s.recus) {
      const p = photoDe(recu[0].content);
      expect(p?.donnee).toBe(PHOTO);
      expect(p?.texte).toContain(NOTE_PHOTO);
      expect(p?.texte.endsWith("c'est quoi ce courrier ?")).toBe(true);
    }
    expect(toursDepuisPhrase(s.recus[1])).toBe(1); // la phrase avec photo compte comme une phrase
    expect(demandeTour("Le foyer : x", s.recus[0]).model).toBe(MODELE_PLAN); // lire une photo : le meilleur lecteur
    expect(demandeTour("Le foyer : x", s.recus[0], undefined, { sansPlan: true }).model).toBe(MODELE_ECHO);
    // La discussion gardée : la même phrase, sans l'image.
    expect(JSON.stringify(r.suite)).not.toContain(PHOTO);
    expect(typeof r.suite![0].content).toBe("string");
    expect(r.suite![0].content).toBe(photoDe(s.recus[0][0].content)!.texte);
    // La phrase suivante repart sans photo, et retrouve le modèle des phrases simples.
    const s2 = scenario([texte("Oui.")]);
    await lancerEcho("merci", ctx, { appeler: s2.appeler, outils: OUTILS_BASE, seul: false, discussion: r.suite! });
    expect(s2.recus[0].some((m) => photoDe(m.content))).toBe(false);
    expect(demandeTour("Le foyer : x", s2.recus[0]).model).toBe(MODELE_ECHO);
  });
  it("une vieille photo restée dans la discussion est retirée avant d'envoyer", async () => {
    const avant: Message[] = [
      { role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: PHOTO } }, { type: "text", text: "regarde" }] },
      { role: "assistant", content: [{ type: "text", text: "Vu." }] },
    ];
    const s = scenario([texte("D'accord.")]);
    await lancerEcho("et ça ?", ctx, { appeler: s.appeler, outils: OUTILS_BASE, seul: false, discussion: avant, photo: "WFla" });
    expect(s.recus[0][0].content).toBe("regarde");
    expect(photoDe(s.recus[0][2].content)?.donnee).toBe("WFla");
  });
  it("la forme d'une phrase avec photo est stricte, et la photo ne compte pas dans la taille", () => {
    const ok = [{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: PHOTO } }, { type: "text", text: "x" }];
    expect(phraseDe(ok)).toBe("x");
    expect(phraseDe("y")).toBe("y");
    expect(phraseDe([{ type: "tool_result", tool_use_id: "a", content: "z" }])).toBeNull();
    expect(photoDe([ok[0]])).toBeNull();
    expect(photoDe([{ ...ok[0], source: { type: "url", url: "https://x" } }, ok[1]])).toBeNull();
    expect(photoDe([{ ...ok[0], source: { type: "base64", media_type: "image/png", data: PHOTO } }, ok[1]])).toBeNull();
    expect(photoDe([ok[0], ok[1], ok[1]])).toBeNull();
    const m = [{ role: "user", content: ok }];
    expect(tailleConversation(m)).toBe(JSON.stringify(m).length - PHOTO.length);
  });
});

describe("préparer la photo", () => {
  const fichier = new File(["x"], "p.jpg", { type: "image/jpeg" });
  it("réduit davantage tant qu'elle pèse trop", async () => {
    const vus: number[] = [];
    const reduire = async (_f: File, max = 0) => { vus.push(max); return new Blob([new Uint8Array(max > 1000 ? MAX_PHOTO : 30)], { type: "image/jpeg" }); };
    const d = await preparerPhoto(fichier, reduire);
    expect(vus).toEqual([1400, 1000]);
    expect(d).toBe(btoa("\0".repeat(30)));
  });
  it("refuse une photo que le téléphone n'a pas su ouvrir, ou toujours trop lourde", async () => {
    expect(await preparerPhoto(fichier, async (f) => f.slice(0, 1, "image/heic"))).toBeNull();
    expect(await preparerPhoto(fichier, async (f) => f)).toBeNull(); // rendue telle quelle : jamais envoyée
    expect(await preparerPhoto(fichier, async () => new Blob([new Uint8Array(MAX_PHOTO)], { type: "image/jpeg" }))).toBeNull();
  });
});
