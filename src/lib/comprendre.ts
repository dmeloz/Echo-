import { auJour, sansAccents, z } from "./dates";
import { autre, type Etape, type Niveau, type Personne, type Qui, type Repete } from "./types";

// Comprendre une phrase sans IA : le jour, l'heure, pour qui, la répétition.
// L'assistant IA prendra le relais plus tard, pour les phrases plus libres.
// evt, fin et etapes ne viennent que d'une proposition de l'assistant Echo (pour « Modifier »).
export interface Compris { titre: string; jour: string; heure: string; qui: Qui; repete: Repete; niveau: Niveau | null; evt?: boolean; fin?: string; etapes?: Etape[] }

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const echapperRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function comprendre(texte: string, noms: { moi: string; elle: string }, now = new Date(), proprio: Personne = "moi"): Compris {
  let reste = " " + texte.normalize("NFC") + " ";
  const r: Compris = { titre: "", jour: auJour(0, now), heure: "", qui: proprio, repete: "", niveau: null };
  // On cherche sans accents ; on coupe le même morceau dans le texte d'origine (mêmes positions).
  const trouve = (re: RegExp) => re.exec(sansAccents(reste));
  const couper = (m: RegExpExecArray) => { reste = reste.slice(0, m.index) + " " + reste.slice(m.index + m[0].length); };
  let m: RegExpExecArray | null;

  if ((m = trouve(/\s(tous les jours|chaque jour)\b/))) { r.repete = "jour"; couper(m); }
  else if ((m = trouve(/\s(toutes les (2|deux) semaines|une semaine sur deux)\b/))) { r.repete = "2semaines"; couper(m); }
  else if ((m = trouve(/\s(toutes les semaines|chaque semaine)\b/))) { r.repete = "semaine"; couper(m); }
  else if ((m = trouve(/\s(tous les mois|chaque mois)\b/))) { r.repete = "mois"; couper(m); }
  else if ((m = trouve(/\s(tous les ans|chaque annee)\b/))) { r.repete = "an"; couper(m); }

  if ((m = trouve(/\s(apres[- ]demain)\b/))) { r.jour = auJour(2, now); couper(m); }
  else if ((m = trouve(/\sdemain\b/))) { r.jour = auJour(1, now); couper(m); }
  else if ((m = trouve(/\saujourd'?hui\b/))) { couper(m); }
  else if ((m = trouve(/\s(chaque |tous les |ce |le )?(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)s?( prochain)?\b/))) {
    const cible = JOURS.indexOf(m[2]);
    let n = (cible - now.getDay() + 7) % 7;
    if (m[1] === "chaque " || m[1] === "tous les ") r.repete = "semaine";
    else if (n === 0) n = 7;
    r.jour = auJour(n, now); couper(m);
  }

  if ((m = trouve(/\s(?:a |vers |pour )?(\d{1,2})\s?(?:h(?:eures?)?|:)\s?(\d{2})?(?!\d)/))) {
    const hh = +m[1], mm = +(m[2] || 0);
    if (hh < 24 && mm < 60) { r.heure = `${z(hh)}:${z(mm)}`; couper(m); }
  } else if ((m = trouve(/\s(?:a )?midi\b/))) { r.heure = "12:00"; couper(m); }
  if (!r.heure) {
    if ((m = trouve(/\sce matin\b/))) { r.heure = "09:00"; couper(m); }
    else if ((m = trouve(/\scet apres[- ]midi\b/))) { r.heure = "14:00"; couper(m); }
    else if ((m = trouve(/\sce soir\b/))) { r.heure = "19:00"; couper(m); }
  }

  const elle = echapperRe(sansAccents(noms.elle || "sarah")), moi = echapperRe(sansAccents(noms.moi || "melo"));
  if ((m = trouve(/\s(pour nous|nous deux|tous les deux|ensemble|a deux)\b/))) { r.qui = "nous"; couper(m); }
  else if ((m = trouve(new RegExp(`\\s(pour ${elle})\\b`)))) { r.qui = "elle"; couper(m); }
  else if ((m = trouve(new RegExp(`\\s(pour ${moi})\\b`)))) { r.qui = "moi"; couper(m); }
  else if ((m = trouve(/\s(pour moi)\b/))) { r.qui = proprio; couper(m); }
  else if ((m = trouve(/\s(pour elle|pour lui)\b/))) { r.qui = autre(proprio); couper(m); }

  if ((m = trouve(/\s(urgent|important)\b/))) { r.niveau = 2; couper(m); }
  if (/!\s*$/.test(reste)) { r.niveau = 2; reste = reste.replace(/!+\s*$/, " "); }

  let titre = reste.replace(/\s+/g, " ").replace(/^[\s,.;:-]+|[\s,.;:-]+$/g, "").trim();
  titre = titre.charAt(0).toUpperCase() + titre.slice(1);
  r.titre = titre || texte.trim();
  return r;
}
