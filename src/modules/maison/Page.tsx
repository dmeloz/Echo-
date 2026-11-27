import { useLiveQuery } from "dexie-react-hooks";
import { Check, ChevronRight, Plus } from "pulsoicon-react";
import { useEffect, useState } from "react";
import { db } from "../../data/db";
import { poserReglage, useReglage } from "../../data/hooks";
import { libelleJour } from "../../lib/dates";
import { vibrer } from "../../lib/gestes";
import { autre, type Personne } from "../../lib/types";
import type { ContexteModule } from "../contrat";
import { ajouterCorvees, ajouterModeles, changerCorvee, cocherCorvee, rangerFaits, reporterCorvee, retirerCorvee } from "./actions";
import { DEPART, RYTHMES, TAILLES, aFaire, besoin, deborde, depuis, equilibre, jourDu, lireCorvee, minutesDe, nomRythme, parts, pour, type Corvee, type Modele, type QuiCorvee } from "./donnees";

const ETATS = ["", "Peut attendre", "Bientôt", "À faire"];
// La petite jauge d'une corvée : elle se remplit avec le temps. Rouge seulement quand elle attend depuis longtemps.
function Jauge({ c, now }: { c: Corvee; now: Date }) {
  const n = besoin(c, now), trop = deborde(c, now);
  return <i className={`jauge besoin n${n}${trop ? " deborde" : ""}`} role="img" aria-label={trop ? "Attend depuis longtemps" : ETATS[n]}><i /><i /><i /></i>;
}

// Le premier jour : on touche ce qui existe chez soi, au lieu d'écrire une liste.
function Depart({ onFini }: { onFini: () => void }) {
  const [choisis, setChoisis] = useState<string[]>(() => DEPART.flatMap((g) => g.modeles.filter((m) => m.choisi).map((m) => m.nom)));
  const basculer = (nom: string) => setChoisis((c) => (c.includes(nom) ? c.filter((x) => x !== nom) : [...c, nom]));
  const n = choisis.length;
  const commencer = () => ajouterModeles(DEPART.flatMap((g) => g.modeles).filter((m: Modele) => choisis.includes(m.nom))).then(onFini);
  return (
    <div className="reglage-page maison-depart">
      <h2 className="reglage-titre">Chez vous, qu'est-ce qui revient ?</h2>
      <p className="phrase">Touche ce que vous faites déjà. Echo propose un rythme, tu le changes quand tu veux.</p>
      {DEPART.map((g) => (
        <div className="champ" key={g.titre}>
          <span className="lab">{g.titre}</span>
          <div className="rangee">{g.modeles.map((m) => <button key={m.nom} type="button" className="puce" aria-pressed={choisis.includes(m.nom)} onClick={() => { vibrer(); basculer(m.nom); }}>{m.nom}</button>)}</div>
        </div>
      ))}
      <div className="rangee gouts-pied">
        <button type="button" className="bouton-texte" onClick={onFini}>Plus tard</button>
        <button type="button" className="bouton" disabled={!n} onClick={commencer}>{n > 1 ? `Commencer avec ${n} corvées` : n ? "Commencer avec 1 corvée" : "Choisis une corvée"}</button>
      </div>
    </div>
  );
}

