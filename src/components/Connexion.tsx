import { Copy, Home, Link, Share, Share2, Users } from "pulsoicon-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { lienInvitation, oublierInvitation } from "../lib/invitation";
import type { Personne } from "../lib/types";
import { creerFoyer, inviter, rejoindreFoyer } from "../sync/moteur";

// Relier ce téléphone au foyer, sans e-mail ni mot de passe : le premier crée le foyer et reçoit un code
// à 6 chiffres (valable 1 heure), l'autre entre ce code sur son téléphone. Le même chemin sert après un changement de téléphone.

type Etape = "foyer" | "rejoindre" | "inviter";

// rejoindreSeulement : ce téléphone était déjà dans un foyer (il a perdu sa connexion). Il ne doit pas en créer
// un deuxième par erreur : il rejoint le sien avec un code créé sur l'autre téléphone.
// demanderPrenom : ceux qui avaient Echo avant la synchro confirment leur prénom ici (il devient définitif).
// codeRecu : Echo a été ouvert par un lien d'invitation (src/lib/invitation.ts) ; on arrive sur « Rejoindre », code déjà écrit.
export function Connexion({ prenom: prenomConnu, proprio, onFini, onPlusTard, rejoindreSeulement = false, demanderPrenom = false, codeRecu }: { prenom: string; proprio: Personne; onFini: () => void; onPlusTard?: () => void; rejoindreSeulement?: boolean; demanderPrenom?: boolean; codeRecu?: string | null }) {
  const [prenomSaisi, setPrenomSaisi] = useState(demanderPrenom ? "" : prenomConnu);
  const prenom = prenomSaisi.trim();
  const [etape, setEtape] = useState<Etape>(rejoindreSeulement || codeRecu ? "rejoindre" : "foyer");
  const [code, setCode] = useState(codeRecu ?? "");
  // Fini ou « Plus tard » : le code du lien a servi, il ne revient pas.
  const fini = () => { oublierInvitation(); onFini(); };
  const plusTard = onPlusTard && (() => { oublierInvitation(); onPlusTard(); });
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
  const rejoindre = (c: string) => essayer(async () => { await rejoindreFoyer(c, prenom); toast("Bienvenue dans le foyer !"); fini(); });

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
      {plusTard && <button type="button" className="bouton-texte" onClick={plusTard}>Plus tard</button>}
    </div>
  );
  else if (etape === "rejoindre") corps = (
    <form className="bv-corps" onSubmit={(e: FormEvent) => { e.preventDefault(); rejoindre(code); }}>
      <span className="bv-icone" aria-hidden="true"><Users size={30} strokeWidth={2} /></span>
      <h1 id="cx-titre">Rejoindre le foyer</h1>
      <p>{codeRecu && code === codeRecu ? "Le code de ton invitation est déjà écrit." : "Écris le code affiché sur l'autre téléphone (Réglages, partie Foyer)."}</p>
      {(rejoindreSeulement || codeRecu) && champPrenom}
      {/* one-time-code : l'iPhone propose le code reçu par message, au-dessus du clavier. */}
      <input className="saisie bv-code" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" aria-label="Code d'invitation" autoFocus={!codeRecu}
        value={code} onChange={(e) => { const c = chiffres(e.target.value); setCode(c); if (c.length === 6 && prenom) rejoindre(c); }} />
      {erreurs}
      <button className="bouton" disabled={occupe || code.length < 6 || !prenom}>{occupe ? "Un instant…" : "Rejoindre"}</button>
      {rejoindreSeulement
        ? plusTard && <button type="button" className="bouton-texte" onClick={plusTard}>Plus tard</button>
        : <button type="button" className="bouton-texte" onClick={() => { setErreur(""); setEtape("foyer"); }}>Retour</button>}
    </form>
  );
  else corps = (
    <div className="bv-corps">
      <span className="bv-icone" aria-hidden="true"><Users size={30} strokeWidth={2} /></span>
      <h1 id="cx-titre">Le foyer est prêt</h1>
      <p>Envoie le lien à l'autre : il ouvre Echo avec le code déjà écrit. Ou donne le code : dans Echo, son prénom, puis « J'ai un code ».</p>
      <CodeInvitation code={invitation} />
      <button className="bouton" onClick={fini}>Continuer</button>
    </div>
  );

  return <div className="bienvenue" role="dialog" aria-modal="true" aria-labelledby="cx-titre">{corps}</div>;
}
// Le code à donner, et deux façons de l'envoyer par la feuille de partage du téléphone (Messages, WhatsApp…) :
// le lien, qui ouvre Echo avec le code déjà écrit, ou le code seul. Sans feuille de partage (ordinateur), on copie.
// Echo n'envoie rien lui-même : c'est toi qui choisis à qui.
export function CodeInvitation({ code }: { code: string }) {
  const lien = lienInvitation(code);
  const adresse = lien.slice(0, lien.indexOf("#"));
  const partage = "share" in navigator;
  const [copie, copier] = useCopie();
  const envoyer = (texte: string, url: string, quoi: "lien" | "code") => {
    if (partage) navigator.share({ text: texte, url }).catch(() => {});
    else copier(quoi === "lien" ? lien : code, quoi);
  };
  return (
    <div className="invitation">
      <AfficheCode code={code} />
      <small>Valable 1 heure, une seule fois.</small>
      <div className="rangee">
        <button type="button" className="bouton second" onClick={() => envoyer(`Rejoins notre foyer dans Echo. Le code : ${code}`, lien, "lien")}>
          <Link size={18} strokeWidth={2} /> {partage ? "Envoyer le lien" : copie === "lien" ? "Lien copié" : "Copier le lien"}
        </button>
        <button type="button" className="bouton second" onClick={() => envoyer(`Rejoins notre foyer dans Echo avec ce code : ${code}`, adresse, "code")}>
          <Share2 size={18} strokeWidth={2} /> {partage ? "Envoyer le code" : copie === "code" ? "Code copié" : "Copier le code"}
        </button>
      </div>
    </div>
  );
}

