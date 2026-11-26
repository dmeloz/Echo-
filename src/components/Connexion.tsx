import { Home, Mail, Share2, Users } from "pulsoicon-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import type { Personne } from "../lib/types";
import { creerFoyer, envoyerCode, inviter, rejoindreFoyer, verifierCode } from "../sync/moteur";

// Relier ce téléphone au foyer : l'adresse e-mail, le code à 6 chiffres reçu, puis créer le foyer ou le rejoindre.
// Le code s'écrit dans l'app (pas de lien à toucher) : ça marche aussi dans Echo installée sur l'écran d'accueil.

type Etape = "email" | "code" | "foyer" | "rejoindre" | "inviter";

export function Connexion({ prenom, proprio, onFini, onPlusTard }: { prenom: string; proprio: Personne; onFini: () => void; onPlusTard?: () => void }) {
  const [etape, setEtape] = useState<Etape>("email");
  const [email, setEmail] = useState("");
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
  const soumettre = (fn: () => void) => (e: FormEvent) => { e.preventDefault(); fn(); };
  const chiffres = (v: string) => v.replace(/\D/g, "").slice(0, 6);

  const recevoir = () => essayer(async () => { await envoyerCode(email); setCode(""); setEtape("code"); });
  const valider = (c: string) => essayer(async () => {
    const deja = await verifierCode(email, c);
    if (deja) { toast("Te revoilà ! Ton foyer est retrouvé."); onFini(); } else setEtape("foyer");
  });
  const creer = () => essayer(async () => { await creerFoyer(prenom, proprio); setInvitation(await inviter()); setEtape("inviter"); });
  const rejoindre = (c: string) => essayer(async () => { await rejoindreFoyer(c, prenom); toast("Bienvenue dans le foyer !"); onFini(); });

  const erreurs = erreur && <p className="bv-erreur" role="alert">{erreur}</p>;
  let corps: ReactNode;
  if (etape === "email") corps = (
    <form className="bv-corps" onSubmit={soumettre(recevoir)}>
      <span className="bv-icone" aria-hidden="true"><Mail size={30} strokeWidth={2} /></span>
      <h1 id="cx-titre">Relier ce téléphone au foyer</h1>
      <p>Pour partager vos tâches entre vos deux téléphones. Ton adresse sert seulement à te connecter : Echo t'envoie un code à 6 chiffres.</p>
      <input className="saisie" type="email" inputMode="email" autoComplete="email" placeholder="ton adresse e-mail" aria-label="Adresse e-mail" required value={email} onChange={(e) => setEmail(e.target.value)} />
      {erreurs}
      <button className="bouton" disabled={occupe || !email.includes("@")}>{occupe ? "Envoi…" : "Recevoir le code"}</button>
      {onPlusTard && <button type="button" className="bouton-texte" onClick={onPlusTard}>Plus tard</button>}
    </form>
  );
  else if (etape === "code") corps = (
    <form className="bv-corps" onSubmit={soumettre(() => valider(code))}>
      <span className="bv-icone" aria-hidden="true"><Mail size={30} strokeWidth={2} /></span>
      <h1 id="cx-titre">Regarde tes e-mails</h1>
      <p>Écris le code à 6 chiffres envoyé à <b>{email}</b>.</p>
      <input className="saisie bv-code" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" aria-label="Code reçu par e-mail" autoFocus
        value={code} onChange={(e) => { const c = chiffres(e.target.value); setCode(c); if (c.length === 6) valider(c); }} />
      {erreurs}
      <button className="bouton" disabled={occupe || code.length < 6}>{occupe ? "Vérification…" : "Valider"}</button>
      <div className="rangee centre">
        <button type="button" className="bouton-texte" disabled={occupe} onClick={recevoir}>Renvoyer un code</button>
        <button type="button" className="bouton-texte" onClick={() => { setErreur(""); setEtape("email"); }}>Changer d'adresse</button>
      </div>
    </form>
  );
  else if (etape === "foyer") corps = (
    <div className="bv-corps">
      <span className="bv-icone" aria-hidden="true"><Home size={30} strokeWidth={2} /></span>
      <h1 id="cx-titre">Votre foyer</h1>
      <p>Le premier de vous deux crée le foyer et reçoit un code d'invitation. L'autre entre ce code sur son téléphone.</p>
      {erreurs}
      <button className="bouton" disabled={occupe} onClick={creer}>{occupe ? "Création…" : "Créer notre foyer"}</button>
      <button className="bouton second" disabled={occupe} onClick={() => { setErreur(""); setCode(""); setEtape("rejoindre"); }}>J'ai un code d'invitation</button>
    </div>
  );
  else if (etape === "rejoindre") corps = (
    <form className="bv-corps" onSubmit={soumettre(() => rejoindre(code))}>
      <span className="bv-icone" aria-hidden="true"><Users size={30} strokeWidth={2} /></span>
      <h1 id="cx-titre">Rejoindre le foyer</h1>
      <p>Écris le code d'invitation affiché sur l'autre téléphone (Réglages, partie Foyer).</p>
      <input className="saisie bv-code" inputMode="numeric" placeholder="000000" aria-label="Code d'invitation" autoFocus
        value={code} onChange={(e) => setCode(chiffres(e.target.value))} />
      {erreurs}
      <button className="bouton" disabled={occupe || code.length < 6}>{occupe ? "Un instant…" : "Rejoindre"}</button>
      <button type="button" className="bouton-texte" onClick={() => { setErreur(""); setEtape("foyer"); }}>Retour</button>
    </form>
  );
  else corps = (
    <div className="bv-corps">
      <span className="bv-icone" aria-hidden="true"><Users size={30} strokeWidth={2} /></span>
      <h1 id="cx-titre">Le foyer est prêt</h1>
      <p>Sur l'autre téléphone : ouvrir Echo, écrire son prénom et son e-mail, puis « J'ai un code d'invitation ».</p>
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
      <small>Valable 2 jours, une seule fois.</small>
      {"share" in navigator && (
        <button type="button" className="bouton second" onClick={() => navigator.share({ text: texte }).catch(() => {})}><Share2 size={18} strokeWidth={2} /> Envoyer le code</button>
      )}
    </div>
  );
}