// Les réglages d'une corvée, sous sa ligne : son rythme, sa taille, qui s'en occupe.
function Detail({ c, noms, proprio, now, onFermer }: Pick<ContexteModule, "noms" | "proprio" | "now"> & { c: Corvee; onFermer: () => void }) {
  const l_autre = autre(proprio);
  const rythmes = RYTHMES.some((r) => r.jours === c.tous) ? RYTHMES : [...RYTHMES, { jours: c.tous, nom: nomRythme(c.tous) }].sort((a, b) => a.jours - b.jours);
  const quis: Array<[QuiCorvee, string]> = [[proprio, noms[proprio]], [l_autre, noms[l_autre]], ["tour", "Chacun son tour"], ["echo", "Echo choisit"]];
  const aide = c.qui === "tour" ? (c.par ? `Chacun son tour : après ${c.par === proprio ? "toi" : noms[c.par]}, c'est à ${c.par === proprio ? noms[l_autre] : "toi"}.` : "Chacun son tour : celui qui la fait passe la main à l'autre.")
    : c.qui === "echo" ? "Echo la donne à celui qui en a le moins fait ces 4 dernières semaines." : "";
  return (
    <div className="stock-plus corvee-plus">
      <span className="lab">Ça revient</span>
      <div className="stock-restes" role="group" aria-label={`Le rythme de ${c.nom}`}>
        {rythmes.map((r) => <button key={r.jours} type="button" className="puce" aria-pressed={c.tous === r.jours} onClick={() => { vibrer(); changerCorvee(c.id, { tous: r.jours }); }}>{r.nom}</button>)}
      </div>
      <span className="lab">C'est…</span>
      <div className="stock-restes" role="group" aria-label={`La taille de ${c.nom}`}>
        {TAILLES.map((t) => <button key={t.id} type="button" className="puce" aria-pressed={c.taille === t.id} onClick={() => { vibrer(); changerCorvee(c.id, { taille: t.id }); }}>{t.nom}</button>)}
      </div>
      <span className="lab">Qui s'en occupe</span>
      <div className="stock-restes" role="group" aria-label={`Qui s'occupe de ${c.nom}`}>
        {quis.map(([q, nom]) => <button key={q} type="button" className="puce" aria-pressed={c.qui === q} onClick={() => { vibrer(); changerCorvee(c.id, { qui: q }); }}>{nom}</button>)}
      </div>
      {aide && <p className="aide-champ">{aide}</p>}
      <div className="rangee corvee-gestes">
        <button type="button" className="bouton-texte" onClick={() => { onFermer(); cocherCorvee(c, l_autre, noms[l_autre]); }}>{noms[l_autre]} l'a fait</button>
        {aFaire(c, now) && <button type="button" className="bouton-texte" onClick={() => { onFermer(); reporterCorvee(c, now); }}>Pas cette fois</button>}
        <button type="button" className="bouton-texte danger" onClick={() => { onFermer(); retirerCorvee(c); }}>Retirer</button>
      </div>
    </div>
  );
}

