import { vibrer } from "../../lib/gestes";
import { autre } from "../../lib/types";
import type { ContexteModule } from "../contrat";
import { changerCorvee, cocherCorvee, reporterCorvee, retirerCorvee } from "./actions";
import { RYTHMES, RYTHMES_ENTRETIEN, TAILLES, aFaire, besoin, deborde, nomRythme, type Corvee, type QuiCorvee } from "./donnees";

// La ligne d'une corvée (ou d'un geste d'entretien) : le rond, le nom, son état, et ses réglages quand on la touche.

// L'état d'une corvée, en un mot : rien tant qu'elle peut attendre, « Bientôt », « À faire », puis « Attend » quand elle déborde.
// (Pas de jauge ici : dans le Stock de Cuisine, une jauge pleine veut dire « il en reste ».)
function Etat({ c, now }: { c: Corvee; now: Date }) {
  const n = besoin(c, now);
  if (n === 1) return null;
  return deborde(c, now) ? <span className="compte attend">Attend</span> : <span className={`compte${n === 3 ? " en-cours" : ""}`}>{n === 3 ? "À faire" : "Bientôt"}</span>;
}

// Les réglages d'une corvée, sous sa ligne : son rythme, sa taille, qui s'en occupe.
function Detail({ c, noms, proprio, now, onFermer }: Pick<ContexteModule, "noms" | "proprio" | "now"> & { c: Corvee; onFermer: () => void }) {
  const l_autre = autre(proprio);
  const base = c.entretien ? RYTHMES_ENTRETIEN : RYTHMES;
  const rythmes = base.some((r) => r.jours === c.tous) ? base : [...base, { jours: c.tous, nom: nomRythme(c.tous) }].sort((a, b) => a.jours - b.jours);
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

type Ctx = Pick<ContexteModule, "noms" | "proprio" | "now">;
export function LigneCorvee({ c, sous, ouvert, onOuvrir, ...ctx }: Ctx & { c: Corvee; sous: string; ouvert: boolean; onOuvrir: (id: string | null) => void }) {
  return (
    <li className={ouvert ? "ouvert" : ""}>
      <div className="corvee">
        <button type="button" className="coche" aria-label={`${c.nom} : c'est fait`} onClick={() => { vibrer(12); onOuvrir(null); cocherCorvee(c, ctx.proprio); }} />
        <button type="button" className="stock-ligne" aria-expanded={ouvert} onClick={() => onOuvrir(ouvert ? null : c.id)}>
          <b>{c.nom}{sous && <small>{sous}</small>}</b>
          <Etat c={c} now={ctx.now} />
        </button>
      </div>
      {ouvert && <Detail c={c} {...ctx} onFermer={() => onOuvrir(null)} />}
    </li>
  );
}
