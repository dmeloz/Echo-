import { Suspense, useEffect, useRef, useState } from "react";
import { toast, Toaster } from "sonner";
import { BarreAjout } from "./components/BarreAjout";
import { BoutonEcho } from "./components/BoutonEcho";
import { ChampRecherche, ResultatsRecherche } from "./components/Recherche";
import { Search } from "pulsoicon-react";
import { ecouterVoix } from "./lib/voix";
import { vibrer } from "./lib/gestes";
import { FeuilleTache } from "./components/FeuilleTache";
import { MenuGlissant } from "./components/MenuGlissant";
import { MiseAJour } from "./components/MiseAJour";
import type { Compris } from "./lib/comprendre";
import type { Tache } from "./lib/types";
import { premierLancement, viderVieilleCorbeille, viderVieuxJournal } from "./data/actions";
import { baseOuverte, db, garderLesDonnees } from "./data/db";
import { initialeDe, poserReglage, useMaintenant, useNoms, useProfil, useReglage, useTaches } from "./data/hooks";
import { Bienvenue } from "./components/Bienvenue";
import { Connexion } from "./components/Connexion";
import { ResumeMatin } from "./components/ResumeMatin";
import { suivre } from "./sync/moteur";
import { demarrerIcloud } from "./sync/icloud";
import { useLiveQuery } from "dexie-react-hooks";
import { autre } from "./lib/types";
import { Aujourdhui } from "./pages/Aujourdhui";
import { auJour } from "./lib/dates";
import { tachesDuJour } from "./lib/journee";
import { Bientot } from "./pages/Bientot";
import { useModulesActifs } from "./modules/registre";
import { Reglages } from "./pages/Reglages";
import { Secours } from "./components/Secours";
import { HorsLigne } from "./components/HorsLigne";

const depuisAdresse = () => location.hash.slice(1) || "aujourdhui";
const BORDS_MESSAGE = { bottom: "calc(env(safe-area-inset-bottom, 0px) + 17px)", left: "14px", right: "calc(env(safe-area-inset-right, 0px) + 84px)" };
const BASE = [{ id: "aujourdhui", libelle: "Aujourd'hui" }, { id: "reglages", libelle: "Réglages" }];

