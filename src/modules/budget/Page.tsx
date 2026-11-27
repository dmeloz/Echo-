import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ChevronRight, Plus, Users } from "pulsoicon-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { db } from "../../data/db";
import { poserReglage, useReglage } from "../../data/hooks";
import { auJour } from "../../lib/dates";
import { vibrer } from "../../lib/gestes";
import { autre, type Noms, type Personne } from "../../lib/types";
import type { ContexteModule } from "../contrat";
import { commencer, payer, payeurDuTicket, rembourser, retirerDepense } from "./actions";
import { FeuilleChanger, FeuilleDepense, FeuillePoste, FeuilleSolde, type Nouveau } from "./Feuilles";
import {
  aRemplir, avances, avancee, avecTickets, bilan, chf, debutBudget, duA, estTicket, dernierSolde, duMois, enveloppes, jourLong, moisDe, nomMois, parMois, periode, plusMoisB, resteAPayer, toutesCategories, valeurDe, vivants,
  type APayer, type Bilan, type Categorie, type CompteSolde, type Depense, type Poste, type Payeur, type Solde,
} from "./donnees";

type Partie = "mois" | "charges" | "comptes";
const PARTIES: Partie[] = ["mois", "charges", "comptes"];
const NOM_PARTIE: Record<Partie, string> = { mois: "Mois", charges: "Charges", comptes: "Comptes" };
const Chf = ({ c, grand }: { c: number; grand?: boolean }) => <span className={`budget-chiffre${grand ? " grand" : ""}${c < 0 ? " negatif" : ""}`}>{chf(c)}</span>;
const part = (a: number, total: number) => (total > 0 ? Math.min(100, Math.max(0, Math.round((a / total) * 100))) : 0);

interface Vue { postes: Poste[]; b: Bilan; mois: string; noms: Noms; proprio: Personne; ouvrir: (id: string) => void }

/* ---------- Le premier jour ---------- */

function Depart() {
  return (
    <section className="g vide">
      <h2>Votre budget à deux</h2>
      <p>Echo pose les lignes de départ : vos salaires, vos virements au compte commun, le loyer, les courses. Tu touches chaque ligne pour mettre son montant.</p>
      <button type="button" className="bouton" onClick={() => { vibrer(8); commencer(); }}>Commencer</button>
    </section>
  );
}

/* ---------- Mois : ce qui reste à chacun, puis le commun ---------- */

