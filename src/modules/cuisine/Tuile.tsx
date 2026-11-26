import { useLiveQuery } from "dexie-react-hooks";
import { ShoppingBasket } from "pulsoicon-react";
import { db } from "../../data/db";
import { auJour } from "../../lib/dates";
import type { ContexteModule } from "../contrat";

// La tuile de l'accueil change selon le moment : les courses s'il en reste, sinon le repas de ce soir.
export function TuileCuisine({ now, aller }: ContexteModule) {
  const today = auJour(0, now);
  const d = useLiveQuery(async () => ({
    reste: (await db.cuisine_courses.toArray()).filter((a) => !a.fait).length,
    soir: (await db.cuisine_repas.get(today))?.plat ?? "",
  }), [today], { reste: 0, soir: "" });
  const courses = d.reste ? `Courses : ${d.reste} article${d.reste > 1 ? "s" : ""}` : "";
  const jourDeCourses = [5, 6].includes(now.getDay());
  const texte = (jourDeCourses && courses) || (d.soir && `Ce soir : ${d.soir}`) || courses || "Liste de courses vide";
  return (
    <a className="tuile" href="#cuisine" onClick={(e) => { e.preventDefault(); aller("cuisine"); }}>
      <span className="tuile-icone" aria-hidden="true"><ShoppingBasket size={18} strokeWidth={1.8} animated={false} /></span>
      <b>Cuisine</b>
      <span>{texte}</span>
    </a>
  );
}
