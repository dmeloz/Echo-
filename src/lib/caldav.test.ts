import { describe, expect, it } from "vitest";
import { creerIcs, depuisZurich, echapperIcs, estCalendrierEvenements, lienDans, lireEvenements, modifierIcs, prop, reponses, texteIcs, versZurich, type Champs } from "../../supabase/functions/icloud/caldav";
import { ecrireEvenement, ErreurApple, type Dav } from "../../supabase/functions/icloud/ecrire";

const ICS = (corps: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${corps}END:VCALENDAR\r\n`;

describe("calendrier iCloud", () => {
  it("passe de l'heure UTC à Zurich, hiver comme été", () => {
    expect(versZurich(Date.UTC(2026, 11, 3, 14, 0))).toEqual({ jour: "2026-12-03", heure: "15:00" });
    expect(versZurich(Date.UTC(2026, 6, 3, 22, 30))).toEqual({ jour: "2026-07-04", heure: "00:30" });
    expect(depuisZurich("2026-12-03", "15:00")).toBe(Date.UTC(2026, 11, 3, 14, 0));
    expect(depuisZurich("2026-07-03", "15:00")).toBe(Date.UTC(2026, 6, 3, 13, 0));
  });

  it("lit les réponses du serveur (préfixes différents, entités)", () => {
    const xml = `<?xml version="1.0"?><multistatus xmlns="DAV:"><response><href>/123/calendars/home/</href><propstat><prop>
      <displayname>Maison &amp; travail</displayname><resourcetype><collection/><calendar xmlns="urn:ietf:params:xml:ns:caldav"/></resourcetype>
      <supported-calendar-component-set xmlns="urn:ietf:params:xml:ns:caldav"><comp name="VEVENT"/></supported-calendar-component-set></prop></propstat></response>
      <D:response xmlns:D="DAV:"><D:href>/123/calendars/rappels/</D:href><D:propstat><D:prop><D:resourcetype><D:collection/><C:calendar xmlns:C="urn:ietf:params:xml:ns:caldav"/></D:resourcetype>
      <C:supported-calendar-component-set xmlns:C="urn:ietf:params:xml:ns:caldav"><C:comp name="VTODO"/></C:supported-calendar-component-set></D:prop></D:propstat></D:response>
      <response><href>/123/calendars/</href><propstat><prop><resourcetype><collection/></resourcetype></prop></propstat></response></multistatus>`;
    const r = reponses(xml);
    expect(r.map((x) => x.href)).toEqual(["/123/calendars/home/", "/123/calendars/rappels/", "/123/calendars/"]);
    expect(r.map((x) => estCalendrierEvenements(x.corps))).toEqual([true, false, false]);
    expect(prop(r[0].corps, "displayname")).toBe("Maison & travail");
    // iCloud écrit parfois les attributs avec des apostrophes.
    expect(estCalendrierEvenements(`<resourcetype><collection/><calendar xmlns='urn:ietf:params:xml:ns:caldav'/></resourcetype><supported-calendar-component-set xmlns='urn:ietf:params:xml:ns:caldav'><comp name='VEVENT'/></supported-calendar-component-set>`)).toBe(true);
    expect(estCalendrierEvenements(`<resourcetype><collection/><calendar xmlns='urn:ietf:params:xml:ns:caldav'/></resourcetype><supported-calendar-component-set><comp name='VTODO'/></supported-calendar-component-set>`)).toBe(false);
    expect(lienDans(`<d:current-user-principal><d:href>/123/principal/</d:href></d:current-user-principal>`, "current-user-principal")).toBe("/123/principal/");
  });

  it("lit un événement à l'heure, une journée entière, plusieurs jours, et ignore les alarmes", () => {
    const evs = lireEvenements(ICS(
      "BEGIN:VEVENT\r\nUID:a1\r\nDTSTART:20261203T140000Z\r\nDTEND:20261203T150000Z\r\nSUMMARY:Dentiste\\, Dr B\r\nDESCRIPTION:Ligne 1\\nLigne 2\r\nBEGIN:VALARM\r\nDESCRIPTION:Alarme\r\nEND:VALARM\r\nEND:VEVENT\r\n" +
      "BEGIN:VEVENT\r\nUID:a2\r\nDTSTART;VALUE=DATE:20261205\r\nDTEND;VALUE=DATE:20261206\r\nSUMMARY:Anniversaire de\r\n  Sarah\r\nEND:VEVENT\r\n" +
      "BEGIN:VEVENT\r\nUID:a3\r\nDTSTART;VALUE=DATE:20261224\r\nDTEND;VALUE=DATE:20261227\r\nSUMMARY:Noël\r\nEND:VEVENT\r\n" +
      "BEGIN:VEVENT\r\nUID:a4\r\nDTSTART;TZID=Europe/Zurich:20261210T190000\r\nDTEND;TZID=Europe/Zurich:20261210T210000\r\nRRULE:FREQ=WEEKLY\r\nSUMMARY:Foot\r\nEND:VEVENT\r\n" +
      "BEGIN:VEVENT\r\nUID:a5\r\nSTATUS:CANCELLED\r\nDTSTART:20261203T140000Z\r\nSUMMARY:Annulé\r\nEND:VEVENT\r\n"));
    expect(evs[0]).toMatchObject({ uid: "a1", titre: "Dentiste, Dr B", note: "Ligne 1\nLigne 2", jour: "2026-12-03", heure: "15:00", fin: "16:00", serie: false, rid: "" });
    expect(evs[1]).toMatchObject({ uid: "a2", titre: "Anniversaire de Sarah", jour: "2026-12-05", heure: "", serie: false });
    expect(evs.filter((e) => e.uid === "a3").map((e) => e.jour)).toEqual(["2026-12-24", "2026-12-25", "2026-12-26"]);
    expect(evs.find((e) => e.uid === "a4")).toMatchObject({ heure: "19:00", fin: "21:00", serie: true, rid: "2026-12-10" });
    expect(evs.some((e) => e.uid === "a5")).toBe(false);
  });

  it("écrit un événement et le relit pareil", () => {
    const ics = creerIcs({ uid: "echo-1", titre: "Resto; avec Sarah", note: "", jour: "2026-12-12", heure: "19:30", fin: "22:00" }, Date.UTC(2026, 10, 26));
    expect(ics).toContain("DTSTART:20261212T183000Z");
    expect(lireEvenements(ics)[0]).toMatchObject({ uid: "echo-1", titre: "Resto; avec Sarah", jour: "2026-12-12", heure: "19:30", fin: "22:00" });
    const journee = creerIcs({ uid: "echo-2", titre: "Congé", note: "", jour: "2026-12-31", heure: "", fin: "" });
    expect(journee).toContain("DTEND;VALUE=DATE:20270101");
  });

  it("change un événement sans perdre le lieu ni l'alarme", () => {
    const avant = ICS("BEGIN:VEVENT\r\nUID:a1\r\nSEQUENCE:2\r\nDTSTART:20261203T140000Z\r\nDTEND:20261203T150000Z\r\nSUMMARY:Dentiste\r\nLOCATION:Lausanne\r\nBEGIN:VALARM\r\nTRIGGER:-PT15M\r\nDESCRIPTION:Rappel\r\nEND:VALARM\r\nEND:VEVENT\r\n");
    const apres = modifierIcs(avant, { uid: "a1", titre: "Dentiste (déplacé)", note: "", jour: "2026-12-04", heure: "09:00", fin: "" });
    expect(apres).toContain("LOCATION:Lausanne");
    expect(apres).toContain("TRIGGER:-PT15M");
    expect(apres).toContain("DESCRIPTION:Rappel");
    expect(apres).toContain("SEQUENCE:3");
    expect(apres).not.toContain("SUMMARY:Dentiste\r\n");
    expect(lireEvenements(apres)[0]).toMatchObject({ titre: "Dentiste (déplacé)", jour: "2026-12-04", heure: "09:00", fin: "10:00" });
  });

  it("10. relit bien une barre oblique inverse dans un titre (suivie d'un n, d'une virgule…)", () => {
    for (const titre of ["C:\\notes", "a\\nb", "Pain, lait; œufs", "ligne 1\nligne 2", "fin\\"]) expect(texteIcs(echapperIcs(titre))).toBe(titre);
    const ics = creerIcs({ uid: "u", titre: "Dossier C:\\nouveau", note: "", jour: "2026-12-03", heure: "", fin: "" });
    expect(lireEvenements(ics)[0].titre).toBe("Dossier C:\\nouveau");
  });
});

// Un faux iCloud : les fichiers par adresse, et le journal des requêtes.
function fauxIcloud(fichiers: Record<string, string> = {}) {
  const journal: string[] = [];
  const dav: Dav = async (methode, url, corps, plus) => {
    journal.push(`${methode} ${url.split("/").pop()}${plus?.["If-None-Match"] ? " (si absent)" : ""}`);
    if (methode === "GET") return { status: url in fichiers ? 200 : 404, ok: url in fichiers, etag: "", texte: async () => fichiers[url] ?? "" };
    if (plus?.["If-None-Match"] === "*" && url in fichiers) return { status: 412, ok: false, etag: "", texte: async () => "" };
    fichiers[url] = corps ?? "";
    return { status: 201, ok: true, etag: '"e"', texte: async () => "" };
  };
  return { dav, fichiers, journal };
}

describe("écrire dans iCloud", () => {
  const CAL = "https://p1-caldav.icloud.com/1/calendars/home/";
  const c: Champs = { uid: "abc", titre: "Dentiste", note: "", jour: "2026-12-03", heure: "15:00", fin: "16:00" };
  const cal = () => Promise.resolve(CAL);

  it("4. une création dont la réponse s'est perdue ne bloque pas : au nouvel essai, l'événement déjà là est mis à jour", async () => {
    const ic = fauxIcloud();
    // Premier essai : iCloud crée l'événement, mais le téléphone ne reçoit jamais la réponse (il ne connaît pas l'adresse).
    await ecrireEvenement(ic.dav, c, "", cal);
    // Il réessaie, toujours sans adresse, avec un titre changé entre-temps.
    const r = await ecrireEvenement(ic.dav, { ...c, titre: "Dentiste (rappel)" }, "", cal);
    expect(r.href).toBe(CAL + "abc.ics");
    expect(lireEvenements(ic.fichiers[r.href]).map((e) => e.titre)).toEqual(["Dentiste (rappel)"]);
    expect(ic.journal).toEqual(["PUT abc.ics (si absent)", "PUT abc.ics (si absent)", "GET abc.ics", "PUT abc.ics"]);
  });

  it("change un événement à son adresse, et le recrée s'il n'y est plus", async () => {
    const ic = fauxIcloud();
    const { href } = await ecrireEvenement(ic.dav, c, "", cal);
    await ecrireEvenement(ic.dav, { ...c, heure: "17:00", fin: "18:00" }, href, () => Promise.reject(new Error("pas besoin du calendrier")));
    expect(lireEvenements(ic.fichiers[href])[0]).toMatchObject({ heure: "17:00", fin: "18:00" });
    delete ic.fichiers[href];
    expect((await ecrireEvenement(ic.dav, c, href, cal)).href).toBe(href);
    expect(href in ic.fichiers).toBe(true);
  });

  it("une vraie erreur d'iCloud reste une erreur", async () => {
    const dav: Dav = async () => ({ status: 507, ok: false, etag: "", texte: async () => "" });
    await expect(ecrireEvenement(dav, c, "", cal)).rejects.toBeInstanceOf(ErreurApple);
  });
});
