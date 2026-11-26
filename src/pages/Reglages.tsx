import { useEffect, useState } from "react";
import { Bell, Calendar, ChevronLeft, ChevronRight, HardDrive, LayoutGrid, Sparkles, Users } from "pulsoicon-react";
import { toast } from "sonner";
import type { Noms, Personne, Tache } from "../lib/types";
import { effacerExemples, remettreExemples, toutEffacer } from "../data/actions";
import { marquerGuide, poserReglage, useReglage } from "../data/hooks";
import { CodeInvitation } from "../components/Connexion";
import { SectionIcloud } from "../components/Icloud";
import { estConnecte, inviter, type Foyer, type Membre } from "../sync/moteur";
import { MODULES, basculerModule } from "../modules/registre";
import { exporter, importer } from "../data/sauvegarde";
import { RAPPELS_DEFAUT, reglerRappels, type Rappels } from "../data/rappels";
import { VERSION, chercher, installer, useMiseAJour } from "../data/miseAJour";

type Theme = "foyer" | "echo" | "notifications" | "agenda" | "modules" | "app";

// Réglages : un sommaire de 6 lignes qui disent leur état, et un toucher ouvre la page du thème.
// Le retour (bouton ou geste de l'iPhone) passe par l'historique du navigateur.
export function Reglages(props: { taches: Tache[]; noms: Noms; masques: string[]; proprio: Personne; onGuide: () => void; onRelier: () => void }) {
  const [theme, setTheme] = useState<Theme | null>(() => (history.state?.reglage as Theme | undefined) ?? null);
  useEffect(() => {
    const suivre = () => setTheme((history.state?.reglage as Theme | undefined) ?? null);
    addEventListener("popstate", suivre);
    return () => removeEventListener("popstate", suivre);
  }, []);
  const relie = !!useReglage<Foyer | null>("foyer", null);
  const haut = () => document.querySelector(".defile")?.scrollTo(0, 0);
  const ouvrir = (t: Theme) => { history.pushState({ reglage: t }, "", "#reglages"); setTheme(t); haut(); };
  const fermer = () => { if (history.state?.reglage) history.back(); else setTheme(null); haut(); };

  if (!theme) return <Sommaire {...props} onOuvrir={ouvrir} />;
  const { taches, noms, masques, proprio, onGuide, onRelier } = props;
  return (
    <div className="reglage-page" key={theme}>
      <button type="button" className="retour" onClick={fermer}><ChevronLeft size={20} strokeWidth={2.2} />Réglages</button>
      <h2 className="reglage-titre">{TITRES[theme]}</h2>
      {theme === "foyer" && <SectionFoyer noms={noms} proprio={proprio} onRelier={onRelier} />}
      {theme === "echo" && <SectionEcho />}
      {theme === "notifications" && <SectionNotifications noms={noms} proprio={proprio} />}
      {theme === "agenda" && <SectionIcloud relie={relie} />}
      {theme === "modules" && <SectionModules masques={masques} />}
      {theme === "app" && <SectionApp taches={taches} onGuide={onGuide} />}
    </div>
  );
}

const TITRES: Record<Theme, string> = { foyer: "Foyer", echo: "Echo", notifications: "Notifications", agenda: "Agenda", modules: "Modules", app: "Données et app" };

