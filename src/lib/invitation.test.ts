import { describe, expect, it } from "vitest";
import { codeDuLien, dansSafariIos, lienInvitation } from "./invitation";

const nav = (userAgent: string, maxTouchPoints = 0, standalone?: boolean) => ({ userAgent, maxTouchPoints, standalone }) as unknown as Navigator;
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";

describe("le lien d'invitation", () => {
  it("porte le code dans le # de l'adresse d'Echo, sans le reste de l'adresse", () => {
    expect(lienInvitation("123456", "https://exemple.github.io/Echo-/#reglages")).toBe("https://exemple.github.io/Echo-/#rejoindre=123456");
    expect(lienInvitation("123456", "https://exemple.github.io/Echo-/?x=1")).toBe("https://exemple.github.io/Echo-/#rejoindre=123456");
  });
  it("se relit : le code, et rien d'autre", () => {
    expect(codeDuLien("#rejoindre=123456")).toBe("123456");
    expect(codeDuLien(new URL(lienInvitation("654321", "https://exemple.github.io/Echo-/")).hash)).toBe("654321");
    expect(codeDuLien("#reglages")).toBeNull();
    expect(codeDuLien("#rejoindre=12345")).toBeNull();
    expect(codeDuLien("#rejoindre=1234567")).toBeNull();
    expect(codeDuLien("#rejoindre=12a456")).toBeNull();
  });
});

describe("Safari sur iPhone ou iPad", () => {
  it("dans Safari : il faut d'abord installer Echo", () => {
    expect(dansSafariIos(nav(IPHONE), false)).toBe(true);
    expect(dansSafariIos(nav(MAC, 5), false)).toBe(true); // un iPad se présente comme un Mac, mais tactile
  });
  it("depuis l'écran d'accueil, ou sur un ordinateur : on rejoint tout de suite", () => {
    expect(dansSafariIos(nav(IPHONE), true)).toBe(false);
    expect(dansSafariIos(nav(IPHONE, 5, true), false)).toBe(false);
    expect(dansSafariIos(nav(MAC, 0), false)).toBe(false);
  });
});
