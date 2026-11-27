// Les petits outils du calendrier iCloud (CalDAV), sans réseau : lire les réponses XML,
// lire et écrire les événements (.ics), passer de l'heure UTC à l'heure de Zurich.
// Testés à part (src/lib/caldav.test.ts).

export const FUSEAU = "Europe/Zurich";

export interface Evenement {
  uid: string;
  rid: string; // date de l'occurrence pour un événement répété ou sur plusieurs jours, sinon ""
  titre: string;
  note: string;
  jour: string; // AAAA-MM-JJ (heure de Zurich)
  heure: string; // HH:MM ou "" (toute la journée)
  fin: string; // HH:MM ou ""
  serie: boolean; // occurrence d'une série ou d'un événement sur plusieurs jours : on ne la change pas depuis Echo
}

/* ---------- XML (réponses « multistatus ») ---------- */

const ENTITES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
export const decoderXml = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITES[e] ?? m);
const balise = (nom: string) => new RegExp(`<(?:[\\w-]+:)?${nom}\\b[^>]*?(?:/>|>([\\s\\S]*?)</(?:[\\w-]+:)?${nom}>)`, "i");

export interface Reponse { href: string; corps: string }
export function reponses(xml: string): Reponse[] {
  const out: Reponse[] = [];
  const re = /<(?:[\w-]+:)?response\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?response>/gi;
  for (let m; (m = re.exec(xml)); ) {
    const href = m[1].match(balise("href"))?.[1];
    if (href) out.push({ href: decoderXml(href.trim()), corps: m[1] });
  }
  return out;
}
// Le contenu d'une propriété (« displayname », « calendar-data »…), ou null si elle est absente.
export function prop(corps: string, nom: string): string | null {
  const m = corps.match(balise(nom));
  return m ? decoderXml(m[1] ?? "").trim() : null;
}
// Le premier lien <href> à l'intérieur d'une propriété (current-user-principal, calendar-home-set).
export function lienDans(xml: string, nom: string): string | null {
  const m = xml.match(balise(nom));
  const h = m?.[1]?.match(balise("href"))?.[1];
  return h ? decoderXml(h.trim()) : null;
}
export const estCalendrierEvenements = (corps: string) => {
  const type = corps.match(balise("resourcetype"))?.[1] ?? "";
  if (!/<(?:[\w-]+:)?calendar\b/i.test(type)) return false;
  const comps = corps.match(balise("supported-calendar-component-set"))?.[1];
  return !comps || /name=["']VEVENT["']/i.test(comps);
};

/* ---------- Heures ---------- */

const deux = (n: number) => String(n).padStart(2, "0");
// Décalage (en minutes) de Zurich par rapport à UTC à un instant donné.
function decalage(utc: number): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: FUSEAU, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(utc)).map((x) => [x.type, x.value]));
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - Math.floor(utc / 60000) * 60000) / 60000;
}
// Un instant UTC → jour et heure à Zurich.
export function versZurich(utc: number): { jour: string; heure: string } {
  const d = new Date(utc + decalage(utc) * 60000);
  return { jour: `${d.getUTCFullYear()}-${deux(d.getUTCMonth() + 1)}-${deux(d.getUTCDate())}`, heure: `${deux(d.getUTCHours())}:${deux(d.getUTCMinutes())}` };
}
// Jour et heure à Zurich → instant UTC.
export function depuisZurich(jour: string, heure: string): number {
  const [a, mo, j] = jour.split("-").map(Number);
  const [h, mi] = (heure || "00:00").split(":").map(Number);
  const naif = Date.UTC(a, mo - 1, j, h, mi);
  let utc = naif - decalage(naif) * 60000;
  utc = naif - decalage(utc) * 60000; // une deuxième fois pour les jours de changement d'heure
  return utc;
}
export const formatUtc = (utc: number) => new Date(utc).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dateIcs = (jour: string) => jour.replace(/-/g, "");
const jourIcs = (v: string) => `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
const plusJours = (jour: string, n: number) => {
  const d = new Date(jour + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/* ---------- ICS ---------- */

interface Ligne { nom: string; params: Record<string, string>; valeur: string }
const deplier = (ics: string) => ics.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n").filter(Boolean);
function lireLigne(l: string): Ligne {
  const i = l.search(/:(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  const tete = l.slice(0, i), valeur = l.slice(i + 1);
  const [nom, ...ps] = tete.split(";");
  const params: Record<string, string> = {};
  for (const p of ps) { const [k, v = ""] = p.split("="); params[k.toUpperCase()] = v.replace(/^"|"$/g, ""); }
  return { nom: nom.toUpperCase(), params, valeur };
}
const texteIcs = (v: string) => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
export const echapperIcs = (v: string) => v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");

// Une date de l'ics → jour + heure à Zurich (heure "" pour une journée entière).
function moment(l: Ligne): { jour: string; heure: string } {
  const v = l.valeur.trim();
  if (l.params.VALUE === "DATE" || /^\d{8}$/.test(v)) return { jour: jourIcs(v), heure: "" };
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  if (!m) return { jour: "", heure: "" };
  if (v.endsWith("Z")) return versZurich(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  // Heure locale (avec ou sans TZID) : on la prend telle quelle, comme une heure de Zurich.
  return { jour: `${m[1]}-${m[2]}-${m[3]}`, heure: `${m[4]}:${m[5]}` };
}

// Tous les événements d'un fichier .ics (ou de plusieurs occurrences déjà « dépliées » par le serveur).
// Un événement sur plusieurs jours devient une ligne par jour (au plus 14).
export function lireEvenements(ics: string): Evenement[] {
  const out: Evenement[] = [];
  let ev: Ligne[] | null = null;
  for (const brut of deplier(ics)) {
    if (/^BEGIN:VEVENT$/i.test(brut)) { ev = []; continue; }
    if (/^END:VEVENT$/i.test(brut)) {
      if (ev) out.push(...versEvenements(ev));
      ev = null;
      continue;
    }
    if (ev && /^BEGIN:/i.test(brut)) { ev.push({ nom: "#IGNORE", params: {}, valeur: brut }); continue; } // VALARM…
    if (ev) ev.push(lireLigne(brut));
  }
  return out;
}

function versEvenements(lignes: Ligne[]): Evenement[] {
  // Les propriétés des blocs intérieurs (alarmes) sont ignorées.
  const props: Ligne[] = [];
  let profondeur = 0;
  for (const l of lignes) {
    if (l.nom === "#IGNORE") { profondeur++; continue; }
    if (profondeur && /^END$/i.test(l.nom)) { profondeur--; continue; }
    if (!profondeur) props.push(l);
  }
  const p = (n: string) => props.find((l) => l.nom === n);
  const uid = p("UID")?.valeur.trim();
  const dt = p("DTSTART");
  if (!uid || !dt) return [];
  if (/^CANCELLED$/i.test(p("STATUS")?.valeur ?? "")) return [];
  const debut = moment(dt);
  if (!debut.jour) return [];
  const de = p("DTEND");
  const fin = de ? moment(de) : null;
  const repete = !!p("RRULE") || !!p("RECURRENCE-ID");
  const base = { uid, titre: texteIcs(p("SUMMARY")?.valeur ?? "").trim() || "Sans titre", note: texteIcs(p("DESCRIPTION")?.valeur ?? "").slice(0, 1000) };

  // Plusieurs jours : une ligne par jour (la fin d'une journée entière est exclue).
  const dernier = fin?.jour ? (debut.heure ? fin.jour : plusJours(fin.jour, -1)) : debut.jour;
  if (dernier > debut.jour) {
    const jours: string[] = [];
    for (let j = debut.jour; j <= dernier && jours.length < 14; j = plusJours(j, 1)) jours.push(j);
    return jours.map((j, i) => ({
      ...base, rid: j, jour: j, serie: true,
      heure: debut.heure && i === 0 ? debut.heure : "",
      fin: debut.heure && j === dernier ? fin!.heure : "",
    }));
  }
  const rid = repete ? debut.jour : "";
  return [{ ...base, rid, jour: debut.jour, heure: debut.heure, fin: debut.heure && fin?.jour === debut.jour ? fin.heure : "", serie: repete }];
}

export interface Champs { uid: string; titre: string; note: string; jour: string; heure: string; fin: string }

// Les lignes DTSTART / DTEND d'un événement d'Echo (en UTC ; journée entière si pas d'heure).
function lignesDates(c: Champs): string[] {
  if (!c.heure) return [`DTSTART;VALUE=DATE:${dateIcs(c.jour)}`, `DTEND;VALUE=DATE:${dateIcs(plusJours(c.jour, 1))}`];
  const debut = depuisZurich(c.jour, c.heure);
  const fin = c.fin && c.fin > c.heure ? depuisZurich(c.jour, c.fin) : debut + 60 * 60000;
  return [`DTSTART:${formatUtc(debut)}`, `DTEND:${formatUtc(fin)}`];
}
const plier = (l: string) => {
  const morceaux: string[] = [];
  let reste = l;
  while (reste.length > 74) { morceaux.push(reste.slice(0, 74)); reste = reste.slice(74); }
  morceaux.push(reste);
  return morceaux.join("\r\n ");
};

// Un nouvel événement, tel qu'Echo l'envoie à iCloud.
export function creerIcs(c: Champs, maintenant = Date.now()): string {
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Echo//Agenda//FR", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:${c.uid}`, `DTSTAMP:${formatUtc(maintenant)}`, ...lignesDates(c),
    `SUMMARY:${echapperIcs(c.titre)}`, ...(c.note ? [`DESCRIPTION:${echapperIcs(c.note)}`] : []),
    "END:VEVENT", "END:VCALENDAR", "",
  ].map(plier).join("\r\n");
}

