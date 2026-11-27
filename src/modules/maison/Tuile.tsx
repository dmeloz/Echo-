import { useLiveQuery } from "dexie-react-hooks";
import { House } from "pulsoicon-react";
import { db } from "../../data/db";
import { autre } from "../../lib/types";
import type { ContexteModule } from "../contrat";
import { aFaire, pourMoi } from "./donnees";

// La tuile de l'accueil : ce qui est pour toi aujourd'hui.
export function TuileMaison({ noms, proprio, now, aller }: ContexteModule) {
  const d = useLiveQuery(async () => ({ corvees: await db.maison_corvees.toArray(), cassees: await db.maison_reparations.filter((r) => r.etat < 3).count() }), [], undefined);
  let texte = "Corvées, entretien, papiers";
  if (d?.corvees.length) {
    const dues = d.corvees.filter((c) => aFaire(c, now));
    const miennes = dues.filter((c) => pourMoi(c, proprio)), siennes = dues.length - miennes.length;
    texte = miennes.length === 1 ? `Pour toi : ${miennes[0].nom}`
      : miennes.length ? `${miennes.length} pour toi, dont ${miennes[0].nom}`
      : siennes ? `Rien pour toi. ${noms[autre(proprio)]} en a ${siennes}.` : "Tout est fait pour aujourd'hui";
  }
  if (d?.cassees && (!d.corvees.length || texte.startsWith("Tout est fait"))) texte = d.cassees > 1 ? `${d.cassees} réparations à suivre` : "1 réparation à suivre";
  return (
    <a className="tuile" href="#maison" onClick={(e) => { e.preventDefault(); aller("maison"); }}>
      <span className="tuile-icone" aria-hidden="true"><House size={18} strokeWidth={1.8} animated={false} /></span>
      <b>Maison</b>
      <span>{texte}</span>
    </a>
  );
}
