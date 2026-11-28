// Un faux serveur d'Echo pour les tests de la synchro : la table « elements » en mémoire, avec ce qu'il faut
// du client Supabase (lire avec des filtres, écrire par lots, appels de fonctions, session). Rien ne part sur le réseau.

export interface LigneServeur { foyer_id: string; genre: string; cle: string; data: unknown; supprime: boolean; par: string | null; maj: string }
type Rep = { data: unknown; error: { message: string; code?: string } | null; status: number };

export function fauxServeur() {
  let horloge = Date.parse("2026-11-27T10:00:00Z");
  const etat = {
    elements: [] as LigneServeur[],
    membres: [] as Array<{ foyer_id: string; user_id: string; prenom: string; place: string }>,
    abonnements: [] as Array<Record<string, unknown>>,
    user: "moi-1",
    panne: false as boolean | ((quoi: string) => boolean), // le réseau ne répond pas (toujours, ou pour certains appels : « lire:elements »)
    refuser: (_l: LigneServeur) => false, // le serveur refuse cette ligne (règle de la table)
    rpc: {} as Record<string, (args: Record<string, unknown>) => unknown>,
    appels: [] as string[], // le journal des appels, pour les tests
    juste_avant_ecriture: null as (() => void) | null, // appelé une fois, juste avant la prochaine écriture (un autre téléphone écrit entre-temps)
    // Poser une ligne comme si un autre téléphone l'avait envoyée.
    poser(genre: string, cle: string, data: unknown, par = "autre-1", supprime = false) {
      const l: LigneServeur = { foyer_id: "F", genre, cle, data: supprime ? null : data, supprime, par, maj: new Date(++horloge).toISOString() };
      const i = etat.elements.findIndex((x) => x.genre === genre && x.cle === cle);
      if (i < 0) etat.elements.push(l); else etat.elements[i] = l;
    },
    lire: (genre: string, cle: string) => etat.elements.find((x) => x.genre === genre && x.cle === cle),
  };
  const enPanne = (quoi: string) => (typeof etat.panne === "function" ? etat.panne(quoi) : etat.panne);
  const PANNE: Rep = { data: null, error: { message: "TypeError: Failed to fetch" }, status: 0 };

  class Requete implements PromiseLike<Rep> {
    private filtres: Array<(l: Record<string, unknown>) => boolean> = [];
    private tris: string[] = [];
    private de = 0;
    private nb = Infinity;
    private ecriture: LigneServeur[] | null = null;
    private changement: Partial<LigneServeur> | null = null;
    private un = false;
    private table: string;
    constructor(table: string) { this.table = table; }
    select() { return this; }
    eq(c: string, v: unknown) { this.filtres.push((l) => l[c] === v); return this; }
    in(c: string, vs: unknown[]) { this.filtres.push((l) => vs.includes(l[c])); return this; }
    gt(c: string, v: string) { this.filtres.push((l) => String(l[c]) > v); return this; }
    order(c: string) { this.tris.push(c); return this; }
    limit(n: number) { this.nb = n; return this; }
    range(a: number, b: number) { this.de = a; this.nb = b - a + 1; return this; }
    single() { this.un = true; return this; }
    upsert(lignes: LigneServeur[] | Record<string, unknown>) { this.ecriture = (Array.isArray(lignes) ? lignes : [lignes]) as LigneServeur[]; return this; }
    update(v: Partial<LigneServeur>) { this.changement = v; return this; }
    private faire(): Rep {
      const quoi = `${this.ecriture ? "ecrire" : this.changement ? "changer" : "lire"}:${this.table}`;
      etat.appels.push(quoi);
      if (enPanne(quoi)) return PANNE;
      if (this.ecriture || this.changement) { const f = etat.juste_avant_ecriture; etat.juste_avant_ecriture = null; f?.(); }
      if (this.changement) {
        const visees = etat.elements.filter((l) => this.filtres.every((f) => f(l as unknown as Record<string, unknown>)));
        if (visees.some((l) => etat.refuser({ ...l, ...this.changement }))) return { data: null, error: { message: "new row violates check constraint", code: "23514" }, status: 400 };
        for (const l of visees) etat.poser(l.genre, l.cle, this.changement.data, etat.user, !!this.changement.supprime);
        return { data: visees.map((l) => ({ cle: l.cle })), error: null, status: 200 };
      }
      if (this.ecriture) {
        if (this.table === "abonnements") { etat.abonnements.push(...this.ecriture as unknown as Array<Record<string, unknown>>); return { data: null, error: null, status: 201 }; }
        if (this.ecriture.some((l) => etat.refuser(l))) return { data: null, error: { message: "new row violates check constraint", code: "23514" }, status: 400 };
        for (const l of this.ecriture) etat.poser(l.genre, l.cle, l.data, etat.user, l.supprime);
        return { data: null, error: null, status: 201 };
      }
      const source = (this.table === "elements" ? etat.elements : this.table === "membres" ? etat.membres : []) as unknown as Array<Record<string, unknown>>;
      let lignes = source.filter((l) => this.filtres.every((f) => f(l)));
      for (const c of [...this.tris].reverse()) lignes = [...lignes].sort((a, b) => String(a[c]).localeCompare(String(b[c])));
      lignes = lignes.slice(this.de, this.de + this.nb);
      return { data: this.un ? lignes[0] ?? null : lignes, error: null, status: 200 };
    }
    then<A = Rep, B = never>(ok?: ((v: Rep) => A | PromiseLike<A>) | null, ko?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
      return Promise.resolve().then(() => this.faire()).then(ok, ko);
    }
  }

  const canal = { on: () => canal, subscribe: () => canal };
  const supa = {
    from: (table: string) => new Requete(table),
    rpc: (nom: string, args: Record<string, unknown> = {}) => {
      etat.appels.push("rpc:" + nom);
      if (enPanne("rpc:" + nom)) return Promise.resolve(PANNE);
      return Promise.resolve({ data: etat.rpc[nom]?.(args) ?? null, error: null, status: 200 });
    },
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: etat.user }, access_token: "x" } } }),
      signInAnonymously: () => Promise.resolve({ data: { user: { id: etat.user } }, error: null }),
    },
    channel: () => canal,
    removeChannel: () => undefined,
  };
  return { etat, supa };
}