function Mois({ postes, b, mois, noms, proprio, depenses, categories, apayer, today, onChacun, onPartie }: Vue & { depenses: Depense[]; categories: Categorie[]; apayer: APayer[]; today: string; onChacun: (p: Personne) => void; onPartie: (p: Partie) => void }) {
  const [ouverte, setOuverte] = useState<string | null>(null);
  const l_autre = autre(proprio);
  const envs = enveloppes(postes, depenses, mois);
  const { restants } = avancee(mois, today);
  const enCours = mois === moisDe(today);
  const ds = duMois(depenses, mois);
  const vides = vivants(postes, mois).filter((p) => aRemplir(p, mois)).length;
  const dus = resteAPayer(apayer);
  const cats = new Map(toutesCategories(categories).map((c) => [c.id, c.nom]));
  return (
    <>
      {vides > 0 && (
        <button type="button" className="budget-a-remplir" onClick={() => onPartie("charges")}>
          <b>{vides > 1 ? `${vides} montants à remplir` : "1 montant à remplir"}</b><span>Touche les lignes à zéro pour mettre vos vrais chiffres.</span>
        </button>
      )}
      <div className="budget-duo">
        {([proprio, l_autre] as const).map((q) => (
          <button key={q} type="button" className={`g budget-reste ${q}`} onClick={() => onChacun(q)}>
            <span className="lab">{q === proprio ? "Il te reste" : `Il reste à ${noms[q]}`}</span>
            <Chf c={b.reste[q]} grand />
            <small>sur {chf(b.revenu[q])} · {chf(b.virement[q])} versés au commun</small>
          </button>
        ))}
      </div>

      <section className="g budget-commun">
        <span className="lab">Le commun · il reste</span>
        <Chf c={b.resteCommun} grand />
        <small>{chf(b.entree)} versés au compte commun, {chf(b.foyer)} de charges</small>
        {b.resteCommun > 0 && (
          <>
            <div className="budget-partage" role="img" aria-label={`Épargne ${chf(b.epargne)}, plaisir ${chf(b.plaisir)}`}>
              <i style={{ flexGrow: Math.max(4, 100 - b.pctPlaisir) }} /><i style={{ flexGrow: Math.max(4, b.pctPlaisir) }} />
            </div>
            <div className="budget-legende">
              <span><i className="pt epargne" />Épargne <b>{chf(b.epargne)}</b></span>
              <span><i className="pt plaisir" />Plaisir <b>{chf(b.plaisir)}</b></span>
            </div>
          </>
        )}
        {b.resteCommun < 0 && <p className="aide-champ">Les charges du foyer dépassent ce qui est versé au commun.</p>}
      </section>

      {envs.filter((e) => e.budget > 0 || e.depense > 0).map((e) => (
        <section className="g budget-enveloppe" key={e.cat}>
          <div className="budget-tete"><b>{e.nom}</b><span className={e.reste < 0 ? "depasse" : ""}>{e.reste < 0 ? `dépassé de ${chf(-e.reste)}` : <>reste <b>{chf(e.reste)}</b></>}</span></div>
          <div className="barre"><i style={{ width: `${part(e.depense, e.budget)}%` }} className={e.reste < 0 ? "depasse" : ""} /></div>
          <small>{chf(e.depense)} sur {chf(e.budget)}{enCours && e.reste > 0 && restants > 1 ? ` · environ ${chf(Math.floor(e.reste / restants / 100) * 100)} par jour pendant ${restants} jours` : ""}</small>
        </section>
      ))}

      {dus.length > 0 && (
        <section className="g liste-stock budget-liste"><span className="lab">À payer</span>
          <ul>{dus.map((l) => (
            <li key={l.id}><div className="corvee">
              <button type="button" className="coche" aria-label={`${l.titre} : c'est payé`} onClick={() => { vibrer(12); payer(l); }} />
              <div className="stock-ligne"><b>{l.titre}<small>{[l.emetteur, `pour le ${jourLong(l.echeance)}`].filter(Boolean).join(" · ")}</small></b><span className={`compte${l.echeance < today ? " attend" : ""}`}>{chf(l.c)}</span></div>
            </div></li>
          ))}</ul>
        </section>
      )}

      <section className="g liste-stock budget-liste"><span className="lab">Dépenses de {nomMois(mois).toLowerCase()}</span>
        {ds.length === 0 ? <p className="aide-champ">Aucune dépense notée. Le bouton « Dépense » est en haut de l'écran.</p> : (
          <ul>{ds.slice(0, 30).map((d) => (
            <li key={d.id} className={ouverte === d.id ? "ouvert" : ""}>
              <button type="button" className="stock-ligne" aria-expanded={ouverte === d.id} onClick={() => setOuverte(ouverte === d.id ? null : d.id)}>
                <b>{d.quoi || cats.get(d.cat) || "Dépense"}<small>{[jourLong(d.jour), estTicket(d) ? "ticket de caisse" : cats.get(d.cat) ?? d.cat, d.qui === "commun" ? "compte commun" : `payé par ${d.qui === proprio ? "toi" : noms[d.qui]}${d.rembourse ? ", rendu" : ""}`].join(" · ")}</small></b>
                <span className="compte">{chf(d.c)}</span>
              </button>
              {ouverte === d.id && (estTicket(d) ? (
                <div className="stock-plus">
                  <span className="lab">Qui a payé ce ticket</span>
                  <div className="stock-restes" role="group" aria-label={`Qui a payé ${d.quoi}`}>
                    {([["commun", "Compte commun"], [proprio, noms[proprio]], [l_autre, noms[l_autre]]] as Array<[Payeur, string]>).map(([q, nom]) =>
                      <button key={q} type="button" className="puce" aria-pressed={d.qui === q} onClick={() => { vibrer(4); payeurDuTicket(d, q); }}>{nom}</button>)}
                  </div>
                  <p className="aide-champ">Ce ticket vient de Cuisine. Pour l'enlever, retire-le là-bas.</p>
                </div>
              ) : <div className="stock-plus"><button type="button" className="bouton-texte danger" onClick={() => { setOuverte(null); retirerDepense(d); }}>Retirer cette dépense</button></div>)}
            </li>
          ))}</ul>
        )}
      </section>
    </>
  );
}

/* ---------- Charges : la fiche du foyer, en bulles ---------- */

