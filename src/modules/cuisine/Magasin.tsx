import { useLiveQuery } from "dexie-react-hooks";
import { X } from "pulsoicon-react";
import { useState } from "react";
import { toast } from "sonner";
import { useEcranAllume, vibrer } from "../../lib/gestes";
import { cocherArticle, rangerFaits } from "./actions";
import { Coche } from "./Courses";
import { db } from "../../data/db";
import { poserReglage, useReglage } from "../../data/hooks";
import { cleDe, magasinHabituel, magasinsConnus, parRayon, type Article, type Rayon } from "./donnees";

// Le mode « Au magasin » : gros articles, un rayon à la fois, l'écran reste allumé.
// Quand Echo connaît au moins deux magasins (par les tickets), on dit où l'on est : ce qui s'achète d'habitude ailleurs passe en bas.
export function Magasin({ courses, onQuitter }: { courses: Article[]; onQuitter: () => void }) {
  const [choisi, setChoisi] = useState<Rayon | null>(null);
  const habitudes = useLiveQuery(() => db.cuisine_habitudes.toArray(), [], []);
  const magasins = magasinsConnus(habitudes);
  const garde = useReglage<string>("cuisineMagasin", "");
  const ou = magasins.length > 1 && magasins.includes(garde) ? garde : "";
  const habituel = (a: Article) => magasinHabituel(habitudes.find((h) => h.cle === cleDe(a.nom)));
  const ailleurs = ou ? courses.filter((a) => !a.fait && habituel(a) && habituel(a) !== ou) : [];
  const ici = ailleurs.length ? courses.filter((a) => !ailleurs.includes(a)) : courses;
  const groupes = parRayon(ici);
  const ouverts = groupes.filter((g) => g.reste > 0);
  const finis = groupes.filter((g) => g.reste === 0);
  const total = ici.length, reste = ici.filter((a) => !a.fait).length;
  const rayon = ouverts.find((g) => g.rayon === choisi) ?? ouverts[0];
  const suivant = ouverts[(ouverts.indexOf(rayon) + 1) % Math.max(1, ouverts.length)];

  useEcranAllume();

  const finir = async () => {
    const n = await rangerFaits(true);
    onQuitter();
    toast(n ? "Courses rangées. Echo retient ce que vous achetez." : "Mode magasin fermé");
  };
  const Ligne = ({ a, lieu }: { a: Article; lieu?: string }) => (
    <button type="button" className={`art-magasin${a.fait ? " fait" : ""}`} role="checkbox" aria-checked={!!a.fait} onClick={() => { vibrer(); cocherArticle(a.id); }}>
      <span className={`case${a.fait ? " cochee" : ""}`} aria-hidden="true">{a.fait && <Coche />}</span>
      <span className="art-nom">{a.nom}</span>{(lieu || a.qte) && <span className="qte">{lieu || a.qte}</span>}
    </button>
  );

  return (
    <div className="magasin">
      <div className="magasin-tete">
        <button type="button" className="loupe-ouvrir" aria-label="Quitter le mode magasin" onClick={onQuitter}><X size={20} strokeWidth={2.2} /></button>
        <div><b>Au magasin</b><span>{reste ? `Reste ${reste} sur ${total}${ou ? ` chez ${ou}` : ""}` : ailleurs.length ? `Tout est pris chez ${ou}` : "Tout est pris"}</span></div>
      </div>
      <div className="magasin-barre" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={total - reste} aria-label="Articles pris"><i style={{ width: `${total ? ((total - reste) / total) * 100 : 0}%` }} /></div>

      {magasins.length > 1 && (
        <div className="rayons" role="group" aria-label="Dans quel magasin">
          {["", ...magasins].map((m) => <button key={m} type="button" className="ray" aria-pressed={ou === m} onClick={() => poserReglage("cuisineMagasin", m)}>{m || "Tous"}</button>)}
        </div>
      )}

      {rayon ? (
        <>
          {ouverts.length > 1 && (
            <div className="rayons" role="tablist" aria-label="Rayons">
              {ouverts.map((g) => <button key={g.rayon} type="button" role="tab" aria-selected={g === rayon} className="ray" onClick={() => setChoisi(g.rayon)}>{g.nom} <b>{g.reste}</b></button>)}
            </div>
          )}
          <section className="g liste-magasin" aria-label={rayon.nom}>
            <h2>{rayon.nom}</h2>
            {rayon.articles.map((a) => <Ligne key={a.id} a={a} />)}
          </section>
          {suivant && suivant !== rayon && (
            <>
              <span className="lab magasin-lab">Ensuite : {suivant.nom}</span>
              <section className="g liste-magasin ensuite" aria-label={`Ensuite, ${suivant.nom}`}>{suivant.articles.filter((a) => !a.fait).map((a) => <Ligne key={a.id} a={a} />)}</section>
            </>
          )}
        </>
      ) : (
        <section className="g vide">
          <svg className="sceau" width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true"><circle cx="28" cy="28" r="24" pathLength={1} /><path d="M18 28.5l7 7 13-14" pathLength={1} /></svg>
          <h2>{ailleurs.length ? `Tout est pris chez ${ou}` : "Tout est pris"}</h2>
          <p>{ailleurs.length ? `Il reste ${ailleurs.length} article${ailleurs.length > 1 ? "s" : ""} à prendre ailleurs.` : "Tu peux ranger le téléphone."}</p>
        </section>
      )}

      {ailleurs.length > 0 && (
        <>
          <span className="lab magasin-lab">D'habitude ailleurs</span>
          <section className="g liste-magasin ensuite" aria-label="D'habitude achetés ailleurs">
            {ailleurs.map((a) => <Ligne key={a.id} a={a} lieu={habituel(a)} />)}
          </section>
        </>
      )}

      {finis.length > 0 && (
        <>
          <span className="lab magasin-lab">Déjà pris</span>
          <section className="g deja-magasin">
            {finis.map((g) => <div key={g.rayon}><span className="case cochee" aria-hidden="true"><Coche /></span><b>{g.nom}</b><span>{g.articles.length} article{g.articles.length > 1 ? "s" : ""}</span></div>)}
          </section>
        </>
      )}
      <div className="rangee centre"><button type="button" className={`bouton${reste || ailleurs.length ? " second" : ""}`} onClick={finir}>Courses finies</button></div>
    </div>
  );
}
