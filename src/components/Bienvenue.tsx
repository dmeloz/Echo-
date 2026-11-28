import { Hand, Lock, Menu, Plus, Sun } from "pulsoicon-react";
import { useState, type ComponentType } from "react";
import { autrePrenom, type Noms, type Personne } from "../lib/types";
import { choisirProprio, enregistrerNoms, marquerGuide, poserReglage } from "../data/hooks";
import { Connexion } from "./Connexion";

// Le premier lancement : le prénom de celui qui tient le téléphone (une seule fois, définitif),
// puis relier le téléphone au foyer, puis un petit guide en 5 pages (qu'on peut revoir depuis Réglages).

interface PageGuide { Icone: ComponentType<{ size?: number; strokeWidth?: number; play?: boolean; autoAnimated?: boolean }>; titre: string; texte: string[] }

const guide = (noms: Noms, proprio: Personne): PageGuide[] => {
  const autre = proprio === "moi" ? noms.elle : noms.moi;
  return [
    { Icone: Sun, titre: "Aujourd'hui", texte: ["En haut, une phrase résume ta journée.", "La carte « En premier » montre la chose à faire maintenant. En dessous, la suite de la journée."] },
    { Icone: Plus, titre: "Ajouter en une phrase", texte: ["Tape dans la barre en bas, comme tu parles :", "« vétérinaire demain 15h pour nous »", `Echo comprend le jour, l'heure et pour qui : pour toi, pour ${autre} ou pour vous deux.`] },
    { Icone: Hand, titre: "Les gestes", texte: ["Touche le rond pour cocher une tâche. Tu peux toujours annuler.", "Glisse une tâche vers la droite pour la rendre importante, vers la gauche pour la mettre à plus tard.", "Touche une tâche pour la modifier, ajouter des étapes ou une photo."] },
    { Icone: Menu, titre: "Le menu", texte: ["Le bouton rond en bas à droite ouvre le menu. Tu peux aussi tirer la page vers la gauche.", "Cuisine, Maison et Budget arrivent bientôt, un module à la fois."] },
    { Icone: Lock, titre: "Vos données", texte: ["Tout est gardé sur ce téléphone, Echo marche même sans réseau.", `Une fois le foyer relié, ce que tu ajoutes ou termines arrive aussi chez ${autre}. Seuls vous deux y avez accès.`] },
  ];
};

export function Bienvenue({ noms, proprio, onFini }: { noms: Noms; proprio: Personne | null; onFini: () => void }) {
  const [moi, setMoi] = useState<Personne | null>(proprio);
  const [prenom, setPrenom] = useState("");
  const [relier, setRelier] = useState(false);
  const [i, setI] = useState(0);

  if (!moi) {
    const p = prenom.trim();
    const valider = async () => {
      if (!p) return;
      // Ce téléphone prend la première place ; en rejoignant un foyer, il prendra la place libre.
      await enregistrerNoms({ moi: p, elle: autrePrenom(p) });
      await choisirProprio("moi");
      await poserReglage("connexionProposee", true);
      setMoi("moi"); setRelier(true);
    };
    return (
      <div className="bienvenue" role="dialog" aria-modal="true" aria-labelledby="bv-titre">
        <form className="bv-corps" onSubmit={(e) => { e.preventDefault(); valider(); }}>
          <div className="bv-logo" aria-hidden="true" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}favicon.svg)` }} />
          <h1 id="bv-titre">Bienvenue dans Echo</h1>
          <p>L'app de votre foyer.<br />Comment tu t'appelles ?</p>
          <input className="saisie" autoComplete="given-name" autoCapitalize="words" maxLength={24} placeholder="Ton prénom" aria-label="Ton prénom" value={prenom} onChange={(e) => setPrenom(e.target.value)} />
          <button className="bouton" disabled={!p}>Continuer</button>
          <p className="bv-petit">Ton prénom ne se change plus ensuite : c'est celui que l'autre verra.</p>
        </form>
      </div>
    );
  }
  if (relier) return <Connexion prenom={noms[moi]} proprio={moi} onFini={() => setRelier(false)} onPlusTard={() => setRelier(false)} />;

  const qui = proprio ?? moi; // la place a pu changer en rejoignant le foyer
  const pages = guide(noms, qui);
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
          <button className="bouton" onClick={() => (i < pages.length - 1 ? setI(i + 1) : fin())}>{i < pages.length - 1 ? "Suivant" : `C'est parti, ${noms[qui]} !`}</button>
        </div>
      </div>
    </div>
  );
}
