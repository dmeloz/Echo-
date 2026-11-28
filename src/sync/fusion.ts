// La fusion champ par champ : quand les deux ont changé la même ligne chacun de son côté,
// on garde les changements des deux. On compare à « la base » : la ligne telle que les deux la connaissaient avant.
// Un champ changé d'un seul côté prend ce changement. Changé des deux côtés, différemment : celui d'ici gagne, et on le dit.

type Obj = Record<string, unknown>;
const estObjet = (x: unknown): x is Obj => !!x && typeof x === "object" && !Array.isArray(x);

// Deux valeurs pareilles ? (un champ absent et un champ « undefined », c'est pareil)
export function pareil(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => pareil(x, b[i]));
  }
  if (!estObjet(a) || !estObjet(b)) return false;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (!pareil(a[k], b[k])) return false;
  return true;
}

// Une liste de choses qui ont chacune un id (les étapes d'une tâche) : elle se fusionne élément par élément.
function parId(x: unknown): Map<string, Obj> | null {
  if (x === undefined || x === null) return new Map();
  if (!Array.isArray(x)) return null;
  const m = new Map<string, Obj>();
  for (const e of x) {
    if (!estObjet(e) || typeof e.id !== "string" || m.has(e.id)) return null;
    m.set(e.id, e);
  }
  return m;
}

function fusionnerListe(b: Map<string, Obj>, i: Map<string, Obj>, l: Map<string, Obj>): { liste: Obj[]; conflit: boolean } {
  const liste: Obj[] = [];
  let conflit = false;
  for (const [id, ici] of i) {
    const la = l.get(id), base = b.get(id);
    if (la) {
      const f = fusionner3(base ?? {}, ici, la);
      if (f.conflits.length) conflit = true;
      liste.push(f.resultat);
    } else if (!base || !pareil(ici, base)) liste.push(ici); // ajouté ici, ou changé ici pendant que l'autre le retirait : gardé
  }
  for (const [id, la] of l) {
    if (i.has(id)) continue;
    const base = b.get(id);
    if (!base || !pareil(la, base)) liste.push(la); // ajouté par l'autre, ou changé par l'autre pendant qu'on le retirait ici
  }
  return { liste, conflit };
}

// base : la ligne avant les deux changements. ici : la ligne de ce téléphone. la : la ligne du foyer.
// conflits : les champs que les deux ont changés différemment (la valeur d'ici est gardée).
export function fusionner3(base: Obj, ici: Obj, la: Obj): { resultat: Obj; conflits: string[] } {
  const resultat: Obj = {};
  const conflits: string[] = [];
  for (const k of new Set([...Object.keys(base), ...Object.keys(ici), ...Object.keys(la)])) {
    const b = base[k], i = ici[k], l = la[k];
    let v: unknown;
    if (pareil(i, l) || pareil(l, b)) v = i;
    else if (pareil(i, b)) v = l;
    else {
      const lb = parId(b), li = parId(i), ll = parId(l);
      if (lb && li && ll && (Array.isArray(i) || Array.isArray(l))) {
        const f = fusionnerListe(lb, li, ll);
        v = f.liste.length ? f.liste : undefined;
        if (f.conflit) conflits.push(k);
      } else { v = i; conflits.push(k); }
    }
    if (v !== undefined) resultat[k] = v;
  }
  return { resultat, conflits };
}