interface Bulle { cle: string; nom: string; c: number; compte: "commun" | "facture"; postes: Poste[] }
function bulles(postes: Poste[], mois: string): Bulle[] {
  const liste: Bulle[] = [];
  for (const p of postes) {
    const c = p.sorte === "foyer" ? parMois(p, mois) : null;
    if (c === null) continue;
    const deja = p.groupe ? liste.find((x) => x.cle === "g:" + p.groupe) : undefined;
    if (deja) { deja.c += c; deja.postes.push(p); }
    else liste.push({ cle: p.groupe ? "g:" + p.groupe : p.id, nom: p.groupe ?? p.nom, c, compte: p.compte ?? "commun", postes: [p] });
  }
  return liste.sort((a, b) => b.c - a.c || a.nom.localeCompare(b.nom));
}

function Charges({ postes, b, mois, noms, proprio, ouvrir, onChacun, onNouveau, onGroupe }: Vue & { onChacun: (p: Personne) => void; onNouveau: (n: Nouveau) => void; onGroupe: (g: string) => void }) {
  const liste = bulles(postes, mois);
  return (
    <>
      <section className="g budget-commun">
        <div className="budget-tete"><span className="lab">Charges du foyer</span><small>par mois</small></div>
        <Chf c={b.foyer} grand />
        {b.foyer > 0 && (
          <>
            <div className="budget-partage comptes" role="img" aria-label={`Compte commun ${chf(b.parCompte.commun)}, compte facture ${chf(b.parCompte.facture)}`}>
              <i style={{ flexGrow: Math.max(4, part(b.parCompte.commun, b.foyer)) }} /><i style={{ flexGrow: Math.max(4, part(b.parCompte.facture, b.foyer)) }} />
            </div>
            <div className="budget-legende">
              <span><i className="pt commun" />Compte commun <b>{chf(b.parCompte.commun)}</b></span>
              <span><i className="pt facture" />Compte facture <b>{chf(b.parCompte.facture)}</b></span>
            </div>
          </>
        )}
      </section>

      {/* La taille d'une bulle suit son poids dans le total. */}
      <div className="budget-mosaique">
        {liste.map((x, i) => {
          const poids = part(x.c, b.foyer);
          const taille = poids >= 40 ? "large" : poids >= 8 ? "moyenne" : "petite";
          const seul = x.postes.length === 1 && !x.postes[0].groupe ? x.postes[0] : null;
          return (
            <button key={x.cle} type="button" className={`g budget-bulle ${taille}`} style={{ "--rang": i } as React.CSSProperties} onClick={() => { vibrer(4); if (seul) ouvrir(seul.id); else onGroupe(x.nom); }}>
              <span className="budget-bulle-tete"><i className={`pt ${x.compte}`} /><b>{x.nom}</b></span>
              <span className="budget-bulle-pied">{x.postes.every((p) => aRemplir(p, mois)) ? <em>À remplir</em> : <Chf c={x.c} />}{seul?.rythme === "an" && x.c > 0 && <small>{chf(valeurDe(seul, mois) ?? 0)} par an</small>}{!seul && <small>{x.postes.length} lignes</small>}</span>
            </button>
          );
        })}
        <button type="button" className="budget-bulle ajouter petite" onClick={() => onNouveau({ sorte: "foyer" })}><Plus size={18} strokeWidth={2.4} animated={false} /><span>Ajouter</span></button>
      </div>

      <span className="lab budget-sous-titre">Chacun de son côté</span>
      <div className="budget-duo">
        {([proprio, autre(proprio)] as const).map((q) => (
          <button key={q} type="button" className={`g budget-reste ${q}`} onClick={() => onChacun(q)}>
            <span className="lab">{q === proprio ? "Toi" : noms[q]}</span>
            <Chf c={b.perso[q]} />
            <small>de charges perso · voir le détail</small>
          </button>
        ))}
      </div>
    </>
  );
}

/* ---------- Le détail de chacun ---------- */

