import { Hand, Lock, Menu, Plus, Sun } from "pulsoicon-react";
import { useState, type ComponentType } from "react";
import type { Noms, Personne } from "../lib/types";
import { choisirProprio, marquerGuide } from "../data/hooks";

// Le premier lancement : d'abord « c'est le téléphone de qui ? », puis un petit guide en 5 pages.
// Le guide peut être revu depuis Réglages.

interface PageGuide { Icone: ComponentType<{ size?: number; strokeWidth?: number; play?: boolean; autoAnimated?: boolean }>; titre: string; texte: string[] }

const guide = (noms: Noms, proprio: Personne): PageGuide[] => {
  const autre = proprio === "moi" ? noms.elle : noms.moi;
  return [
    { Icone: Sun, titre: "Aujourd'hui", texte: ["En haut, une phrase résume ta journée.", "La carte « En premier » montre la chose à faire maintenant. En dessous, la suite de la journée."] },
    { Icone: Plus, titre: "Ajouter en une phrase", texte: ["Tape dans la barre en bas, comme tu parles :", "« vétérinaire demain 15h pour nous »", `Echo comprend le jour, l'heure et pour qui : pour toi, pour ${autre} ou pour vous deux.`] },
    { Icone: Hand, titre: "Les gestes", texte: ["Touche le rond pour cocher une tâche. Tu peux toujours annuler.", "Glisse une tâche vers la droite pour la rendre importante, vers la gauche pour la mettre à plus tard.", "Touche une tâche pour la modifier, ajouter des étapes ou une photo."] },
    { Icone: Menu, titre: "Le menu", texte: ["Le bouton rond en bas à droite ouvre le menu. Tu peux aussi tirer la page vers la gauche.", "Cuisine, Maison et Budget arrivent bientôt, un module à la fois."] },
    { Icone: Lock, titre: "Tes données", texte: ["Pour l'instant, tout reste sur ce téléphone. Rien n'est envoyé ailleurs.", `Le partage avec ${autre} arrivera avec la synchro. En attendant, tu peux faire une sauvegarde dans Réglages.`] },
  ];
};

export function Bienvenue({ noms, proprio, onFini }: { noms: Noms; proprio: Personne | null; onFini: () => void }) {
  const [moi, setMoi] = useState<Personne | null>(proprio);
  const [i, setI] = useState(0);

  if (!moi) {
    return (
      <div className="bienvenue" role="dialog" aria-modal="true" aria-labelledby="bv-titre">
        <div className="bv-corps">
          <div className="bv-logo" aria-hidden="true" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}favicon.svg)` }} />
          <h1 id="bv-titre">Bienvenue dans Echo</h1>
          <p>L'app de votre foyer, à deux.<br />C'est le téléphone de qui ?</p>
          <div className="bv-choix">
            {(["moi", "elle"] as Personne[]).map((p) => (
              <button key={p} className={`bv-personne ${p}`} onClick={() => { choisirProprio(p); setMoi(p); }}>
                <i aria-hidden="true">{(noms[p].trim()[0] || "?").toUpperCase()}</i>{noms[p]}
              </button>
            ))}
          </div>
          <p className="bv-petit">Tu pourras changer les prénoms dans Réglages.</p>
        </div>
      </div>
    );
  }

  const pages = guide(noms, moi);
  const pg = pages[i];
  const fin = () => { marquerGuide(true); onFini(); };
  return (
    <div className="bienvenue" role="dialog" aria-modal="true" aria-labelledby="bv-titre">
      <div className="bv-corps" key={i}>
        <span className="bv-icone" aria-hidden="true"><pg.Icone size={30} strokeWidth={2} autoAnimated={false} play /></span>
        <h1 id="bv-titre">{pg.titre}</h1>
        {pg.texte.map((t) => <p key={t} className={t.startsWith("«") ? "bv-exemple" : undefined}>{t}</p>)}
      </div>
      <div className="bv-pied">
        <div className="bv-points" aria-label={`Page ${i + 1} sur ${pages.length}`}>
          {pages.map((_, k) => <i key={k} className={k === i ? "on" : undefined} />)}
        </div>
        <div className="bv-boutons">
          {i < pages.length - 1 && <button className="bouton-texte" onClick={fin}>Passer</button>}
          <button className="bouton" onClick={() => (i < pages.length - 1 ? setI(i + 1) : fin())}>{i < pages.length - 1 ? "Suivant" : `C'est parti, ${noms[moi]} !`}</button>
        </div>
      </div>
    </div>
  );
}
