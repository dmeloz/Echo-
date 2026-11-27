import { db } from "../../data/db";
import type { Action, Executant } from "../../lib/echo/outils";
import { autre, type Personne } from "../../lib/types";
import { ajouterCorvees, ajouterPapier, ajouterReparation, faireCorvee, memeNom } from "./actions";
import { DOSSIERS, ETATS_REPARATION, QUOIS, REPETES, aFairePapier, besoin, depuis, devinerDossier, equilibre, joursAvant, nomDossier, nomRythme, parts, pour, quandPapier, texteMontant, trouverCorvees, vraiJour, type Corvee, type QuiCorvee, type Taille } from "./donnees";

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
  voir_papiers: {
    lire: async (_e, ctx) => {
      // Ce qui reste à faire d'abord (le plus proche en tête), puis le reste, les plus récents devant.
      const tous = await db.maison_papiers.toArray();
      const papiers = [...tous.filter(aFairePapier).sort((a, b) => joursAvant(a, ctx.now) - joursAvant(b, ctx.now)), ...tous.filter((p) => !aFairePapier(p)).sort((a, b) => b.cree - a.cree)].slice(0, 80);
      return {
        papiers: papiers.map((p) => ({
          titre: p.titre, dossier: nomDossier(p.dossier), ...(p.emetteur ? { deQui: p.emetteur } : {}), ...(p.note ? { note: p.note } : {}),
          ...(aFairePapier(p) ? { aFaire: QUOIS.find((q) => q.id === p.quoi)!.nom.toLowerCase(), pourLe: p.echeance, quand: quandPapier(p, ctx.now) } : p.fait ? { fait: p.fait } : {}),
          ...(p.montant ? { montant: texteMontant(p.montant) } : {}), ...(p.repete ? { revient: REPETES.find((r) => r.id === p.repete)!.nom.toLowerCase() } : {}),
          ...(p.photos.length ? { photos: p.photos.length } : {}),
        })),
      };
    },
  },
  ranger_papier: {
    preparer: async (e): Promise<Action | string> => {
      const titre = court(e.titre, 100);
      if (!titre) return "Donne un titre au papier.";
      const quoi = QUOIS.find((q) => q.id === e.aFaire)?.id ?? "";
      const echeance = vraiJour(String(e.pourLe)) ? String(e.pourLe) : undefined;
      if (quoi && !echeance) return "Pour une chose à faire, donne une date qui existe (pourLe : AAAA-MM-JJ).";
      const francs = Number(e.montantFrancs);
      const montant = Number.isFinite(francs) && francs > 0 && francs < 1_000_000 ? Math.round(francs * 100) : undefined;
      if ((await db.maison_papiers.toArray()).some((p) => !p.fait && memeNom(p.titre, titre))) return `« ${titre} » est déjà rangé dans les papiers.`;
      const dossier = DOSSIERS.find((d) => d.id === e.dossier)?.id ?? devinerDossier(titre);
      const repete = REPETES.find((r) => r.id === e.revient)?.id ?? "";
      return {
        outil: "ranger_papier", genre: "petit", libelle: `Papier : ${titre}`,
        details: [nomDossier(dossier), quoi ? `${QUOIS.find((q) => q.id === quoi)!.nom.toLowerCase()} pour le ${echeance}` : "", montant ? texteMontant(montant) : ""].filter(Boolean),
        faire: async () => {
          const p = await ajouterPapier({ titre, dossier, quoi, echeance: quoi ? echeance : undefined, montant: quoi === "payer" ? montant : undefined, repete: quoi ? repete : "", emetteur: court(e.deQui, 60), note: court(e.note, 300) }, true);
          if (!p) throw new Error("Papier déjà rangé");
          return () => db.maison_papiers.delete(p.id);
        },
      };
    },
  },
};
