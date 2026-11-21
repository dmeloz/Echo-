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
  etapes?: Etape[]; // sous-tâches
  photos?: string[]; // ids dans la table photos
}

export interface Noms { moi: string; elle: string }

// « moi » = Melo et « elle » = Sarah, quel que soit le téléphone.
// Le propriétaire du téléphone est choisi au premier lancement.
export type Personne = "moi" | "elle";
export const autre = (p: Personne): Personne => (p === "moi" ? "elle" : "moi");

export interface Etape { id: string; texte: string; fait: boolean }