function Sommaire({ taches, noms, masques, proprio, onOuvrir }: { taches: Tache[]; noms: Noms; masques: string[]; proprio: Personne; onOuvrir: (t: Theme) => void }) {
  const foyer = useReglage<Foyer | null>("foyer", null);
  const membres = useReglage<Membre[]>("membres", []);
  const r = useReglage<Rappels>("rappels", RAPPELS_DEFAUT);
  const icloud = useReglage("icloud", false);
  const assistant = useReglage("assistantEcho", true);
  const codeEcho = useReglage<string>("codeEcho", "").trim();
  const maj = useMiseAJour();
  const lautre = noms[proprio === "moi" ? "elle" : "moi"];
  const affiches = MODULES.filter((m) => !masques.includes(m.id)).length;
  const nb = taches.length;

  const lignes: Array<{ id: Theme; Icone: typeof Users; etat: string; turquoise?: boolean }> = [
    { id: "foyer", Icone: Users, etat: !foyer ? "Seulement sur ce téléphone" : membres.length > 1 ? membres.map((m) => m.prenom).join(" et ") : `Invite ${lautre}` },
    { id: "echo", Icone: Sparkles, turquoise: true, etat: !assistant ? "Éteint · l'app comprend seule" : codeEcho ? "Comprend tes phrases et propose" : "Code du foyer à mettre" },
    { id: "notifications", Icone: Bell, etat: !foyer || !r.actif ? "Éteintes sur ce téléphone" : r.matin ? `Allumées · résumé à ${r.matin.replace(":", " h ")}` : "Allumées" },
    { id: "agenda", Icone: Calendar, turquoise: true, etat: icloud ? "Relié à iCloud" : "iCloud pas relié" },
    { id: "modules", Icone: LayoutGrid, etat: `${affiches} affiché${affiches > 1 ? "s" : ""} sur ${MODULES.length}` },
    { id: "app", Icone: HardDrive, turquoise: true, etat: maj.disponible ? "Une mise à jour est prête" : `${nb} tâche${nb > 1 ? "s" : ""} · sauvegarde, guide, version` },
  ];
  return (
    <>
      <nav className="g sommaire" aria-label="Réglages">
        {lignes.map(({ id, Icone, etat, turquoise }) => (
          <button key={id} type="button" className="sommaire-ligne" onClick={() => onOuvrir(id)}>
            <span className={`sommaire-ico${turquoise ? " t" : ""}`}><Icone size={19} strokeWidth={2} /></span>
            <span className="sommaire-txt"><b>{TITRES[id]}</b><small>{etat}</small></span>
            <ChevronRight size={18} strokeWidth={2} className="sommaire-chev" />
          </button>
        ))}
      </nav>
      <p className="note-donnees">Icônes : PulsoIcon (licence ISC). Agenda est construit ; Cuisine, Maison et Budget pas encore.</p>
    </>
  );
}

// Notifications : « Le matin » (le soleil de l'accueil) et les rappels envoyés par le serveur, au même endroit.
function SectionNotifications({ noms, proprio }: { noms: Noms; proprio: Personne }) {
  const resume = useReglage("resumeMatin", true);
  const relie = !!useReglage<Foyer | null>("foyer", null);
  return (
    <>
      <section className="g reglages">
        <span className="lab">Sur l'accueil</span>
        <label className="module-ligne">
          <span><b>Résumé du matin</b><small>Le petit soleil en haut de l'accueil : ta journée, celle de {noms[proprio === "moi" ? "elle" : "moi"]}, et ce qui arrive dans la semaine.</small></span>
          <input type="checkbox" role="switch" className="interrupteur" checked={resume} onChange={() => poserReglage("resumeMatin", !resume)} />
        </label>
      </section>
      <SectionRappels relie={relie} />
    </>
  );
}

function SectionModules({ masques }: { masques: string[] }) {
  return (
    <section className="g reglages">
      <p>Chaque partie de l'app est un module. Masque ceux dont vous ne vous servez pas : ils disparaissent du menu et de l'accueil.</p>
      <div className="modules">
        {MODULES.map((m) => {
          const actif = !masques.includes(m.id);
          return (
            <label key={m.id} className="module-ligne">
              <span><b>{m.libelle}</b><small>{m.etat === "bientot" ? "Pas encore construit · " : ""}{m.resume}</small></span>
              <input type="checkbox" role="switch" className="interrupteur" checked={actif} onChange={() => basculerModule(m.id, masques)} />
            </label>
          );
        })}
      </div>
    </section>
  );
}

