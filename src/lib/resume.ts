import { auJour, heureFr, libelleJour, minutes } from "./dates";
import { CODES, type Code } from "./horaires";
import { niveau } from "./importance";
import { autre, type Noms, type Personne, type Tache } from "./types";

// Le résumé du matin : ce que la journée réserve, dit en phrases courtes.
// Fait à partir des vraies tâches du téléphone (rien d'inventé : pas de météo tant qu'on n'a pas de source).

export interface LigneResume { heure?: string; texte: string }
export interface SectionResume { id: "agenda" | "important" | "autre" | "semaine"; titre: string; phrase?: string; lignes: LigneResume[]; dit: string }
export interface Resume { phrase: string; sections: SectionResume[]; texteLu: string }

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

const hh = (h: string) => heureFr(h).replace(/^0/, "");

// travail : le code de travail du jour pour celui qui tient le téléphone (s'il l'a posé dans Mes horaires).
// demain : le résumé du soir. Il raconte la journée de demain (now = demain matin) et parle de « demain ».
export function construireResume(taches: Tache[], noms: Noms, proprio: Personne, now = new Date(), travail?: Code, demain = false): Resume {
  const quand = demain ? "demain" : "aujourd'hui";
  const today = auJour(0, now);
  const lautre = autre(proprio);
  const pourMoi = (t: Tache) => t.qui === proprio || t.qui === "nous";
  // Un événement passé ne traîne pas : seuls ceux d'aujourd'hui comptent.
  const ouvertes = taches.filter((t) => !t.fait && (t.evt ? t.jour === today : t.jour <= today));
  const parHeure = (a: Tache, b: Tache) => minutes(a.heure) - minutes(b.heure);

  const agenda = ouvertes.filter((t) => pourMoi(t) && t.jour === today && t.heure).sort(parHeure);
  const miennes = ouvertes.filter((t) => pourMoi(t) && !t.evt);
  const importantes = miennes.filter((t) => niveau(t, now) === 2);
  // Le soir, ce qui reste d'aujourd'hui n'est pas « en retard » : il est simplement encore là demain.
  const enRetard = miennes.filter((t) => t.jour < (demain ? auJour(-1, now) : today));
  const siennes = ouvertes.filter((t) => t.qui === lautre && t.jour === today);
  const semaine = taches
    .filter((t) => !t.fait && pourMoi(t) && t.jour > today && t.jour <= auJour(6, now))
    .sort((a, b) => a.jour.localeCompare(b.jour) || (a.heure ? minutes(a.heure) : 9999) - (b.heure ? minutes(b.heure) : 9999));

  const sections: SectionResume[] = [];
  const plages = travail && CODES[travail].travail ? CODES[travail].plages : [];
  const lignesAgenda = [
    ...plages.map(([a, b]) => ({ m: minutes(a), heure: hh(a), texte: `Travail jusqu'à ${hh(b)}`, dit: `travail de ${hh(a)} à ${hh(b)}` })),
    ...agenda.map((t) => ({ m: minutes(t.heure), heure: heureFr(t.heure), texte: t.titre + (t.qui === "nous" ? " (à deux)" : ""), dit: `${t.titre} à ${heureFr(t.heure)}` })),
  ].sort((a, b) => a.m - b.m);
  if (lignesAgenda.length) sections.push({
    id: "agenda", titre: demain ? "Ton agenda de demain" : "Ton agenda",
    lignes: lignesAgenda.map(({ heure, texte }) => ({ heure, texte })),
    dit: "Ton agenda : " + lignesAgenda.map((l) => l.dit).join(", ") + ".",
  });
  if (miennes.length) {
    const bouts = [
      importantes.length ? `${importantes.length > 1 ? "Les plus importantes" : "La plus importante"} : ${importantes.slice(0, 3).map((t) => t.titre).join(", ")}.` : "",
      enRetard.length ? `${pluriel(enRetard.length, "chose")} en retard.` : "",
      `${pluriel(miennes.length, "chose")} pour toi ${quand}.`,
    ].filter(Boolean);
    sections.push({ id: "important", titre: "À ne pas oublier", phrase: bouts.join(" "), lignes: [], dit: bouts.join(" ") });
  }
  if (siennes.length) {
    const premiere = [...siennes].sort((a, b) => (a.heure ? minutes(a.heure) : 9999) - (b.heure ? minutes(b.heure) : 9999))[0];
    const p = `${premiere.titre}${premiere.heure ? " à " + heureFr(premiere.heure) : ""}${siennes.length > 1 ? `, et ${siennes.length - 1} autre${siennes.length > 2 ? "s choses" : " chose"}` : ""}.`;
    sections.push({ id: "autre", titre: `${noms[lautre]} ${quand}`, phrase: p, lignes: [], dit: `${noms[lautre]} : ${p}` });
  }
  // Le soir, « now » est demain matin : « demain » voudrait dire après-demain. On écrit alors le nom du jour.
  const nomJour = (j: string) => demain ? new Date(j + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long" }).replace(/^./, (c) => c.toUpperCase()) : libelleJour(j, now);
  if (semaine.length) sections.push({
    id: "semaine", titre: demain ? "Ensuite" : "Cette semaine",
    lignes: semaine.slice(0, 4).map((t) => ({ heure: nomJour(t.jour) + (t.heure ? " " + heureFr(t.heure) : ""), texte: t.titre })),
    dit: (demain ? "Ensuite : " : "Cette semaine : ") + semaine.slice(0, 4).map((t) => `${t.titre}, ${nomJour(t.jour).toLowerCase()}`).join(" ; ") + ".",
  });

  let phrase: string;
  if (!miennes.length && !siennes.length) phrase = `Rien de prévu ${quand}. Profite.`;
  else if (!miennes.length) phrase = `Rien pour toi ${quand}.`;
  else phrase = `${demain ? "Demain, journée" : "Journée"} ${miennes.length <= 3 ? "plutôt calme" : "bien remplie"} : ${pluriel(miennes.length, "chose")} pour toi${agenda.length ? `, dont ${agenda.length} rendez-vous` : ""}${agenda[0] ? `, le premier à ${heureFr(agenda[0].heure)}` : ""}.`;
  if (travail === "VAC") phrase = (demain ? "Demain, tu es en vacances. " : "Tu es en vacances. ") + phrase;
  else if (plages.length) phrase = `${demain ? "Demain, tu travailles" : "Tu travailles"} ${plages.map(([a, b]) => `de ${hh(a)} à ${hh(b)}`).join(" puis ")}. ` + phrase;
  else if (travail && CODES[travail].travail) phrase = `${demain ? "Demain" : "Aujourd'hui"} : ${CODES[travail].libelle.toLowerCase()}. ` + phrase;
  const salut = `${demain ? "Bonsoir" : "Bonjour"} ${noms[proprio]}.`;
  return { phrase, sections, texteLu: [salut, phrase, ...sections.map((s) => s.dit)].join(" ") };
}