export default function App() {
  const taches = useTaches();
  const noms = useNoms();
  const { actifs, masques } = useModulesActifs();
  const { proprio: proprioBrut, guideVu } = useProfil();
  const proprio = proprioBrut ?? "moi";
  const [guideFerme, setGuideFerme] = useState(false);
  // Relier le téléphone au foyer : proposé une fois à ceux qui avaient Echo avant la synchro, puis depuis les Réglages.
  const etatFoyer = useLiveQuery(async () => ({
    foyer: (await db.reglages.get("foyer"))?.valeur,
    proposee: !!(await db.reglages.get("connexionProposee"))?.valeur,
    membres: ((await db.reglages.get("membres"))?.valeur as Array<{ place: string }> | undefined) ?? [],
  }), []);
  // Dans un foyer, le rond de l'autre n'apparaît qu'une fois qu'il a rejoint.
  const autreLa = !etatFoyer?.foyer || etatFoyer.membres.some((m) => m.place === autre(proprio));
  const aProposer = !!etatFoyer && !etatFoyer.foyer && !etatFoyer.proposee;
  const [relier, setRelier] = useState(false);
  const now = useMaintenant();
  const [page, setPage] = useState(depuisAdresse);
  const [apercu, setApercu] = useState<string | null>(null);
  const [recherche, setRecherche] = useState<string | null>(null); // null : la loupe est fermée
  const [feuille, setFeuille] = useState<{ ouverte: boolean; tache: Tache | null; pre: Compris | null }>({ ouverte: false, tache: null, pre: null });

  // La barre d'écriture, rangée derrière l'étoile Echo.
  const [barre, setBarre] = useState<"ferme" | "texte" | "voix">("ferme");
  const [texte, setTexte] = useState("");
  const saisie = useRef<HTMLInputElement>(null);
  const arretVoix = useRef<(() => void) | null>(null);
  const astuceVue = useReglage("astuceEcho", false);
  const vuAstuce = () => { if (!astuceVue) poserReglage("astuceEcho", true); };
  const montrer = () => {
    // Le focus doit partir dans le même geste que le toucher, sinon l'iPhone n'ouvre pas le clavier.
    const champ = saisie.current;
    if (champ?.form) champ.form.inert = false;
    champ?.focus({ preventScroll: true });
    setBarre("texte"); vuAstuce();
  };
  const ranger = () => {
    arretVoix.current?.(); arretVoix.current = null;
    saisie.current?.blur();
    setBarre("ferme");
  };
  const finEcoute = () => { arretVoix.current?.(); };
  const ecouter = () => {
    vibrer(12); vuAstuce();
    setBarre("voix");
    arretVoix.current = ecouterVoix({
      onTexte: setTexte,
      onErreur: (m) => toast(m, { duration: 6000 }),
      onFin: () => { arretVoix.current = null; setBarre((b) => (b === "voix" ? "texte" : b)); },
    });
  };
  useEffect(() => { document.documentElement.classList.toggle("barre-ouverte", barre !== "ferme"); }, [barre]);
  useEffect(() => {
    if (barre === "ferme") return;
    const echap = (e: KeyboardEvent) => { if (e.key === "Escape") ranger(); };
    // Toucher la page range la barre quand elle est vide.
    const ailleurs = (e: PointerEvent) => {
      const c = e.target as Element;
      if (!texte.trim() && barre !== "voix" && c.closest(".scene") && !c.closest(".capsule, .barre-bas")) ranger();
    };
    addEventListener("keydown", echap); addEventListener("pointerdown", ailleurs);
    return () => { removeEventListener("keydown", echap); removeEventListener("pointerdown", ailleurs); };
  });

  const [baseOk, setBaseOk] = useState(true);
  useEffect(() => {
    baseOuverte().then((ok) => { setBaseOk(ok); if (ok) { premierLancement().catch(() => {}); garderLesDonnees(); viderVieilleCorbeille().catch(() => {}); viderVieuxJournal().catch(() => {}); suivre(); demarrerIcloud(); } });
  }, []);
  useEffect(() => {
    const suivre = () => setPage(depuisAdresse());
    addEventListener("hashchange", suivre);
    addEventListener("popstate", suivre);
    return () => { removeEventListener("hashchange", suivre); removeEventListener("popstate", suivre); };
  }, []);
  useEffect(() => { document.documentElement.classList.toggle("feuille-ouverte", feuille.ouverte); }, [feuille.ouverte]);

  const aller = (id: string) => {
    setRecherche(null);
    if (id !== page) {
      // Changer de module ne laisse pas de trace dans l'historique : le geste retour de l'iPhone
      // (glisser depuis le bord gauche) ne saute plus d'un module à l'autre au hasard.
      history.replaceState(null, "", "#" + id);
      document.querySelector(".defile")?.scrollTo(0, 0);
    } else dispatchEvent(new Event("echo-retour")); // rechoisir la page ouverte ramène à son début (sommaire des Réglages)
    setPage(id);
  };
  const ouvrir = (t: Tache | null, pre: Compris | null = null) => setFeuille({ ouverte: true, tache: t, pre });

  const id = apercu ?? page;
  const module = actifs.find((m) => m.id === id);
  const vue = module ?? BASE.find((p) => p.id === id) ?? BASE[0];
  const liste = taches ?? [];
  const reste = tachesDuJour(liste, now).ouvertes.length;
  // La date s'écrit en court (« ven. 27 nov. ») : elle tient sur une ligne à côté de la salutation ou d'un bouton de module.
  const dCourt = now.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
  const salut = now.getHours() < 5 ? "Bonne nuit" : now.getHours() < 18 ? "Bonjour" : "Bonsoir";

  return (
    <>
      <MenuGlissant
        entrees={[{ id: "aujourdhui", libelle: "Aujourd'hui", pastille: reste }, ...actifs.map((m) => ({ id: m.id, libelle: m.libelle, bientot: m.etat === "bientot" }))]}
        active={page} nom={noms[proprio]} initiale={initialeDe(noms, proprio)}
        onChoisir={aller} onApercu={setApercu} onOuvert={ranger}
        echo={<BoutonEcho ouverte={barre !== "ferme"} ecoute={barre === "voix"} onToucher={() => (barre === "ferme" ? montrer() : ranger())} onMaintenir={ecouter} />}
      >
        <div className="cadre">
          <header className="entete">
            {recherche !== null ? <ChampRecherche valeur={recherche} onValeur={setRecherche} onFermer={() => setRecherche(null)} /> : <>
            <div>
              <div className="date">{vue.id === "aujourdhui" ? `${salut} ${noms[proprio]} · ${dCourt}` : dCourt.replace(/^./, (c) => c.toUpperCase())}</div>
              <h1 className="page-titre">{vue.libelle}</h1>
            </div>
            <div className="entete-droite">
              {vue.id === "aujourdhui" && taches && <ResumeMatin taches={liste} noms={noms} proprio={proprio} now={now} />}
              {/* La place d'un module dans l'en-tête : il y pose un petit bouton (« Au magasin » pour Cuisine). */}
              <span id="entete-module" />
              <button type="button" className="loupe-ouvrir" aria-label="Chercher dans Echo" onClick={() => setRecherche("")}><Search size={20} strokeWidth={2} /></button>
              <a className="duo" href="#reglages" aria-label={autreLa ? "Les deux profils du foyer" : "Ton profil"} onClick={(e) => { e.preventDefault(); aller("reglages"); }}>
                <i className={proprio}>{initialeDe(noms, proprio)}</i>{autreLa && <i className={autre(proprio)}>{initialeDe(noms, autre(proprio))}</i>}
              </a>
            </div>
            </>}
          </header>
          <HorsLigne />
          {recherche !== null ? (
            <ResultatsRecherche taches={liste} q={recherche} noms={noms} now={now} onOuvrir={(t) => ouvrir(t)} onExemple={setRecherche} />
          ) : <Secours key={vue.id}>
          <div className="cadre arrivee">
            {!baseOk ? <BaseFermee /> : taches === undefined ? <Squelette />
              : module ? (module.Page && module.etat === "construit" ? <Suspense fallback={<Squelette />}><module.Page noms={noms} proprio={proprio} now={now} aller={aller} ouvrir={(t) => ouvrir(t)} creer={(p) => ouvrir(null, { titre: "", jour: p.jour, heure: p.heure ?? "", qui: proprio, repete: "", niveau: null })} /></Suspense> : <Bientot module={module} onAller={aller} />)
              : vue.id === "reglages" ? <Reglages taches={liste} noms={noms} masques={masques} proprio={proprio} onGuide={() => setGuideFerme(false)} onRelier={() => setRelier(true)} />
              : <Aujourdhui taches={liste} noms={noms} proprio={proprio} now={now} modules={actifs} onOuvrir={(t) => ouvrir(t)} onAller={aller} onCreer={() => ouvrir(null, { titre: "", jour: auJour(0, now), heure: "", qui: proprio, repete: "", niveau: null })} />}
          </div>
          </Secours>}
        </div>
      </MenuGlissant>

      {!astuceVue && <span className="astuce" aria-hidden="true">Touche pour écrire · maintiens pour parler</span>}
      <BarreAjout noms={noms} proprio={proprio} ouverte={barre !== "ferme"} ecoute={barre === "voix"} texte={texte} saisie={saisie}
        onTexte={setTexte} onRanger={ranger} onFinEcoute={finEcoute} onPlusOptions={(pre) => { ranger(); ouvrir(null, pre); }} />
      <FeuilleTache {...feuille} noms={noms} proprio={proprio} onFermer={() => setFeuille((f) => ({ ...f, ouverte: false }))} />
      <MiseAJour />
      {proprioBrut !== undefined && (proprioBrut === null || (!guideVu && !guideFerme)) && (
        <Bienvenue noms={noms} proprio={proprioBrut} onFini={() => setGuideFerme(true)} />
      )}
      {proprioBrut && (relier || (guideVu && aProposer)) && (
        <Connexion prenom={noms[proprioBrut]} proprio={proprioBrut} rejoindreSeulement={!!etatFoyer?.foyer} demanderPrenom onFini={() => { setRelier(false); poserReglage("connexionProposee", true); }}
          onPlusTard={() => { setRelier(false); poserReglage("connexionProposee", true); }} />
      )}
      {/* Les messages (avec Annuler) prennent la place de la barre rangée, à gauche de la capsule. */}
      <Toaster position="bottom-center" offset={BORDS_MESSAGE} mobileOffset={BORDS_MESSAGE} toastOptions={{ unstyled: true, classNames: { toast: "message" }, duration: 4000 }} />
    </>
  );
}

// Pendant le chargement : la silhouette de la page, pas une roue qui tourne.
function Squelette() {
  return (
    <div className="squelette" aria-busy="true" aria-label="Chargement">
      <i className="s-phrase" /><i className="s-carte grande" /><i className="s-carte" />
    </div>
  );
}

// Le stockage du téléphone refuse de s'ouvrir : on le dit, avec le geste qui débloque.
function BaseFermee() {
  return (
    <section className="g vide" role="alert">
      <h2>Echo n'arrive pas à ouvrir tes données</h2>
      <p>Ouvre Echo depuis l'écran d'accueil (pas en navigation privée) et vérifie qu'il reste de la place sur le téléphone.</p>
      <div className="rangee centre"><button className="bouton" onClick={() => location.reload()}>Réessayer</button></div>
    </section>
  );
}