// Données et app : la sauvegarde, les exemples, tout effacer, le guide et les mises à jour.
function SectionApp({ taches, onGuide }: { taches: Tache[]; onGuide: () => void }) {
  const [sur, setSur] = useState(false);
  const [recherche, setRecherche] = useState(false);
  const maj = useMiseAJour();
  const nb = taches.length;
  const relie = !!useReglage<Foyer | null>("foyer", null);
  return (
    <>
      <section className="g reglages">
        <span className="lab">Tes données</span>
        <p>{nb} tâche{nb > 1 ? "s" : ""} enregistrée{nb > 1 ? "s" : ""} sur cet appareil.{relie ? " Tâches et horaires sont aussi gardés dans votre foyer ; les photos restent sur ce téléphone." : " Rien n'est envoyé ailleurs tant que le téléphone n'est pas relié au foyer."} Une sauvegarde de temps en temps ne fait pas de mal.</p>
        <div className="rangee">
          <button className="bouton" onClick={() => exporter()}>Faire une sauvegarde</button>
          <label className="bouton second">Récupérer une sauvegarde
            <input type="file" accept="application/json,.json" className="vh" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importer(f); }} /></label>
        </div>
        <p className="aide-champ">La sauvegarde est un fichier. Sur iPhone, choisis « Enregistrer dans Fichiers » pour la garder.</p>
        <div className="rangee">
          {taches.some((t) => t.ex)
            ? <button className="bouton second" onClick={() => { effacerExemples(); toast("Exemples effacés"); }}>Effacer les exemples</button>
            : <button className="bouton second" onClick={() => { remettreExemples(); toast("Exemples remis"); }}>Remettre les exemples</button>}
          <button className={`bouton danger${sur ? " sur" : ""}`} onClick={() => {
            if (!sur) { setSur(true); setTimeout(() => setSur(false), 4000); return; }
            toutEffacer(); setSur(false); toast("Tout est effacé");
          }}>{sur ? "Touche encore pour confirmer" : relie ? "Tout effacer, pour vous deux" : "Tout effacer"}</button>
        </div>
      </section>
      <section className="g reglages">
        <span className="lab">Le guide</span>
        <div className="rangee"><button className="bouton second" onClick={() => { marquerGuide(false); onGuide(); }}>Revoir le guide</button></div>
      </section>
      <section className="g reglages">
        <span className="lab">Mises à jour</span>
        <p>Echo se met à jour toute seule : quand une nouvelle version est prête, un bandeau apparaît en haut avec un bouton « Mettre à jour ».</p>
        <p className="version">Version installée : {VERSION}</p>
        <div className="rangee">
          {maj.disponible
            ? <button className="bouton" onClick={() => installer()}>Mettre à jour maintenant</button>
            : <button className="bouton second" disabled={recherche} onClick={async () => {
                setRecherche(true);
                const nouvelle = await chercher();
                setRecherche(false);
                if (!nouvelle) toast(maj.reg ? "Echo est à jour" : "Ouvre Echo depuis l'écran d'accueil pour les mises à jour");
              }}>{recherche ? "Recherche…" : "Chercher une mise à jour"}</button>}
        </div>
      </section>
    </>
  );
}

// Le foyer : qui en fait partie, et un code pour inviter l'autre. Les prénoms ne se changent pas ici.
function SectionFoyer({ noms, proprio, onRelier }: { noms: Noms; proprio: Personne; onRelier: () => void }) {
  const foyer = useReglage<Foyer | null>("foyer", null);
  const membres = useReglage<Membre[]>("membres", []);
  const [connecte, setConnecte] = useState(true);
  const [code, setCode] = useState("");
  const [occupe, setOccupe] = useState(false);
  useEffect(() => { if (foyer) estConnecte().then(setConnecte); }, [foyer]);
  const lautre = noms[proprio === "moi" ? "elle" : "moi"];

  if (!foyer) return (
    <section className="g reglages">
      <p>Echo est seulement sur ce téléphone. Relie-le au foyer pour partager tâches et horaires avec {lautre}.</p>
      <div className="rangee"><button className="bouton" onClick={onRelier}>Relier ce téléphone</button></div>
    </section>
  );
  const seul = membres.length < 2;
  return (
    <section className="g reglages">
      {membres.length > 0 && <div className="membres">{membres.map((m) => <span key={m.userId}><i className={m.place}>{(m.prenom[0] || "?").toUpperCase()}</i>{m.prenom}{m.place === proprio ? " (toi)" : ""}</span>)}</div>}
      {!connecte ? <>
        <p>Ce téléphone n'est plus relié : les changements attendent ici. Crée un code sur l'autre téléphone, puis entre-le ici.</p>
        <div className="rangee"><button className="bouton" onClick={onRelier}>Entrer un code</button></div>
      </> : seul ? <>
        <p>Invite {lautre} : sur son téléphone, Echo lui demandera ce code.</p>
        {code ? <CodeInvitation code={code} /> : (
          <div className="rangee"><button className="bouton" disabled={occupe} onClick={async () => {
            setOccupe(true);
            try { setCode(await inviter()); } catch (e) { toast(e instanceof Error ? e.message : "Ça n'a pas marché."); }
            setOccupe(false);
          }}>{occupe ? "Un instant…" : "Créer un code d'invitation"}</button></div>
        )}
      </> : <p>Tout ce que l'un ajoute ou termine arrive chez l'autre, avec un petit message.</p>}
    </section>
  );
}

