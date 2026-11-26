import { X } from "pulsoicon-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { vibrer } from "../../lib/gestes";
import { cocherArticle, rangerFaits } from "./actions";
import { Coche } from "./Courses";
import { parRayon, type Article, type Rayon } from "./donnees";

// Le mode « Au magasin » : gros articles, un rayon à la fois, l'écran reste allumé.
export function Magasin({ courses, onQuitter }: { courses: Article[]; onQuitter: () => void }) {
  const [choisi, setChoisi] = useState<Rayon | null>(null);
  const groupes = parRayon(courses);
  const ouverts = groupes.filter((g) => g.reste > 0);
  const finis = groupes.filter((g) => g.reste === 0);
  const total = courses.length, reste = courses.filter((a) => !a.fait).length;
  const ici = ouverts.find((g) => g.rayon === choisi) ?? ouverts[0];
  const suivant = ouverts[(ouverts.indexOf(ici) + 1) % Math.max(1, ouverts.length)];

  // Garder l'écran allumé tant qu'on est dans le magasin (si le téléphone le permet).
  useEffect(() => {
    let verrou: { release: () => Promise<void> } | null = null, parti = false;
    const prendre = () => (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock
      ?.request("screen").then((v) => { if (parti) v.release(); else verrou = v; }).catch(() => {});
    const retour = () => { if (!document.hidden) prendre(); };
    prendre();
    document.addEventListener("visibilitychange", retour);
    document.querySelector(".defile")?.scrollTo(0, 0);
    return () => { parti = true; verrou?.release().catch(() => {}); document.removeEventListener("visibilitychange", retour); };
  }, []);

  const finir = async () => {
    const n = await rangerFaits(true);
    onQuitter();
    toast(n ? "Courses rangées. Echo retient ce que vous achetez." : "Mode magasin fermé");
  };
  const Ligne = ({ a }: { a: Article }) => (
    <button type="button" className={`art-magasin${a.fait ? " fait" : ""}`} role="checkbox" aria-checked={!!a.fait} onClick={() => { vibrer(); cocherArticle(a.id); }}>
      <span className={`case${a.fait ? " cochee" : ""}`} aria-hidden="true">{a.fait && <Coche />}</span>
      <span className="art-nom">{a.nom}</span>{a.qte && <span className="qte">{a.qte}</span>}
    </button>
  );

  return (
    <div className="magasin">
      <div className="magasin-tete">
        <button type="button" className="loupe-ouvrir" aria-label="Quitter le mode magasin" onClick={onQuitter}><X size={20} strokeWidth={2.2} /></button>
        <div><b>Au magasin</b><span>{reste ? `Reste ${reste} sur ${total}` : "Tout est pris"}</span></div>
      </div>
      <div className="magasin-barre" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={total - reste} aria-label="Articles pris"><i style={{ width: `${total ? ((total - reste) / total) * 100 : 0}%` }} /></div>

      {ici ? (
        <>
          {ouverts.length > 1 && (
            <div className="rayons" role="tablist" aria-label="Rayons">
              {ouverts.map((g) => <button key={g.rayon} type="button" role="tab" aria-selected={g === ici} className="ray" onClick={() => setChoisi(g.rayon)}>{g.nom} <b>{g.reste}</b></button>)}
            </div>
          )}
          <section className="g liste-magasin" aria-label={ici.nom}>
            <h2>{ici.nom}</h2>
            {ici.articles.map((a) => <Ligne key={a.id} a={a} />)}
          </section>
          {suivant && suivant !== ici && (
            <>
              <span className="lab magasin-lab">Ensuite : {suivant.nom}</span>
              <section className="g liste-magasin ensuite" aria-label={`Ensuite, ${suivant.nom}`}>{suivant.articles.filter((a) => !a.fait).map((a) => <Ligne key={a.id} a={a} />)}</section>
            </>
          )}
        </>
      ) : (
        <section className="g vide">
          <svg className="sceau" width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true"><circle cx="28" cy="28" r="24" pathLength={1} /><path d="M18 28.5l7 7 13-14" pathLength={1} /></svg>
          <h2>Tout est pris</h2>
          <p>Tu peux ranger le téléphone.</p>
        </section>
      )}

      {finis.length > 0 && (
        <>
          <span className="lab magasin-lab">Déjà pris</span>
          <section className="g deja-magasin">
            {finis.map((g) => <div key={g.rayon}><span className="case cochee" aria-hidden="true"><Coche /></span><b>{g.nom}</b><span>{g.articles.length} article{g.articles.length > 1 ? "s" : ""}</span></div>)}
          </section>
        </>
      )}
      <div className="rangee centre"><button type="button" className={`bouton${reste ? " second" : ""}`} onClick={finir}>Courses finies</button></div>
    </div>
  );
}
