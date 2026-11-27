import { useLiveQuery } from "dexie-react-hooks";
import { House } from "pulsoicon-react";
import { db } from "../../data/db";
import { autre } from "../../lib/types";
import type { ContexteModule } from "../contrat";
import { aFaire, equilibre, pour } from "./donnees";

// La tuile de l'accueil : ce qui est pour toi aujourd'hui.
export function TuileMaison({ noms, proprio, now, aller }: ContexteModule) {
  const d = useLiveQuery(async () => ({ corvees: await db.maison_corvees.toArray(), faits: await db.maison_faits.toArray() }), [], undefined);
  let texte = "Corvées, entretien, papiers";
  if (d?.corvees.length) {
    const e = equilibre(d.faits, now.getTime());
    const dues = d.corvees.filter((c) => aFaire(c, now));
    const miennes = dues.filter((c) => pour(c, e) === proprio), siennes = dues.length - miennes.length;
    texte = miennes.length === 1 ? `Pour toi : ${miennes[0].nom}`
      : miennes.length ? `${miennes.length} pour toi, dont ${miennes[0].nom}`
      : siennes ? `Rien pour toi. ${noms[autre(proprio)]} en a ${siennes}.` : "Tout est fait pour aujourd'hui";
  }
  return (
    <a className="tuile" href="#maison" onClick={(e) => { e.preventDefault(); aller("maison"); }}>
      <span className="tuile-icone" aria-hidden="true"><House size={18} strokeWidth={1.8} animated={false} /></span>
      <b>Maison</b>
      <span>{texte}</span>
    </a>
  );
}