// La page Maison. Pour l'instant : les corvées (l'entretien et les papiers arrivent avec les lots suivants).
export function PageMaison({ noms, proprio, now }: ContexteModule) {
  const corvees = useLiveQuery(() => db.maison_corvees.toArray(), [], undefined);
  const faits = useLiveQuery(() => db.maison_faits.toArray(), [], []);
  const departVu = useReglage("maisonDepartVu", false);
  const montrerEquilibre = useReglage("maisonEquilibre", true);
  const [choisir, setChoisir] = useState(false);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [voirAutres, setVoirAutres] = useState(false);
  const [texte, setTexte] = useState("");
  useEffect(() => { rangerFaits().catch(() => {}); }, []);

  if (corvees === undefined) return null;
  if (choisir || (!corvees.length && !departVu)) return <Depart onFini={() => { poserReglage("maisonDepartVu", true); setChoisir(false); }} />;

  const e = equilibre(faits, now.getTime());
  const l_autre = autre(proprio);
  const dues = corvees.filter((c) => aFaire(c, now)).sort((a, b) => jourDu(a).localeCompare(jourDu(b)) || a.nom.localeCompare(b.nom));
  const de = (p: Personne) => dues.filter((c) => pour(c, e) === p);
  const miennes = de(proprio), siennes = de(l_autre);
  const autres = corvees.filter((c) => !aFaire(c, now)).sort((a, b) => jourDu(a).localeCompare(jourDu(b)) || a.nom.localeCompare(b.nom));
  const min = miennes.reduce((s, c) => s + minutesDe(c.taille), 0);
  const p = parts(e);

  const ligne = (c: Corvee, sous: string) => (
    <li key={c.id} className={ouvert === c.id ? "ouvert" : ""}>
      <div className="corvee">
        <button type="button" className="coche" aria-label={`${c.nom} : c'est fait`} onClick={() => { vibrer(12); setOuvert(null); cocherCorvee(c, proprio); }} />
        <button type="button" className="stock-ligne" aria-expanded={ouvert === c.id} onClick={() => setOuvert(ouvert === c.id ? null : c.id)}>
          <b>{c.nom}{sous && <small>{sous}</small>}</b>
          <Jauge c={c} now={now} />
        </button>
      </div>
      {ouvert === c.id && <Detail c={c} noms={noms} proprio={proprio} now={now} onFermer={() => setOuvert(null)} />}
    </li>
  );
  const sousDue = (c: Corvee) => [c.piece, depuis(c, now)].filter(Boolean).join(" · ");
  const ajouter = () => { const lu = lireCorvee(texte); if (!lu) return; ajouterCorvees([lu]); setTexte(""); };

  return (
    <>
      {corvees.length === 0 ? (
        <section className="g vide">
          <p>Aucune corvée pour l'instant.</p>
          <button type="button" className="bouton" onClick={() => setChoisir(true)}>Choisir dans la liste</button>
        </section>
      ) : (
        <p className="phrase">
          {miennes.length ? <><b>{miennes.length > 1 ? `${miennes.length} choses pour toi` : "1 chose pour toi"}</b> aujourd'hui, {min} minutes en tout.</> : <><b>Rien pour toi</b> aujourd'hui.</>}
          {siennes.length > 0 && ` ${noms[l_autre]} en a ${siennes.length}.`}
        </p>
      )}
      {miennes.length > 0 && <section className="g liste-stock corvees"><span className="lab">Pour toi</span><ul>{miennes.map((c) => ligne(c, sousDue(c)))}</ul></section>}
      {siennes.length > 0 && <section className="g liste-stock corvees"><span className="lab">Pour {noms[l_autre]}</span><ul>{siennes.map((c) => ligne(c, sousDue(c)))}</ul></section>}
      {autres.length > 0 && (
        <section className="g liste-stock corvees">
          <button type="button" className="stock-ligne corvees-autres" aria-expanded={voirAutres} onClick={() => setVoirAutres(!voirAutres)}>
            <span className="tuile-icone" aria-hidden="true"><Check size={18} strokeWidth={2} animated={false} /></span>
            <b>{autres.length > 1 ? `${autres.length} autres peuvent attendre` : "1 autre peut attendre"}<small>{autres.slice(0, 2).map((c) => `${c.nom} ${libelleJour(jourDu(c), now).toLowerCase()}`).join(", ")}{autres.length > 2 ? "…" : ""}</small></b>
            <ChevronRight size={18} strokeWidth={2} animated={false} />
          </button>
          {voirAutres && <ul>{autres.map((c) => ligne(c, libelleJour(jourDu(c), now).toLowerCase()))}</ul>}
        </section>
      )}
      {corvees.length > 0 && (
        <form className="g ajout-courses" autoComplete="off" onSubmit={(ev) => { ev.preventDefault(); ajouter(); }}>
          <label className="vh" htmlFor="ajout-corvee">Ajouter une corvée</label>
          <input id="ajout-corvee" enterKeyHint="done" maxLength={80} placeholder="Ajouter : « litière tous les 2 jours »" value={texte} onChange={(ev) => setTexte(ev.target.value)} />
          {texte.trim() && <button type="submit" className="rond-champ plein" aria-label="Ajouter la corvée"><Plus size={20} strokeWidth={2.4} /></button>}
        </form>
      )}
      {montrerEquilibre && e.moi + e.elle > 0 && (
        <div className="equilibre" role="img" aria-label={`Ces 4 dernières semaines : ${noms[proprio]} ${p[proprio]} %, ${noms[l_autre]} ${p[l_autre]} %`}>
          <div><span><b>{noms[proprio]}</b> {p[proprio]} %</span><span>sur 4 semaines</span><span>{p[l_autre]} % <b>{noms[l_autre]}</b></span></div>
          <div className="equilibre-barre"><i style={{ flexGrow: Math.max(4, p[proprio]) }} /><i style={{ flexGrow: Math.max(4, p[l_autre]) }} /></div>
        </div>
      )}
    </>
  );
}
