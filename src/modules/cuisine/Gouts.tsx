import { useLiveQuery } from "dexie-react-hooks";
import { confirmer } from "../../lib/messages";
import { useState } from "react";
import { toast } from "sonner";
import { db } from "../../data/db";
import type { Personne } from "../../lib/types";
import type { ContexteModule } from "../contrat";
import { enregistrerGouts } from "./actions";
import type { Gouts, Rechauffe } from "./donnees";

const ENVIES = ["Poulet", "Bœuf", "Poisson", "Végétarien", "Pâtes", "Riz", "Légumes", "Soupes", "Salades", "Épicé", "Plats mijotés", "Cuisine du monde"];
const CHAUFFE: Array<[Rechauffe, string]> = [["oui", "Oui"], ["non", "Non"], ["pas", "Je ne mange pas au travail"]];

// Le questionnaire des goûts : trois questions, une fois par personne. Il servira à Echo pour proposer les repas.
export function FormGouts({ qui, depart, onFini, onPlusTard }: { qui: Personne; depart: Gouts | null; onFini: () => void; onPlusTard?: () => void }) {
  const [aime, setAime] = useState<string[]>(depart?.aime ?? []);
  const [evite, setEvite] = useState(depart?.evite ?? "");
  const [rechauffe, setRechauffe] = useState<Rechauffe>(depart?.rechauffe ?? "");
  const basculer = (e: string) => setAime((a) => (a.includes(e) ? a.filter((x) => x !== e) : [...a, e]));
  return (
    <form className="gouts-form" onSubmit={(e) => { e.preventDefault(); enregistrerGouts({ qui, aime, evite: evite.trim(), rechauffe }).then(onFini); }}>
      <div className="champ">
        <span className="lab">Ce que tu aimes manger</span>
        <div className="rangee">{ENVIES.map((e) => <button key={e} type="button" className="puce" aria-pressed={aime.includes(e)} onClick={() => basculer(e)}>{e}</button>)}</div>
      </div>
      <div className="champ">
        <label htmlFor="gouts-evite">Ce que tu n'aimes pas ou ne manges pas</label>
        <input id="gouts-evite" className="saisie" value={evite} onChange={(e) => setEvite(e.target.value)} placeholder="Champignons, fruits de mer…" maxLength={200} />
        <span className="aide-champ">Pas de porc : c'est déjà noté pour le foyer.</span>
      </div>
      <div className="champ">
        <span className="lab">Le midi au travail, tu peux réchauffer ton repas ?</span>
        <div className="rangee">{CHAUFFE.map(([v, l]) => <button key={v} type="button" className="puce" aria-pressed={rechauffe === v} onClick={() => setRechauffe(v)}>{l}</button>)}</div>
      </div>
      <div className="rangee gouts-pied">
        {onPlusTard && <button type="button" className="bouton-texte" onClick={onPlusTard}>Plus tard</button>}
        <button type="submit" className="bouton">Enregistrer</button>
      </div>
    </form>
  );
}

// La première fois qu'on ouvre Cuisine : le questionnaire arrive en popup.
export function PopupGouts({ noms, proprio, onFini }: ContexteModule & { onFini: () => void }) {
  return (
    <>
      <div className="resume-fond" aria-hidden="true" />
      <div className="gouts" role="dialog" aria-modal="true" aria-labelledby="gouts-titre">
        <h2 id="gouts-titre">Tes goûts, {noms[proprio]}</h2>
        <p>Trois questions pour qu'Echo propose des repas qui te plaisent. Tu pourras changer tes réponses dans les Réglages.</p>
        <FormGouts qui={proprio} depart={null} onFini={() => { onFini(); toast("C'est noté"); }} onPlusTard={onFini} />
      </div>
    </>
  );
}

// Dans les Réglages : les mêmes questions, avec les réponses déjà données.
export function GoutsReglages({ proprio }: { proprio: Personne }) {
  const g = useLiveQuery(async () => (await db.cuisine_gouts.get(proprio)) ?? null, [proprio], undefined);
  if (g === undefined) return null;
  return <FormGouts key={g?.maj ?? 0} qui={proprio} depart={g} onFini={() => confirmer("Enregistré")} />;
}
