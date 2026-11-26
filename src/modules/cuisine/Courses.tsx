import { Mic, Plus, ShoppingBasket, ShoppingCart } from "pulsoicon-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { initialeDe } from "../../data/hooks";
import { trembler, vibrer } from "../../lib/gestes";
import type { Noms } from "../../lib/types";
import { ecouterVoix, voixPossible } from "../../lib/voix";
import type { ContexteModule } from "../contrat";
import { ajouterArticles, changerArticle, cocherArticle, rangerArticle, rangerFaits, retirerArticle } from "./actions";
import { RAYONS, lireArticles, parRayon, type Article, type Rayon } from "./donnees";

// La coche qui se dessine (gardée à la main, comme dans le reste de l'app).
export const Coche = () => <svg className="coche-trait" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>;

// Qui a ajouté l'article : l'initiale de la personne, ou E quand Echo a remis un achat habituel.
export function Auteur({ a, noms }: { a: Article; noms: Noms }) {
  const echo = a.par === "echo";
  const qui = a.fait && a.faitPar ? a.faitPar : a.par;
  const nom = echo ? "Echo, achat habituel" : noms[qui as "moi" | "elle"];
  return <i className={`av ${echo && !a.fait ? "echo" : qui}`} role="img" aria-label={`${a.fait ? "Coché" : "Ajouté"} par ${nom}`}>{echo && !a.fait ? "E" : initialeDe(noms, qui as "moi" | "elle")}</i>;
}

interface Props extends ContexteModule { courses: Article[] | undefined; onMagasin: () => void }

// Les courses : un champ pour écrire, puis un carrousel, une carte par rayon. Un rayon terminé sort du carrousel.
export function Courses({ noms, courses, onMagasin }: Props) {
  const [texte, setTexte] = useState("");
  const [ecoute, setEcoute] = useState(false);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [actif, setActif] = useState(0);
  const [voirPris, setVoirPris] = useState(false);
  const arret = useRef<(() => void) | null>(null);
  const piste = useRef<HTMLDivElement>(null);
  const pilules = useRef<HTMLDivElement>(null);
  const boite = useRef<HTMLFormElement>(null);
  const entete = typeof document === "undefined" ? null : document.getElementById("entete-module");
  useEffect(() => () => arret.current?.(), []);

  const groupes = parRayon(courses ?? []);
  const ouverts = groupes.filter((g) => g.reste > 0);
  const pris = groupes.filter((g) => g.reste === 0).flatMap((g) => g.articles);
  const reste = ouverts.reduce((n, g) => n + g.reste, 0);
  const ici = Math.min(actif, Math.max(0, ouverts.length - 1));

  // La pilule du rayon affiché reste visible quand on fait défiler les cartes.
  useEffect(() => {
    const p = pilules.current, el = p?.children[ici] as HTMLElement | undefined;
    if (p && el) p.scrollTo({ left: el.offsetLeft - p.offsetLeft - 16, behavior: "smooth" });
  }, [ici]);

  const envoyer = () => {
    const lus = lireArticles(texte);
    if (!lus.length) { trembler(boite.current); return; }
    const garde = texte;
    setTexte("");
    ajouterArticles(lus).catch(() => { setTexte(garde); trembler(boite.current); toast("Pas enregistré. Libère un peu de place sur le téléphone, puis réessaie. Ta phrase est gardée."); });
  };
  const dicter = () => {
    if (ecoute) { arret.current?.(); return; }
    vibrer(12); setEcoute(true);
    arret.current = ecouterVoix({ onTexte: setTexte, onErreur: (m) => toast(m, { duration: 6000 }), onFin: () => { arret.current = null; setEcoute(false); } });
  };
  const allerA = (i: number) => {
    const carte = piste.current?.children[i] as HTMLElement | undefined;
    if (carte && piste.current) piste.current.scrollTo({ left: carte.offsetLeft - piste.current.offsetLeft, behavior: "smooth" });
  };
  const suivre = () => {
    const p = piste.current;
    if (!p) return;
    const cartes = Array.from(p.children) as HTMLElement[];
    let mieux = 0;
    cartes.forEach((c, i) => { if (Math.abs(c.offsetLeft - p.offsetLeft - p.scrollLeft) < Math.abs(cartes[mieux].offsetLeft - p.offsetLeft - p.scrollLeft)) mieux = i; });
    setActif(mieux);
  };

  return (
    <>
      {entete && reste > 0 && createPortal(
        <button type="button" className="pilule-entete" onClick={onMagasin}><ShoppingCart size={17} strokeWidth={2} />Au magasin</button>, entete)}

      <form className="g ajout-courses" ref={boite} autoComplete="off" onSubmit={(e) => { e.preventDefault(); envoyer(); }}>
        <label className="vh" htmlFor="ajout-courses">Ajouter des articles</label>
        <input id="ajout-courses" enterKeyHint="done" placeholder={ecoute ? "Je t'écoute…" : "Ajouter : « 2 citrons, du lait »"} value={texte} onChange={(e) => setTexte(e.target.value)} />
        {voixPossible() && <button type="button" className={`rond-champ${ecoute ? " ecoute" : ""}`} aria-label={ecoute ? "Arrêter la dictée" : "Dicter"} aria-pressed={ecoute} onClick={dicter}><Mic size={19} strokeWidth={2} play={ecoute} /></button>}
        {texte.trim() && <button type="submit" className="rond-champ plein" aria-label="Ajouter à la liste"><Plus size={20} strokeWidth={2.4} /></button>}
      </form>

      {courses === undefined ? null : !groupes.length ? (
        <section className="g vide">
          <span className="vide-icone" aria-hidden="true"><ShoppingBasket size={24} strokeWidth={1.8} animated={false} /></span>
          <h2>La liste est vide</h2>
          <p>Écris ce qu'il manque, à plusieurs d'un coup. Echo range chaque article dans son rayon.</p>
        </section>
      ) : (
        <>
          {ouverts.length > 0 ? (
            <>
              <div className="rayons" role="tablist" aria-label="Rayons" ref={pilules}>
                {ouverts.map((g, i) => (
                  <button key={g.rayon} type="button" role="tab" aria-selected={i === ici} className="ray" onClick={() => allerA(i)}>{g.nom} <b>{g.reste}</b></button>
                ))}
              </div>
              <div className="carrousel" ref={piste} onScroll={suivre}>
                {ouverts.map((g, i) => (
                  <section key={g.rayon} className="g carte-rayon" aria-label={`${g.nom}, reste ${g.reste}`} aria-current={i === ici}>
                    <header><h2>{g.nom}</h2><span>reste {g.reste}</span></header>
                    <ul>
                      {g.articles.map((a) => <LigneArticle key={a.id} a={a} noms={noms} ouvert={ouvert === a.id} onOuvrir={() => setOuvert(ouvert === a.id ? null : a.id)} />)}
                    </ul>
                  </section>
                ))}
              </div>
              {ouverts.length > 1 && <div className="points-rayons" role="img" aria-label={`Rayon ${ici + 1} sur ${ouverts.length}`}>{ouverts.map((g, i) => <i key={g.rayon} className={i === ici ? "la" : ""} />)}</div>}
            </>
          ) : (
            <section className="g vide">
              <svg className="sceau" width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true"><circle cx="28" cy="28" r="24" pathLength={1} /><path d="M18 28.5l7 7 13-14" pathLength={1} /></svg>
              <h2>Tout est pris</h2>
              <p>Range les courses : Echo retient ce que vous achetez pour le remettre tout seul la prochaine fois.</p>
              <div className="rangee centre"><button type="button" className="bouton" onClick={() => rangerFaits(true)}>Courses finies</button></div>
            </section>
          )}

          {pris.length > 0 && ouverts.length > 0 && (
            <section className="g deja-pris">
              <button type="button" className="deja-tete" aria-expanded={voirPris} onClick={() => setVoirPris(!voirPris)}>
                <span className="case cochee" aria-hidden="true"><Coche /></span>
                <b>Déjà pris</b><span>{pris.length} article{pris.length > 1 ? "s" : ""}</span>
              </button>
              {voirPris && <ul>{pris.map((a) => <LigneArticle key={a.id} a={a} noms={noms} ouvert={false} onOuvrir={() => {}} />)}</ul>}
            </section>
          )}
        </>
      )}
    </>
  );
}

