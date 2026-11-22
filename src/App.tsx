import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { BarreAjout } from "./components/BarreAjout";
import { FeuilleTache } from "./components/FeuilleTache";
import { MenuGlissant } from "./components/MenuGlissant";
import { MiseAJour } from "./components/MiseAJour";
import type { Compris } from "./lib/comprendre";
import type { Tache } from "./lib/types";
import { premierLancement } from "./data/actions";
import { baseOuverte, garderLesDonnees } from "./data/db";
import { initialeDe, useMaintenant, useNoms, useProfil, useTaches } from "./data/hooks";
import { Bienvenue } from "./components/Bienvenue";
import { autre } from "./lib/types";
import { Aujourdhui } from "./pages/Aujourdhui";
import { tachesDuJour } from "./lib/journee";
import { Bientot } from "./pages/Bientot";
import { useModulesActifs } from "./modules/registre";
import { Reglages } from "./pages/Reglages";
import { Secours } from "./components/Secours";
import { HorsLigne } from "./components/HorsLigne";

const depuisAdresse = () => location.hash.slice(1) || "aujourdhui";
const BASE = [{ id: "aujourdhui", libelle: "Aujourd'hui" }, { id: "reglages", libelle: "Réglages" }];

export default function App() {
  const taches = useTaches();
  const noms = useNoms();
  const { actifs, masques } = useModulesActifs();
  const { proprio: proprioBrut, guideVu } = useProfil();
  const proprio = proprioBrut ?? "moi";
  const [guideFerme, setGuideFerme] = useState(false);
  const now = useMaintenant();
  const [page, setPage] = useState(depuisAdresse);
  const [apercu, setApercu] = useState<string | null>(null);
  const [feuille, setFeuille] = useState<{ ouverte: boolean; tache: Tache | null; pre: Compris | null }>({ ouverte: false, tache: null, pre: null });

  const [baseOk, setBaseOk] = useState(true);
  useEffect(() => {
    baseOuverte().then((ok) => { setBaseOk(ok); if (ok) { premierLancement().catch(() => {}); garderLesDonnees(); } });
  }, []);
  useEffect(() => {
    const suivre = () => setPage(depuisAdresse());
    addEventListener("hashchange", suivre);
    addEventListener("popstate", suivre);
    return () => { removeEventListener("hashchange", suivre); removeEventListener("popstate", suivre); };
  }, []);
  useEffect(() => { document.documentElement.classList.toggle("feuille-ouverte", feuille.ouverte); }, [feuille.ouverte]);

  const aller = (id: string) => {
    if (id !== page) { history.pushState(null, "", "#" + id); document.querySelector(".defile")?.scrollTo(0, 0); }
    setPage(id);
  };
  const ouvrir = (t: Tache | null, pre: Compris | null = null) => setFeuille({ ouverte: true, tache: t, pre });

  const id = apercu ?? page;
  const module = actifs.find((m) => m.id === id);
  const vue = module ?? BASE.find((p) => p.id === id) ?? BASE[0];
  const liste = taches ?? [];
  const reste = tachesDuJour(liste, now).ouvertes.length;
  const d = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const salut = now.getHours() < 5 ? "Bonne nuit" : now.getHours() < 18 ? "Bonjour" : "Bonsoir";

  return (
    <>
      <MenuGlissant
        entrees={[{ id: "aujourdhui", libelle: "Aujourd'hui", pastille: reste }, ...actifs.map((m) => ({ id: m.id, libelle: m.libelle, bientot: m.etat === "bientot" }))]}
        active={page} nom={noms[proprio]} initiale={initialeDe(noms, proprio)}
        onChoisir={aller} onApercu={setApercu}
      >
        <div className="cadre">
          <header className="entete">
            <div>
              <div className="date">{vue.id === "aujourdhui" ? `${salut} ${noms[proprio]} · ${d}` : d.charAt(0).toUpperCase() + d.slice(1)}</div>
              <h1 className="page-titre">{vue.libelle}</h1>
            </div>
            <a className="duo" href="#reglages" aria-label="Les deux profils du foyer" onClick={(e) => { e.preventDefault(); aller("reglages"); }}>
              <i className={proprio}>{initialeDe(noms, proprio)}</i><i className={autre(proprio)}>{initialeDe(noms, autre(proprio))}</i>
            </a>
          </header>
          <HorsLigne />
          <Secours key={vue.id}>
          <div className="cadre arrivee">
            {!baseOk ? <BaseFermee /> : taches === undefined ? <Squelette />
              : module ? (module.Page && module.etat === "construit" ? <module.Page noms={noms} now={now} aller={aller} /> : <Bientot module={module} onAller={aller} />)
              : vue.id === "reglages" ? <Reglages taches={liste} noms={noms} masques={masques} proprio={proprio} onGuide={() => setGuideFerme(false)} />
              : <Aujourdhui taches={liste} noms={noms} now={now} modules={actifs} onOuvrir={(t) => ouvrir(t)} onAller={aller} />}
          </div>
          </Secours>
        </div>
      </MenuGlissant>

      <BarreAjout noms={noms} proprio={proprio} onPlusOptions={(pre) => ouvrir(null, pre)} />
      <FeuilleTache {...feuille} noms={noms} proprio={proprio} onFermer={() => setFeuille((f) => ({ ...f, ouverte: false }))} />
      <MiseAJour />
      {proprioBrut !== undefined && (proprioBrut === null || (!guideVu && !guideFerme)) && (
        <Bienvenue noms={noms} proprio={proprioBrut} onFini={() => setGuideFerme(true)} />
      )}
      <Toaster position="bottom-center" toastOptions={{ unstyled: true, classNames: { toast: "message" }, duration: 4000 }} />
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
