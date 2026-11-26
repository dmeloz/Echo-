import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useState } from "react";
import { db } from "../../data/db";
import { poserReglage } from "../../data/hooks";
import type { ContexteModule } from "../contrat";
import { rangerFaits, remettreHabituels } from "./actions";
import { Courses } from "./Courses";
import { PopupGouts } from "./Gouts";
import { Magasin } from "./Magasin";
import { Semaine } from "./Semaine";
import { Stock } from "./Stock";

type Partie = "semaine" | "courses" | "stock";
const NOMS: Record<Partie, string> = { semaine: "Semaine", courses: "Courses", stock: "Stock" };

// La page Cuisine : trois parties (Semaine, Courses, Stock). Le vendredi et le samedi, elle s'ouvre sur les courses.
export function PageCuisine(ctx: ContexteModule) {
  const { proprio, now } = ctx;
  const [partie, setPartie] = useState<Partie>(() => ([5, 6].includes(now.getDay()) ? "courses" : "semaine"));
  const [magasin, setMagasin] = useState(false);
  const courses = useLiveQuery(() => db.cuisine_courses.toArray(), [], undefined);
  // Le questionnaire des goûts : une fois par personne, tant qu'il n'a été ni rempli ni remis à plus tard.
  const aDemander = useLiveQuery(async () => !(await db.reglages.get("cuisineGoutsVu"))?.valeur && !(await db.cuisine_gouts.get(proprio)), [proprio], false);

  // À l'ouverture : ce qui a été acheté quitte la liste, puis Echo remet les achats habituels dont c'est le moment.
  useEffect(() => { rangerFaits().then(() => remettreHabituels()).catch(() => {}); }, []);

  if (magasin && courses) return <Magasin courses={courses} onQuitter={() => setMagasin(false)} />;
  return (
    <>
      <div className="vue-choix" role="group" aria-label="Parties de Cuisine">
        {(Object.keys(NOMS) as Partie[]).map((p) => (
          <button key={p} type="button" aria-pressed={partie === p} onClick={() => setPartie(p)}>{NOMS[p]}</button>
        ))}
      </div>
      {partie === "courses" && <Courses {...ctx} courses={courses} onMagasin={() => setMagasin(true)} />}
      {partie === "semaine" && <Semaine {...ctx} />}
      {partie === "stock" && <Stock {...ctx} />}
      {aDemander && <PopupGouts {...ctx} onFini={() => poserReglage("cuisineGoutsVu", true)} />}
    </>
  );
}
