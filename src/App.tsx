import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { BarreAjout } from "./components/BarreAjout";
import { FeuilleTache } from "./components/FeuilleTache";
import { MenuGlissant } from "./components/MenuGlissant";
import type { Compris } from "./lib/comprendre";
import type { Tache } from "./lib/types";
import { premierLancement } from "./data/actions";
import { initialeDe, useMaintenant, useNoms, useTaches } from "./data/hooks";
import { Aujourdhui } from "./pages/Aujourdhui";
import { tachesDuJour } from "./lib/journee";
import { Bientot } from "./pages/Bientot";
import { PAGES, TOUTES } from "./pages/pages";
import { Reglages } from "./pages/Reglages";

const depuisAdresse = () => (TOUTES.find((p) => p.id === location.hash.slice(1)) || PAGES[0]).id;

export default function App() {
  const taches = useTaches();
  const noms = useNoms();
  const now = useMaintenant();
  const [page, setPage] = useState(depuisAdresse);
  const [apercu, setApercu] = useState<string | null>(null);
  const [feuille, setFeuille] = useState<{ ouverte: boolean; tache: Tache | null; pre: Compris | null }>({ ouverte: false, tache: null, pre: null });

  useEffect(() => { premierLancement(); }, []);
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

  const vue = TOUTES.find((p) => p.id === (apercu ?? page))!;
  const liste = taches ?? [];
  const reste = tachesDuJour(liste, now).ouvertes.length;
  const d = now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const salut = now.getHours() < 5 ? "Bonne nuit" : now.getHours() < 18 ? "Bonjour" : "Bonsoir";

  return (
    <>
      <MenuGlissant
        entrees={PAGES.map((p) => ({ ...p, pastille: p.id === "aujourdhui" ? reste : undefined }))}
        active={page} nom={noms.moi} initiale={initialeDe(noms, "moi")}
        onChoisir={aller} onApercu={setApercu}
      >
        <div className="cadre">
          <header className="entete">
            <div>
              <div className="date">{vue.id === "aujourdhui" ? `${salut} ${noms.moi} · ${d}` : d.charAt(0).toUpperCase() + d.slice(1)}</div>
              <h1 className="page-titre">{vue.libelle}</h1>
            </div>
            <a className="duo" href="#reglages" aria-label="Les deux profils du foyer" onClick={(e) => { e.preventDefault(); aller("reglages"); }}>
              <i>{initialeDe(noms, "moi")}</i><i>{initialeDe(noms, "elle")}</i>
            </a>
          </header>
          <div className="cadre" key={vue.id}>
            {taches === undefined ? null
              : vue.id === "aujourdhui" ? <Aujourdhui taches={liste} noms={noms} now={now} onOuvrir={(t) => ouvrir(t)} onAller={aller} />
              : vue.id === "reglages" ? <Reglages taches={liste} noms={noms} />
              : <Bientot page={vue} onAller={aller} />}
          </div>
        </div>
      </MenuGlissant>

      <BarreAjout noms={noms} onPlusOptions={(pre) => ouvrir(null, pre)} />
      <FeuilleTache {...feuille} noms={noms} onFermer={() => setFeuille((f) => ({ ...f, ouverte: false }))} />
      <Toaster position="bottom-center" toastOptions={{ unstyled: true, classNames: { toast: "message" }, duration: 4000 }} />
    </>
  );
}
