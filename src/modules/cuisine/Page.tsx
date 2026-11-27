import { useLiveQuery } from "dexie-react-hooks";
import { BookOpen, Clock, Snowflake } from "pulsoicon-react";
import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { db } from "../../data/db";
import { poserReglage } from "../../data/hooks";
import { vibrer } from "../../lib/gestes";
import type { ContexteModule } from "../contrat";
import { auJour } from "../../lib/dates";
import { rangerBoites, rangerFaits, remettreHabituels } from "./actions";
import { PageBatch } from "./Batch";
import { Livre } from "./Livre";
import { Courses } from "./Courses";
import { PopupGouts } from "./Gouts";
import { Magasin } from "./Magasin";
import { Semaine } from "./Semaine";
import { Stock } from "./Stock";
import { ApercuTicket } from "./Ticket";
import type { LectureTicket, Lieu } from "./donnees";

// Le scanner (et sa bibliothèque de lecture) n'est chargé que quand on l'ouvre.
const Scanner = lazy(() => import("./Scanner").then((m) => ({ default: m.Scanner })));

type Partie = "stock" | "courses" | "semaine";
const PARTIES: Array<{ id: Partie; nom: string }> = [{ id: "stock", nom: "Stock" }, { id: "courses", nom: "Courses" }, { id: "semaine", nom: "Semaine" }];
// L'onglet ouvert à l'arrivée : les courses le vendredi et le samedi (jours de courses), la semaine les autres jours.
const ongletDuJour = (now: Date): Partie => ([5, 6].includes(now.getDay()) ? "courses" : "semaine");

// La page Cuisine : trois mots en haut, comme l'Agenda (Stock, Courses, Semaine) avec une goutte de verre sous le mot choisi,
// et un rond à droite pour le livre de recettes. « Ce soir » est en tête de la Semaine.
export function PageCuisine(ctx: ContexteModule) {
  const { proprio, now } = ctx;
  const [partie, setPartie] = useState<Partie>(() => ongletDuJour(now));
  const [lieu, setLieu] = useState<Lieu | null>(null); // l'endroit du stock ouvert
  const [magasin, setMagasin] = useState(false);
  const [ticket, setTicket] = useState<LectureTicket | null>(null);
  const fermerTicket = useCallback(() => setTicket(null), []);
  const [batch, setBatch] = useState<string | null>(null); // le lundi de la semaine dont on cuisine le batch
  const [livre, setLivre] = useState(false);
  // Du vendredi au dimanche, on prépare la semaine qui vient : la Semaine s'ouvre dessus (et s'en souvient au retour du batch).
  const [prochaine, setProchaine] = useState(() => [5, 6, 0].includes(now.getDay()));
  const fermerBatch = useCallback(() => setBatch(null), []);
  const fermerLivre = useCallback(() => setLivre(false), []);
  const [scanner, setScanner] = useState(false);
  const fermerScanner = useCallback(() => setScanner(false), []);
  const courses = useLiveQuery(() => db.cuisine_courses.toArray(), [], undefined);
  // Le questionnaire des goûts : une fois par personne, tant qu'il n'a été ni rempli ni remis à plus tard.
  const aDemander = useLiveQuery(async () => !(await db.reglages.get("cuisineGoutsVu"))?.valeur && !(await db.cuisine_gouts.get(proprio)), [proprio], false);

  // À l'ouverture : ce qui a été acheté quitte la liste, puis Echo remet les achats habituels dont c'est le moment.
  // Les boîtes du batch dont le repas est passé sortent du stock.
  const hier = auJour(-1, now);
  useEffect(() => { rangerFaits().then(() => remettreHabituels()).catch(() => {}); }, []);
  useEffect(() => { rangerBoites(hier).catch(() => {}); }, [hier]);
  useEffect(() => { document.querySelector(".defile")?.scrollTo(0, 0); }, [partie, livre]);

  if (ticket) return <ApercuTicket lu={ticket} now={now} onFini={fermerTicket} />;
  if (scanner) return <Suspense fallback={null}><Scanner onQuitter={fermerScanner} /></Suspense>;
  if (batch) return <PageBatch {...ctx} semaine={batch} onQuitter={fermerBatch} />;
  if (magasin && courses) return <Magasin courses={courses} onQuitter={() => setMagasin(false)} />;
  if (livre) return <Livre {...ctx} onQuitter={fermerLivre} />;
  return (
    <>
      {/* Un endroit du stock ouvert a son propre retour : les onglets laissent la place. */}
      {!(partie === "stock" && lieu) && (
        <div className="agenda-barre">
          <div className="vues" role="tablist" aria-label="Parties de Cuisine" style={{ "--i": PARTIES.findIndex((p) => p.id === partie) } as React.CSSProperties}>
            <span className="vues-goutte" aria-hidden="true" />
            {PARTIES.map((p) => (
              <button key={p.id} type="button" role="tab" aria-selected={partie === p.id} onClick={() => { vibrer(4); setLieu(null); setPartie(p.id); }}>{p.nom}</button>
            ))}
          </div>
          <button type="button" className="rond-horaires" aria-label="Livre de recettes" onClick={() => setLivre(true)}><BookOpen size={19} strokeWidth={1.8} /></button>
        </div>
      )}
      {partie === "courses" && <Courses {...ctx} courses={courses} onMagasin={() => setMagasin(true)} onTicket={setTicket} />}
      {partie === "semaine" && <><CeSoir {...ctx} versStock={() => setPartie("stock")} /><Semaine {...ctx} prochaine={prochaine} setProchaine={setProchaine} onBatch={setBatch} /></>}
      {partie === "stock" && <Stock {...ctx} lieu={lieu} setLieu={setLieu} onTicket={setTicket} onScanner={() => setScanner(true)} />}
      {aDemander && <PopupGouts {...ctx} onFini={() => poserReglage("cuisineGoutsVu", true)} />}
    </>
  );
}

// « Ce soir » en tête de la Semaine : le repas du soir, quoi sortir du congélateur, ce qu'il faut manger vite.
// Sans rien de tout ça (pas de repas prévu ce soir), la carte ne s'affiche pas : la Semaine juste en dessous le dit déjà.
function CeSoir({ now, versStock }: ContexteModule & { versStock: () => void }) {
  const today = auJour(0, now), limite = auJour(3, now);
  const d = useLiveQuery(async () => {
    const stock = await db.cuisine_stock.toArray();
    const soir = (await db.cuisine_repas.where("jour").equals(today).toArray()).find((r) => !r.propose);
    return { stock, soir };
  }, [today]);
  if (!d) return null;
  const vite = d.stock.filter((p) => p.avant && p.avant <= limite).sort((a, b) => a.avant!.localeCompare(b.avant!));
  const sortir = d.stock.find((p) => p.id === `boite-${auJour(1, now)}` && p.lieu === "congelateur");
  if (!d.soir && !sortir && !vite.length) return null;
  return (
    <section className="g ce-soir">
      <span className="lab">Ce soir</span>
      {d.soir && <h2>{d.soir.plat}</h2>}
      {sortir && <p><Snowflake size={16} strokeWidth={2.2} animated={false} aria-hidden="true" />À sortir du congélateur pour demain : {sortir.nom}</p>}
      {vite.length > 0 && <button type="button" className="vite-lien" onClick={versStock}><Clock size={16} strokeWidth={2.2} animated={false} aria-hidden="true" />À manger vite : {vite.slice(0, 3).map((p) => p.nom.toLowerCase()).join(", ")}{vite.length > 3 ? ` et ${vite.length - 3} de plus` : ""}</button>}
    </section>
  );
}
