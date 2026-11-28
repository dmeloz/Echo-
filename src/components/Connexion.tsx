import { Home, Share2, Users } from "pulsoicon-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import type { Personne } from "../lib/types";
import { creerFoyer, inviter, rejoindreFoyer } from "../sync/moteur";

// Relier ce téléphone au foyer, sans e-mail ni mot de passe : le premier crée le foyer et reçoit un code
// à 6 chiffres (valable 1 heure), l'autre entre ce code sur son téléphone. Le même chemin sert après un changement de téléphone.

type Etape = "foyer" | "rejoindre" | "inviter";

// rejoindreSeulement : ce téléphone était déjà dans un foyer (il a perdu sa connexion). Il ne doit pas en créer
// un deuxième par erreur : il rejoint le sien avec un code créé sur l'autre téléphone.
// demanderPrenom : ceux qui avaient Echo avant la synchro confirment leur prénom ici (il devient définitif).
export function Connexion({ prenom: prenomConnu, proprio, onFini, onPlusTard, rejoindreSeulement = false, demanderPrenom = false }: { prenom: string; proprio: Personne; onFini: () => void; onPlusTard?: () => void; rejoindreSeulement?: boolean; demanderPrenom?: boolean }) {
  const [prenomSaisi, setPrenomSaisi] = useState(demanderPrenom ? "" : prenomConnu);
  const prenom = prenomSaisi.trim();
  const [etape, setEtape] = useState<Etape>(rejoindreSeulement ? "rejoindre" : "foyer");
  const [code, setCode] = useState("");
  const [invitation, setInvitation] = useState("");
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState(false);

  const essayer = async (fn: () => Promise<void>) => {
    if (occupe) return;
    setOccupe(true); setErreur("");
    try { await fn(); } catch (e) { setErreur(e instanceof Error ? e.message : "Ça n'a pas marché. Réessaie."); }
    setOccupe(false);
  };
  const chiffres = (v: string) => v.replace(/\D/g, "").slice(0, 6);
  const champPrenom = demanderPrenom && (
    <input className="saisie" autoComplete="given-name" autoCapitalize="words" maxLength={24} placeholder="Ton prénom" aria-label="Ton prénom"
      value={prenomSaisi} onChange={(e) => setPrenomSaisi(e.target.value)} />
  );
  const creer = () => essayer(async () => { await creerFoyer(prenom, proprio); setInvitation(await inviter()); setEtape("inviter"); });
  const rejoindre = (c: string) => essayer(async () => { await rejoindreFoyer(c, prenom); toast("Bienvenue dans le foyer !"); onFini(); });

  const erreurs = erreur && <p className="bv-erreur" role="alert">{erreur}</p>;
  let corps: ReactNode;
  if (etape === "foyer") corps = (
    <div className="bv-corps">
      <span className="bv-icone" aria-hidden="true"><Home size={30} strokeWidth={2} /></span>
      <h1 id="cx-titre">Votre foyer</h1>
      <p>Pour partager vos tâches entre vos deux téléphones. Le premier crée le foyer et reçoit un code à 6 chiffres ; l'autre entre ce code sur son téléphone.</p>
      {champPrenom && <p><b>D'abord, ton prénom</b> (celui de la personne qui tient ce téléphone) :</p>}
      {champPrenom}
      {erreurs}
      <button className="bouton" disabled={occupe || !prenom} onClick={creer}>{occupe ? "Création…" : "Créer notre foyer"}</button>
      <button className="bouton second" disabled={occupe || !prenom} onClick={() => { setErreur(""); setCode(""); setEtape("rejoindre"); }}>J'ai un code</button>
      {onPlusTard && <button type="button" className="bouton-texte" onClick={onPlusTard}>Plus tard</button>}
    </div>
  );
  else if (etape === "rejoindre") corps = (
    <form className="bv-corps" onSubmit={(e: FormEvent) => { e.preventDefault(); rejoindre(code); }}>
      <span className="bv-icone" aria-hidden="true"><Users size={30} strokeWidth={2} /></span>
      <h1 id="cx-titre">Rejoindre le foyer</h1>
      <p>Écris le code affiché sur l'autre téléphone (Réglages, partie Foyer).</p>
      {rejoindreSeulement && champPrenom}
      <input className="saisie bv-code" inputMode="numeric" placeholder="000000" aria-label="Code d'invitation" autoFocus
        value={code} onChange={(e) => { const c = chiffres(e.target.value); setCode(c); if (c.length === 6 && prenom) rejoindre(c); }} />
      {erreurs}
      <button className="bouton" disabled={occupe || code.length < 6 || !prenom}>{occupe ? "Un instant…" : "Rejoindre"}</button>
      {rejoindreSeulement
        ? onPlusTard && <button type="button" className="bouton-texte" onClick={onPlusTard}>Plus tard</button>
        : <button type="button" className="bouton-texte" onClick={() => { setErreur(""); setEtape("foyer"); }}>Retour</button>}
    </form>
  );
  else corps = (
    <div className="bv-corps">
      <span className="bv-icone" aria-hidden="true"><Users size={30} strokeWidth={2} /></span>
      <h1 id="cx-titre">Le foyer est prêt</h1>
      <p>Sur l'autre téléphone : ouvrir Echo, écrire son prénom, puis « J'ai un code ».</p>
      <CodeInvitation code={invitation} />
      <button className="bouton" onClick={onFini}>Continuer</button>
    </div>
  );

  return <div className="bienvenue" role="dialog" aria-modal="true" aria-labelledby="cx-titre">{corps}</div>;
}
export function CodeInvitation({ code }: { code: string }) {
  const texte = `Rejoins notre foyer dans Echo avec ce code : ${code}\nhttps://dmeloz.github.io/Echo-/`;
  return (
    <div className="invitation">
      <b aria-label={`Code d'invitation ${code.split("").join(" ")}`}>{code.slice(0, 3)} {code.slice(3)}</b>
      <small>Valable 1 heure, une seule fois.</small>
      {"share" in navigator && (
        <button type="button" className="bouton second" onClick={() => navigator.share({ text: texte }).catch(() => {})}><Share2 size={18} strokeWidth={2} /> Envoyer le code</button>
      )}
    </div>
  );
}