const AfficheCode = ({ code }: { code: string }) => <b aria-label={`Code d'invitation ${code.split("").join(" ")}`}>{code.slice(0, 3)} {code.slice(3)}</b>;

// Copier, et le dire sur le bouton lui-même pendant 2 secondes : un message en bas cacherait les boutons de ces pages.
function useCopie() {
  const [copie, setCopie] = useState<string | null>(null);
  const minuterie = useRef(0);
  useEffect(() => () => clearTimeout(minuterie.current), []);
  const copier = (texte: string, quoi: string) => {
    const rate = () => toast("Copie impossible ici. Recopie-le à la main.");
    if (!navigator.clipboard) { rate(); return; }
    navigator.clipboard.writeText(texte).then(() => {
      setCopie(quoi);
      clearTimeout(minuterie.current);
      minuterie.current = window.setTimeout(() => setCopie(null), 2000);
    }, rate);
  };
  return [copie, copier] as const;
}

// Le lien ouvert dans Safari sur iPhone ou iPad. Echo se rejoint depuis l'écran d'accueil (c'est là qu'il garde
// le foyer et envoie les rappels), et Safari ne lui passe rien : le code passe par « Copier », puis se colle dans Echo.
export function InvitationSafari({ code, onIci }: { code: string; onIci: () => void }) {
  const [copie, copier] = useCopie();
  return (
    <div className="bienvenue" role="dialog" aria-modal="true" aria-labelledby="is-titre">
      <div className="bv-corps">
        <span className="bv-icone" aria-hidden="true"><Users size={30} strokeWidth={2} /></span>
        <h1 id="is-titre">On t'invite dans Echo</h1>
        <p>D'abord, installe Echo sur ton écran d'accueil :</p>
        <ol className="installer">
          <li><span>Touche <Share size={18} strokeWidth={2} aria-hidden="true" /> <b>Partager</b> en bas de Safari (parfois sous « ••• »).</span></li>
          <li><span>Choisis <b>Sur l'écran d'accueil</b>, puis <b>Ajouter</b>.</span></li>
          <li><span>Ouvre Echo depuis l'écran d'accueil, écris ton prénom, touche <b>J'ai un code</b> et colle ce code.</span></li>
        </ol>
        <div className="invitation">
          <AfficheCode code={code} />
          <small>Valable 1 heure, une seule fois.</small>
          <button type="button" className="bouton second" onClick={() => copier(code, "code")}><Copy size={18} strokeWidth={2} /> {copie ? "Code copié" : "Copier le code"}</button>
        </div>
        <button type="button" className="bouton-texte" onClick={onIci}>Continuer dans Safari</button>
      </div>
    </div>
  );
}
