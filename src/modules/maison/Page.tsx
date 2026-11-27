import { useLiveQuery } from "dexie-react-hooks";
import { Check, ChevronRight, Plus } from "pulsoicon-react";
import { useEffect, useState } from "react";
import { db } from "../../data/db";
import { poserReglage, useReglage } from "../../data/hooks";
import { libelleJour } from "../../lib/dates";
import { vibrer } from "../../lib/gestes";
import { autre, type Personne } from "../../lib/types";
import type { ContexteModule } from "../contrat";
import { ajouterCorvees, ajouterModeles, rangerFaits, rangerReparations } from "./actions";
import { LigneCorvee } from "./Corvee";
import { Entretien } from "./Entretien";
import { DEPART, aFaire, depuis, equilibre, jourDu, lireCorvee, minutesDe, parts, pour, type Corvee, type Modele } from "./donnees";

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

// La page Maison : les corvées et l'entretien (les papiers arrivent avec le lot suivant).
export function PageMaison(ctx: ContexteModule) {
  const { noms, proprio, now } = ctx;
  const toutes = useLiveQuery(() => db.maison_corvees.toArray(), [], undefined);
  const partie = useReglage<"corvees" | "entretien">("maisonPartie", "corvees");
  const faits = useLiveQuery(() => db.maison_faits.toArray(), [], []);
  const departVu = useReglage("maisonDepartVu", false);
  const montrerEquilibre = useReglage("maisonEquilibre", true);
  const [choisir, setChoisir] = useState(false);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [voirAutres, setVoirAutres] = useState(false);
  const [texte, setTexte] = useState("");
  useEffect(() => { rangerFaits().then(() => rangerReparations()).catch(() => {}); }, []);
  useEffect(() => { document.querySelector(".defile")?.scrollTo(0, 0); }, [partie]);

  if (toutes === undefined) return null;
  const corvees = toutes.filter((c) => !c.entretien);
  const choix = (
    <div className="vue-choix" role="group" aria-label="Partie de la maison">
      {([["corvees", "Corvées"], ["entretien", "Entretien"]] as const).map(([id, nom]) => <button key={id} type="button" aria-pressed={partie === id} onClick={() => poserReglage("maisonPartie", id)}>{nom}</button>)}
    </div>
  );
  if (partie === "entretien") return <Entretien {...ctx} corvees={toutes} choix={choix} />;
  if (choisir || (!corvees.length && !departVu)) return <Depart onFini={() => { poserReglage("maisonDepartVu", true); setChoisir(false); }} />;

  const e = equilibre(faits, now.getTime());
  const l_autre = autre(proprio);
  const dues = corvees.filter((c) => aFaire(c, now)).sort((a, b) => jourDu(a).localeCompare(jourDu(b)) || a.nom.localeCompare(b.nom));
  const de = (p: Personne) => dues.filter((c) => pour(c, e) === p);
  const miennes = de(proprio), siennes = de(l_autre);
  const autres = corvees.filter((c) => !aFaire(c, now)).sort((a, b) => jourDu(a).localeCompare(jourDu(b)) || a.nom.localeCompare(b.nom));
  const min = miennes.reduce((s, c) => s + minutesDe(c.taille), 0);
  const p = parts(e);

  const ligne = (c: Corvee, sous: string) => <LigneCorvee key={c.id} c={c} sous={sous} ouvert={ouvert === c.id} onOuvrir={setOuvert} noms={noms} proprio={proprio} now={now} />;
  const sousDue = (c: Corvee) => [c.piece, depuis(c, now)].filter(Boolean).join(" · ");
  const ajouter = () => { const lu = lireCorvee(texte); if (!lu) return; ajouterCorvees([lu]); setTexte(""); };

  return (
    <>
      {choix}
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