function Chacun({ postes, b, mois, noms, proprio, ouvrir, qui, onRetour, onNouveau }: Vue & { qui: Personne; onRetour: () => void; onNouveau: (n: Nouveau) => void }) {
  const siens = vivants(postes, mois).filter((p) => p.qui === qui);
  const ligne = (p: Poste, signe: string) => (
    <li key={p.id}><button type="button" className="stock-ligne" onClick={() => ouvrir(p.id)}>
      <b>{p.nom}{p.note && <small>{p.note}</small>}</b><span className="compte">{aRemplir(p, mois) ? "À remplir" : `${signe}${chf(parMois(p, mois) ?? 0)}`}</span>
    </button></li>
  );
  return (
    <>
      <button type="button" className="retour-agenda" onClick={onRetour}><ChevronLeft size={18} strokeWidth={2} animated={false} /> Budget</button>
      <section className={`g budget-reste ${qui} fixe`}>
        <span className="lab">{qui === proprio ? "Il te reste" : `Il reste à ${noms[qui]}`}</span>
        <Chf c={b.reste[qui]} grand />
        <small>salaire − charges perso − virement au commun</small>
      </section>
      <section className="g liste-stock budget-liste"><span className="lab">Ce qui entre</span><ul>{siens.filter((p) => p.sorte === "revenu").map((p) => ligne(p, ""))}</ul></section>
      <section className="g liste-stock budget-liste"><span className="lab">{qui === proprio ? "Tes" : "Ses"} charges perso · {chf(b.perso[qui])}</span>
        <ul>{siens.filter((p) => p.sorte === "perso").sort((x, y) => (parMois(y, mois) ?? 0) - (parMois(x, mois) ?? 0)).map((p) => ligne(p, "− "))}</ul>
        <button type="button" className="bouton-texte gauche" onClick={() => onNouveau({ sorte: "perso", qui })}>Ajouter une charge perso</button>
      </section>
      <section className="g liste-stock budget-liste"><span className="lab">Pour le foyer</span><ul>{siens.filter((p) => p.sorte === "virement").map((p) => ligne(p, "− "))}</ul></section>
    </>
  );
}

/* ---------- Entre nous : ce que chacun a avancé pour le foyer ---------- */

