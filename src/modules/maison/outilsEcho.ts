import { db } from "../../data/db";
import type { Action, Executant } from "../../lib/echo/outils";
import { autre, type Personne } from "../../lib/types";
import { ajouterCorvees, ajouterReparation, faireCorvee, memeNom } from "./actions";
import { ETATS_REPARATION, besoin, depuis, equilibre, nomRythme, parts, pour, trouverCorvees, type Corvee, type QuiCorvee, type Taille } from "./donnees";

// Ce que l'assistant Echo peut faire dans la Maison (décrit dans supabase/functions/_shared/echo-outils.ts).
const court = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");
const ETATS = ["", "peut attendre", "bientôt", "à faire aujourd'hui"];
const TAILLES: Record<string, Taille> = { vite: 1, moyen: 2, gros: 3 };
const QUIS: QuiCorvee[] = ["moi", "elle", "libre"];

export const OUTILS_MAISON: Record<string, Executant> = {
  voir_maison: {
    lire: async (_e, ctx) => {
      const corvees = await db.maison_corvees.toArray();
      const e = equilibre(await db.maison_faits.toArray(), ctx.now.getTime()), p = parts(e);
      return {
        corvees: corvees.map((c) => ({
          nom: c.nom, ...(c.entretien ? { entretien: true } : {}), ...(c.piece ? { piece: c.piece } : {}), etat: ETATS[besoin(c, ctx.now)], pour: pour(c) ? ctx.noms[pour(c)!] : "libre (celui qui la fait)", revient: nomRythme(c.tous).toLowerCase(),
          ...(c.fait ? { derniereFois: [depuis(c, ctx.now), c.par ? `par ${ctx.noms[c.par]}` : ""].filter(Boolean).join(" ") } : {}),
        })),
        aReparer: (await db.maison_reparations.toArray()).filter((r) => r.etat < 3).map((r) => ({ nom: r.nom, etat: ETATS_REPARATION[r.etat - 1].nom.toLowerCase(), ...(r.note ? { note: r.note } : {}) })),
        equilibreSur4Semaines: e.moi + e.elle ? { [ctx.noms.moi]: `${p.moi} %`, [ctx.noms.elle]: `${p.elle} %` } : "rien de noté encore",
      };
    },
  },
  corvee_faite: {
    preparer: async (e, ctx): Promise<Action | string> => {
      const dits = (Array.isArray(e.corvees) ? e.corvees : []).map((x) => court(x, 80)).filter(Boolean).slice(0, 10);
      const toutes = await db.maison_corvees.toArray();
      const trouvees: Corvee[] = [];
      for (const d of dits) {
        const c = trouverCorvees(d, toutes)[0];
        if (!c) return `Pas de corvée « ${d} » dans la liste. Regarde les noms avec voir_maison.`;
        if (!trouvees.includes(c)) trouvees.push(c);
      }
      if (!trouvees.length) return "Donne au moins une corvée.";
      const par: Personne = e.par === "moi" || e.par === "elle" ? e.par : ctx.proprio;
      return {
        // Cocher à la place de l'autre : toujours demandé.
        outil: "corvee_faite", genre: par === autre(ctx.proprio) ? "gros" : "petit",
        libelle: `Fait : ${trouvees.map((c) => c.nom).join(", ")}`, details: [`par ${ctx.noms[par]}`],
        faire: async () => {
          const defaire: Array<(() => Promise<void>) | null> = [];
          for (const c of trouvees) defaire.push(await faireCorvee(c.id, par));
          return async () => { for (const d of defaire.reverse()) await d?.(); };
        },
      };
    },
  },
  ajouter_corvee: {
    preparer: async (e): Promise<Action | string> => {
      const nom = court(e.nom, 80), tous = Number(e.tousLesJours);
      if (!nom) return "Donne le nom de la corvée.";
      if (!Number.isInteger(tous) || tous < 1 || tous > 365) return "tousLesJours : un nombre de jours entre 1 et 365.";
      if ((await db.maison_corvees.toArray()).some((c) => memeNom(c.nom, nom))) return `« ${nom} » est déjà dans les corvées.`;
      const qui = QUIS.find((q) => q === e.qui) ?? "libre";
      return {
        outil: "ajouter_corvee", genre: "petit", libelle: `Corvée : ${nom}`, details: [nomRythme(tous).toLowerCase()],
        faire: async () => {
          const ajoutees = await ajouterCorvees([{ nom: nom[0].toUpperCase() + nom.slice(1), tous, taille: TAILLES[String(e.taille)] ?? 2, qui, piece: court(e.piece, 30) }], true);
          if (!ajoutees.length) throw new Error("Corvée déjà dans la liste");
          return () => db.maison_corvees.bulkDelete(ajoutees.map((c) => c.id));
        },
      };
    },
  },
  noter_reparation: {
    preparer: async (e): Promise<Action | string> => {
      const nom = court(e.nom, 80), note = court(e.note, 200);
      if (!nom) return "Dis ce qui est cassé.";
      if ((await db.maison_reparations.toArray()).some((r) => r.etat < 3 && memeNom(r.nom, nom))) return `« ${nom} » est déjà noté dans les réparations.`;
      return {
        outil: "noter_reparation", genre: "petit", libelle: `À réparer : ${nom}`, details: note ? [note] : [],
        faire: async () => {
          const r = await ajouterReparation(nom, { note }, true);
          if (!r) throw new Error("Réparation déjà notée");
          return () => db.maison_reparations.delete(r.id);
        },
      };
    },
  },
};
