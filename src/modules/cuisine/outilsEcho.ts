import { db } from "../../data/db";
import type { Executant } from "../../lib/echo/outils";
import { ajouterArticles } from "./actions";
import { nomRayon, type Lu } from "./donnees";

// Ce que l'assistant Echo peut faire dans la Cuisine (décrit dans supabase/functions/_shared/echo-outils.ts).
const court = (s: unknown, n: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "");

export const OUTILS_CUISINE: Record<string, Executant> = {
  voir_courses: {
    lire: async () => {
      const reste = (await db.cuisine_courses.toArray()).filter((a) => !a.fait);
      return { articles: reste.map((a) => ({ nom: a.nom, ...(a.qte ? { qte: a.qte } : {}), rayon: nomRayon(a.rayon) })) };
    },
  },
  ajouter_courses: {
    preparer: async (e) => {
      const lus: Lu[] = (Array.isArray(e.articles) ? e.articles : []).slice(0, 30)
        .map((x) => ({ nom: court((x as Lu)?.nom, 60), qte: court((x as Lu)?.qte, 20) }))
        .filter((x) => x.nom);
      if (!lus.length) return "Donne au moins un article (nom).";
      return {
        outil: "ajouter_courses", genre: "petit", libelle: lus.length > 1 ? `Courses : ${lus.length} articles` : `Courses : ${lus[0].nom}`,
        details: lus.length > 1 ? lus.map((l) => (l.qte ? `${l.nom} (${l.qte})` : l.nom)) : lus[0].qte ? [lus[0].qte] : [],
        faire: async () => {
          const ajoutes = await ajouterArticles(lus, true);
          return () => db.cuisine_courses.bulkDelete(ajoutes.map((a) => a.id));
        },
      };
    },
  },
};