function EntreNous({ depenses, noms, proprio, onRetour }: { depenses: Depense[]; noms: Noms; proprio: Personne; onRetour: () => void }) {
  const du = duA(depenses);
  const qui = ([proprio, autre(proprio)] as const).filter((q) => du[q] > 0);
  return (
    <>
      <button type="button" className="retour-agenda" onClick={onRetour}><ChevronLeft size={18} strokeWidth={2} animated={false} /> Budget</button>
      <p className="phrase">{qui.length ? "Ce que l'un de vous a payé pour le foyer avec son argent. Le compte commun le lui doit." : <><b>Tout est à jour entre vous.</b> Quand l'un de vous paie une dépense du foyer avec son argent, elle arrive ici.</>}</p>
      {qui.map((q) => (
        <section className={`g liste-stock budget-liste`} key={q}>
          <div className="budget-tete colonne"><small>{q === proprio ? "Le compte commun te doit" : `Le compte commun doit à ${noms[q]}`}</small><Chf c={du[q]} grand /></div>
          <ul>{avances(depenses, q).map((d) => (
            <li key={d.id}><div className="stock-ligne"><b>{d.quoi || "Dépense"}<small>{jourLong(d.jour)}{estTicket(d) ? " · ticket de caisse" : ""}</small></b><span className="compte">{chf(d.c)}</span></div></li>
          ))}</ul>
          <button type="button" className="bouton petit budget-rendu" onClick={() => { vibrer(8); rembourser(q, depenses); }}>C'est rendu</button>
          <p className="aide-champ">À toucher quand le virement du compte commun vers {q === proprio ? "ton compte" : `le compte de ${noms[q]}`} est fait.</p>
        </section>
      ))}
    </>
  );
}

/* ---------- Comptes : les vrais soldes, et ce qui est mis de côté ---------- */

function Comptes({ postes, b, mois, ouvrir, soldes, onSolde, onNouveau }: Vue & { soldes: Solde[]; onSolde: (c: CompteSolde) => void; onNouveau: (n: Nouveau) => void }) {
  const annuels = vivants(postes, mois).filter((p) => p.sorte === "foyer" && p.rythme === "an");
  const groupes = [...new Set(annuels.map((p) => p.groupe ?? ""))].sort();
  const carte = (compte: CompteSolde, nom: string, plus: number) => {
    const s = dernierSolde(soldes, compte);
    return (
      <section className="g budget-compte">
        <div className="budget-tete"><b>{nom}</b>{s ? <Chf c={s.c} /> : <span className="budget-vide">Pas encore noté</span>}</div>
        {plus > 0 && <span className="budget-plus">+ {chf(plus)} ce mois</span>}
        {s && <small>Noté le {jourLong(s.jour)}{plus > 0 ? ` · après ${nomMois(mois).toLowerCase()} : environ ${chf(s.c + plus)}` : ""}</small>}
        {compte === "facture" && bulles(postes, mois).some((x) => x.compte === "facture") && <div className="budget-puces">{bulles(postes, mois).filter((x) => x.compte === "facture").map((x) => <span key={x.cle}>{x.nom} {chf(x.c)}</span>)}</div>}
        <button type="button" className="bouton-texte gauche" onClick={() => onSolde(compte)}>{s ? "Noter le solde d'aujourd'hui" : "Noter le solde"}</button>
      </section>
    );
  };
  return (
    <>
      <p className="phrase">Les vrais soldes, notés par vous. Echo ajoute ce que le mois met de côté.</p>
      {carte("epargne", "Épargne", b.epargne)}
      {carte("facture", "Compte facture", b.parCompte.facture)}
      {groupes.map((g) => {
        const lignes = annuels.filter((p) => (p.groupe ?? "") === g);
        const an = lignes.reduce((s, p) => s + (valeurDe(p, mois) ?? 0), 0), parM = lignes.reduce((s, p) => s + (parMois(p, mois) ?? 0), 0);
        return (
          <section className="g liste-stock budget-liste" key={g || "seuls"}>
            <div className="budget-tete colonne"><b>{g ? `Provision ${g.toLowerCase()}` : "Payé une fois par an"}</b><small>{chf(parM)} mis de côté par mois · {chf(an)} par an</small></div>
            <ul>{lignes.map((p) => (
              <li key={p.id}><button type="button" className="stock-ligne" onClick={() => ouvrir(p.id)}>
                <b>{p.nom}<small className={p.note ? "note" : ""}>{p.note || (p.echeance ? `Tombe le ${jourLong(`${mois.slice(0, 4)}-${p.echeance}`)}` : "Date à noter")}</small></b>
                <span className="compte">{chf(valeurDe(p, mois) ?? 0)}</span>
              </button></li>
            ))}</ul>
            {g && <button type="button" className="bouton-texte gauche" onClick={() => onNouveau({ sorte: "foyer", groupe: g })}>Ajouter une ligne</button>}
          </section>
        );
      })}
    </>
  );
}

/* ---------- La page ---------- */

export function PageBudget({ noms, proprio, now }: ContexteModule) {
  const today = auJour(0, now);
  const donnees = useLiveQuery(async () => ({
    postes: await db.budget_postes.toArray(), depenses: await db.budget_depenses.toArray(), categories: await db.budget_categories.toArray() as Categorie[],
    soldes: await db.budget_soldes.toArray(), apayer: await db.budget_apayer.toArray(),
    // Les tickets de caisse gardés par Cuisine : le Budget les lit (rien n'est copié) pour les compter dans les Courses.
    tickets: await db.cuisine_tickets.toArray(),
  }), [], undefined);
  const [entreNous, setEntreNous] = useState(false);
  const partie = useReglage<Partie>("budgetPartie", "mois");
  const [decalage, setDecalage] = useState(0);
  const [chacun, setChacun] = useState<Personne | null>(null);
  const [changer, setChanger] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState<Nouveau | null>(null);
  const [depense, setDepense] = useState(false);
  const [solde, setSolde] = useState<CompteSolde | null>(null);
  const [groupe, setGroupe] = useState<string | null>(null);
  useEffect(() => { document.querySelector(".defile")?.scrollTo(0, 0); }, [partie, chacun, entreNous]);
  // Le geste « retour » de l'app (glisser vers la droite) ferme le détail de chacun.
  useEffect(() => { const retour = () => { setChacun(null); setGroupe(null); setEntreNous(false); }; window.addEventListener("echo-retour", retour); return () => window.removeEventListener("echo-retour", retour); }, []);

  if (!donnees) return null;
  const { postes, categories, soldes, apayer } = donnees;
  const depenses = avecTickets(donnees.depenses, donnees.tickets, debutBudget(postes));
  const du = duA(depenses), aRendre = du.moi + du.elle;
  if (!postes.length) return <Depart />;

  const mois = plusMoisB(moisDe(today), decalage);
  const b = bilan(postes, mois);
  const vue: Vue = { postes, b, mois, noms, proprio, ouvrir: setChanger };
  const aChanger = changer ? postes.find((p) => p.id === changer) : undefined;
  const duGroupe = groupe ? vivants(postes, mois).filter((p) => p.sorte === "foyer" && p.groupe === groupe) : [];
  const entete = typeof document === "undefined" ? null : document.getElementById("entete-module");
  const feuilles = (
    <>
      {aChanger && <FeuilleChanger key={aChanger.id} poste={aChanger} postes={postes} mois={mois} noms={noms} proprio={proprio} onFermer={() => setChanger(null)} />}
      {nouveau && <FeuillePoste nouveau={nouveau} mois={mois} proprio={proprio} onFermer={() => setNouveau(null)} />}
      {depense && <FeuilleDepense categories={categories} noms={noms} proprio={proprio} onFermer={() => setDepense(false)} />}
      {solde && <FeuilleSolde compte={solde} onFermer={() => setSolde(null)} />}
    </>
  );

  if (entreNous) return <EntreNous depenses={depenses} noms={noms} proprio={proprio} onRetour={() => setEntreNous(false)} />;
  if (chacun) return <><Chacun {...vue} qui={chacun} onRetour={() => setChacun(null)} onNouveau={setNouveau} />{feuilles}</>;
  if (groupe) return (
    <>
      <button type="button" className="retour-agenda" onClick={() => setGroupe(null)}><ChevronLeft size={18} strokeWidth={2} animated={false} /> Charges</button>
      <section className="g liste-stock budget-liste">
        <div className="budget-tete"><b>{groupe}</b><small>{chf(duGroupe.reduce((s, p) => s + (parMois(p, mois) ?? 0), 0))} par mois</small></div>
        <ul>{duGroupe.map((p) => (
          <li key={p.id}><button type="button" className="stock-ligne" onClick={() => setChanger(p.id)}>
            <b>{p.nom}{p.note && <small>{p.note}</small>}</b><span className="compte">{chf(valeurDe(p, mois) ?? 0)}{p.rythme === "an" ? " par an" : ""}</span>
          </button></li>
        ))}</ul>
        <button type="button" className="bouton-texte gauche" onClick={() => setNouveau({ sorte: "foyer", groupe })}>Ajouter une ligne</button>
      </section>
      {feuilles}
    </>
  );

  return (
    <>
      {entete && createPortal(<button type="button" className="pilule-entete" onClick={() => setDepense(true)}><Plus size={17} strokeWidth={2.4} />Dépense</button>, entete)}
      <div className="budget-mois" role="group" aria-label="Choisir le mois">
        <button type="button" aria-label="Mois d'avant" onClick={() => { vibrer(4); setDecalage(decalage - 1); }}><ChevronLeft size={18} strokeWidth={2.4} animated={false} /></button>
        <div><b>{nomMois(mois)}</b><small>{periode(mois)}</small></div>
        <button type="button" aria-label="Mois suivant" disabled={decalage >= 1} onClick={() => { vibrer(4); setDecalage(decalage + 1); }}><ChevronRight size={18} strokeWidth={2.4} animated={false} /></button>
        {decalage !== 0 && <button type="button" className="bouton-texte" onClick={() => setDecalage(0)}>Revenir à ce mois</button>}
      </div>
      {/* Les parties : trois mots et une goutte de verre, comme dans l'Agenda (règle de Dany pour toute l'app). */}
      <div className="agenda-barre">
        <div className="vues" role="tablist" aria-label="Partie du budget" style={{ "--i": PARTIES.indexOf(partie) } as React.CSSProperties}>
          <span className="vues-goutte" aria-hidden="true" />
          {PARTIES.map((p) => <button key={p} type="button" role="tab" aria-selected={partie === p} onClick={() => { vibrer(4); poserReglage("budgetPartie", p); }}>{NOM_PARTIE[p]}</button>)}
        </div>
        <button type="button" className="rond-horaires budget-nous" aria-label={aRendre ? `Entre nous : ${chf(aRendre)} francs à rendre` : "Entre nous"} onClick={() => setEntreNous(true)}>
          <Users size={19} strokeWidth={1.8} />{aRendre > 0 && <i aria-hidden="true" />}
        </button>
      </div>
      {partie === "charges" ? <Charges {...vue} onChacun={setChacun} onNouveau={setNouveau} onGroupe={setGroupe} />
        : partie === "comptes" ? <Comptes {...vue} soldes={soldes} onSolde={setSolde} onNouveau={setNouveau} />
        : <Mois {...vue} depenses={depenses} categories={categories} apayer={apayer} today={today} onChacun={setChacun} onPartie={(p) => poserReglage("budgetPartie", p)} />}
      {feuilles}
    </>
  );
}
