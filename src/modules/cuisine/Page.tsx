import { useLiveQuery } from "dexie-react-hooks";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Refrigerator, ShoppingBasket, Snowflake } from "pulsoicon-react";
import { useCallback, useEffect, useState } from "react";
import { db } from "../../data/db";
import { poserReglage } from "../../data/hooks";
import type { ContexteModule } from "../contrat";
import { auJour, plusJours } from "../../lib/dates";
import { rangerBoites, rangerFaits, remettreHabituels } from "./actions";
import { PageBatch } from "./Batch";
import { Livre } from "./Livre";
import { Courses } from "./Courses";
import { PopupGouts } from "./Gouts";
import { Magasin } from "./Magasin";
import { Semaine } from "./Semaine";
import { Stock } from "./Stock";
import { ApercuTicket } from "./Ticket";
import type { Article, LectureTicket, Lieu } from "./donnees";

type Partie = "stock" | "courses" | "semaine";
const PARTIES: Array<{ id: Partie; nom: string; Icone: typeof Refrigerator }> = [
  { id: "stock", nom: "Stock", Icone: Refrigerator }, { id: "courses", nom: "Courses", Icone: ShoppingBasket }, { id: "semaine", nom: "Semaine", Icone: CalendarDays },
];
const s = (n: number) => (n > 1 ? "s" : "");

// La page Cuisine s'ouvre sur son entrée : ce soir (le repas, quoi sortir du congélateur, quoi manger vite),
// puis trois lignes, le stock d'abord. Chaque partie s'ouvre en page, avec un retour.
export function PageCuisine(ctx: ContexteModule) {
  const { proprio, now } = ctx;
  const [partie, setPartie] = useState<Partie | null>(null);
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
  const courses = useLiveQuery(() => db.cuisine_courses.toArray(), [], undefined);
  // Le questionnaire des goûts : une fois par personne, tant qu'il n'a été ni rempli ni remis à plus tard.
  const aDemander = useLiveQuery(async () => !(await db.reglages.get("cuisineGoutsVu"))?.valeur && !(await db.cuisine_gouts.get(proprio)), [proprio], false);

  // À l'ouverture : ce qui a été acheté quitte la liste, puis Echo remet les achats habituels dont c'est le moment.
  // Les boîtes du batch dont le repas est passé sortent du stock.
  const hier = auJour(-1, now);
  useEffect(() => { rangerFaits().then(() => remettreHabituels()).catch(() => {}); }, []);
  useEffect(() => { rangerBoites(hier).catch(() => {}); }, [hier]);
  // Le retour (glisser vers la droite, ou rechoisir Cuisine dans le menu) ramène à l'entrée. Une page plus profonde
  // (un endroit du stock, le livre, le ticket, le batch) gère son propre retour.
  const profond = !!lieu || livre || !!ticket || !!batch || magasin;
  useEffect(() => {
    if (!partie || profond) return;
    const retour = () => setPartie(null);
    addEventListener("echo-retour", retour);
    return () => removeEventListener("echo-retour", retour);
  }, [partie, profond]);
  useEffect(() => { document.querySelector(".defile")?.scrollTo(0, 0); }, [partie]);

  if (ticket) return <ApercuTicket lu={ticket} now={now} onFini={fermerTicket} />;
  if (batch) return <PageBatch {...ctx} semaine={batch} onQuitter={fermerBatch} />;
  if (magasin && courses) return <Magasin courses={courses} onQuitter={() => setMagasin(false)} />;
  const retour = !profond && partie && (
    <div className="partie-tete">
      <button type="button" className="retour" onClick={() => setPartie(null)}><ChevronLeft size={20} strokeWidth={2.2} />Cuisine</button>
      <h2 className="reglage-titre">{PARTIES.find((p) => p.id === partie)!.nom}</h2>
    </div>
  );
  return (
    <>
      {retour}
      {!partie && <Accueil {...ctx} courses={courses} versPartie={setPartie} />}
      {partie === "courses" && <Courses {...ctx} courses={courses} onMagasin={() => setMagasin(true)} onTicket={setTicket} />}
      {partie === "semaine" && (livre ? <Livre {...ctx} onQuitter={fermerLivre} /> : <Semaine {...ctx} prochaine={prochaine} setProchaine={setProchaine} onBatch={setBatch} onLivre={() => setLivre(true)} />)}
      {partie === "stock" && <Stock {...ctx} lieu={lieu} setLieu={setLieu} onTicket={setTicket} />}
      {aDemander && <PopupGouts {...ctx} onFini={() => poserReglage("cuisineGoutsVu", true)} />}
    </>
  );
}

// L'entrée de Cuisine : une carte « Ce soir », puis Stock, Courses, Semaine avec l'essentiel de chacun.
function Accueil({ now, courses, versPartie }: ContexteModule & { courses: Article[] | undefined; versPartie: (p: Partie) => void }) {
  const today = auJour(0, now), limite = auJour(3, now);
  const lundi = plusJours(today, -((now.getDay() + 6) % 7));
  const d = useLiveQuery(async () => {
    const stock = await db.cuisine_stock.toArray();
    const semaine = await db.cuisine_repas.where("jour").between(today, plusJours(lundi, 6), true, true).toArray();
    return { stock, soir: semaine.find((r) => r.jour === today && !r.propose), prevus: semaine.filter((r) => !r.propose).length };
  }, [today]);
  if (!d) return null;
  const vite = d.stock.filter((p) => p.avant && p.avant <= limite).sort((a, b) => a.avant!.localeCompare(b.avant!));
  const sortir = d.stock.find((p) => p.id === `boite-${auJour(1, now)}` && p.lieu === "congelateur");
  const reste = (courses ?? []).filter((a) => !a.fait).length;
  const sous: Record<Partie, string> = {
    stock: d.stock.length ? `${d.stock.length} produit${s(d.stock.length)}${vite.length ? `, ${vite.length} à manger vite` : ""}` : "Vide : prends un ticket en photo",
    courses: reste ? `${reste} article${s(reste)} à prendre` : "Liste vide",
    semaine: d.prevus ? `${d.prevus} repas prévu${s(d.prevus)} d'ici dimanche` : "Rien de prévu, Echo peut proposer",
  };
  return (
    <>
      <section className="g ce-soir">
        <span className="lab">Ce soir</span>
        {d.soir ? <h2>{d.soir.plat}</h2> : <button type="button" className="ce-soir-vide" onClick={() => versPartie("semaine")}>Rien de prévu. Choisir un repas</button>}
        {sortir && <p><Snowflake size={16} strokeWidth={2.2} animated={false} aria-hidden="true" />À sortir du congélateur pour demain : {sortir.nom}</p>}
        {vite.length > 0 && <p className="vite"><Clock size={16} strokeWidth={2.2} animated={false} aria-hidden="true" />À manger vite : {vite.slice(0, 3).map((p) => p.nom.toLowerCase()).join(", ")}{vite.length > 3 ? ` et ${vite.length - 3} de plus` : ""}</p>}
      </section>
      <nav className="parties" aria-label="Parties de Cuisine">
        {PARTIES.map(({ id, nom, Icone }) => (
          <button key={id} type="button" className="g ligne-lien" onClick={() => versPartie(id)}>
            <span className="tuile-icone" aria-hidden="true"><Icone size={18} strokeWidth={1.8} animated={false} /></span>
            <span><b>{nom}</b><span>{sous[id]}</span></span>
            <ChevronRight size={18} strokeWidth={2.2} className="signe" animated={false} />
          </button>
        ))}
      </nav>
    </>
  );
}
