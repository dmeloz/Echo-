// Le journal d'Echo : une ligne par action faite par Echo (quand, à la demande de qui, quoi).
// Il part au foyer comme les autres données (genre « journal »), pour que chacun voie ce qu'Echo a fait.
// par : le prénom de la personne qui a demandé, au moment de la demande (pas une place : il ne bouge pas quand les places s'échangent).

export interface LigneJournal {
  id: string;
  quand: number;
  par: string;
  demande: string; // la phrase écrite à Echo
  action: string;  // ce qu'Echo a fait, en mots simples (« Ajouté : Dentiste, jeudi 15 h »)
  outil: string;
  annule?: number; // quand la personne l'a annulé
}

const txt = (x: unknown, n: number) => (typeof x === "string" ? x.slice(0, n) : "");
const nb = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : null);

export function nettoyerJournal(x: unknown): LigneJournal | null {
  const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
  const id = txt(o.id, 80), quand = nb(o.quand), action = txt(o.action, 200);
  if (!id || quand === null || !action) return null;
  const annule = nb(o.annule);
  return { id, quand, par: txt(o.par, 40), demande: txt(o.demande, 1000), action, outil: txt(o.outil, 40), ...(annule ? { annule } : {}) };
}

// Le journal garde 90 jours.
export const DUREE_JOURNAL = 90 * 86400_000;