// Changer un événement existant sans perdre le reste (lieu, alarmes, invités) :
// on remplace seulement le titre, la note et les dates du premier VEVENT.
export function modifierIcs(ics: string, c: Champs, maintenant = Date.now()): string {
  const lignes = ics.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const out: string[] = [];
  let dans = false, fait = false, profondeur = 0;
  const NOMS = /^(DTSTART|DTEND|DURATION|SUMMARY|DESCRIPTION|DTSTAMP|LAST-MODIFIED|SEQUENCE)[;:]/i;
  let sequence = 0;
  for (const l of lignes) {
    if (!fait && /^BEGIN:VEVENT$/i.test(l)) { dans = true; out.push(l); continue; }
    if (dans && /^BEGIN:/i.test(l)) profondeur++;
    if (dans && profondeur && /^END:/i.test(l)) { profondeur--; out.push(l); continue; }
    if (dans && !profondeur && /^END:VEVENT$/i.test(l)) {
      out.push(...lignesDates(c), `SUMMARY:${echapperIcs(c.titre)}`, ...(c.note ? [`DESCRIPTION:${echapperIcs(c.note)}`] : []),
        `DTSTAMP:${formatUtc(maintenant)}`, `LAST-MODIFIED:${formatUtc(maintenant)}`, `SEQUENCE:${sequence + 1}`, l);
      dans = false; fait = true;
      continue;
    }
    if (dans && !profondeur && NOMS.test(l)) {
      if (/^SEQUENCE[;:]/i.test(l)) sequence = parseInt(l.split(":")[1], 10) || 0;
      continue;
    }
    if (l) out.push(l);
  }
  return out.map(plier).join("\r\n") + "\r\n";
}
