export type Qui = "moi" | "elle" | "nous";
export type Niveau = 0 | 1 | 2; // 0 = plus tard, 1 = normal, 2 = important
export type Repete = "" | "jour" | "semaine";

export interface Tache {
  id: string;
  titre: string;
  qui: Qui;
  jour: string; // AAAA-MM-JJ
  heure: string; // HH:MM ou ""
  niveau: Niveau | null; // null = proposé par l'app
  repete: Repete;
  note: string;
  fait: number | null;
  faitLe: string | null;
  suite?: string | null; // id de la prochaine occurrence créée en cochant
  cree: number;
  ex?: boolean; // tâche d'exemple
}

export interface Noms { moi: string; elle: string }