// Les rappels : une notification à l'heure d'une tâche, et le résumé du matin. Le serveur d'Echo les envoie.
function SectionRappels({ relie }: { relie: boolean }) {
  const r = useReglage<Rappels>("rappels", RAPPELS_DEFAUT);
  const [occupe, setOccupe] = useState(false);
  const regler = async (x: Partial<Rappels>) => {
    if (occupe) return;
    setOccupe(true);
    try { await reglerRappels({ ...r, ...x }); if (x.actif) toast("Rappels allumés sur ce téléphone"); }
    catch (e) { toast(e instanceof Error ? e.message : "Ça n'a pas marché. Réessaie.", { duration: 7000 }); }
    setOccupe(false);
  };
  return (
    <section className="g reglages">
      <span className="lab">Rappels</span>
      {!relie ? <p>Les rappels passent par le serveur d'Echo : relie d'abord ce téléphone au foyer, dans Réglages → Foyer.</p> : <>
        <label className="module-ligne">
          <span><b>Notifications sur ce téléphone</b><small>Echo te prévient même quand l'app est fermée. Pour tes tâches et celles à faire à deux.</small></span>
          <input type="checkbox" role="switch" className="interrupteur" checked={r.actif} disabled={occupe} onChange={() => regler({ actif: !r.actif })} />
        </label>
        {r.actif && <>
          <label className="module-ligne">
            <span><b>À l'heure d'une tâche</b><small>Pour les tâches qui ont une heure.</small></span>
            <input type="checkbox" role="switch" className="interrupteur" checked={r.aLHeure} disabled={occupe} onChange={() => regler({ aLHeure: !r.aLHeure })} />
          </label>
          <label className="module-ligne">
            <span><b>Résumé du matin</b><small>Une notification avec ta journée. Rien si tu n'as rien à faire.</small></span>
            <input type="checkbox" role="switch" className="interrupteur" checked={!!r.matin} disabled={occupe} onChange={() => regler({ matin: r.matin ? null : "07:30" })} />
          </label>
          {r.matin && (
            <label className="module-ligne">
              <span><b>Heure du résumé</b></span>
              <input type="time" className="saisie heure-rappel" value={r.matin} disabled={occupe} onChange={(e) => e.target.value && regler({ matin: e.target.value })} />
            </label>
          )}
        </>}
        <p className="aide-champ">Sur iPhone, les notifications marchent quand Echo est ouvert depuis l'écran d'accueil.</p>
      </>}
    </section>
  );
}

// L'assistant Echo : comprendre les phrases avec l'IA (Claude Haiku 5.5, sur le serveur du foyer). Il propose, tu confirmes.
function SectionEcho() {
  const actif = useReglage("assistantEcho", true);
  const code = useReglage<string>("codeEcho", "");
  return (
    <section className="g reglages">
      <span className="lab">L'assistant</span>
      <label className="module-ligne">
        <span><b>Echo comprend mes phrases</b><small>Écris ou dis une phrase libre, même avec plusieurs choses dedans : Echo propose les tâches et les rendez-vous, et rien n'est ajouté sans ton accord. Sans internet, l'app comprend seule, plus simplement.</small></span>
        <input type="checkbox" role="switch" className="interrupteur" checked={actif} onChange={() => poserReglage("assistantEcho", !actif)} />
      </label>
      <label className="champ">Code Echo
        <input key={code} defaultValue={code} type="password" placeholder="Le code secret du foyer" autoComplete="off" onBlur={(e) => poserReglage("codeEcho", e.target.value.trim())} />
      </label>
      <p className="aide-champ">Le même code que pour la lecture de la fiche d'horaires. Il reste sur ce téléphone.</p>
    </section>
  );
}