// Une ligne : la case coche, le nom ouvre les détails (quantité, rayon, retirer).
function LigneArticle({ a, noms, ouvert, onOuvrir }: { a: Article; noms: Noms; ouvert: boolean; onOuvrir: () => void }) {
  return (
    <li className={`art${a.fait ? " fait" : ""}`}>
      <div className="art-ligne">
        <button type="button" className={`case${a.fait ? " cochee" : ""}`} role="checkbox" aria-checked={!!a.fait} aria-label={a.nom} onClick={() => { vibrer(); cocherArticle(a.id); }}>{a.fait && <Coche />}</button>
        <button type="button" className="art-nom" aria-expanded={ouvert} disabled={!!a.fait} onClick={onOuvrir}>{a.nom}</button>
        {a.qte && <span className="qte">{a.qte}</span>}
        <Auteur a={a} noms={noms} />
      </div>
      {ouvert && !a.fait && (
        <div className="art-plus">
          <label><span>Quantité</span><input className="saisie" defaultValue={a.qte} placeholder="2, 500 g, 1 botte…" maxLength={20} onBlur={(e) => { if (e.target.value.trim() !== a.qte) changerArticle(a.id, { qte: e.target.value.trim() }); }} /></label>
          <label><span>Rayon</span>
            <select className="saisie" value={a.rayon} onChange={(e) => rangerArticle(a, e.target.value as Rayon)}>{RAYONS.map((r) => <option key={r.id} value={r.id}>{r.nom}</option>)}</select>
          </label>
          <button type="button" className="bouton-texte danger" onClick={() => retirerArticle(a)}>Retirer</button>
        </div>
      )}
    </li>
  );
}
