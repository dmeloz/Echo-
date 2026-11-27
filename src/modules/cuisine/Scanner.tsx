import { useLiveQuery } from "dexie-react-hooks";
import { X } from "pulsoicon-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { db } from "../../data/db";
import { useEcranAllume, vibrer } from "../../lib/gestes";
import { chercherProduit, ouvrirLecteur, rangerScanne, type Trouve } from "./codeBarres";
import { LIEUX, codeValide, lieuProbable, type Lieu } from "./donnees";

// Scanner des codes-barres pour remplir le stock : on vise le code, Echo trouve le produit, on choisit l'endroit, « Ajouter ».
// La caméra reste ouverte pour enchaîner. Sans caméra (refusée, ou pas de lecteur), on tape le code.
export function Scanner({ onQuitter }: { onQuitter: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<"attente" | "ok" | "non">("attente");
  const [cherche, setCherche] = useState(false);
  const [trouve, setTrouve] = useState<Trouve | null>(null);
  const [lieu, setLieu] = useState<Lieu>("placard");
  const occupe = useRef(false); // un produit est à l'écran, ou en cours de recherche : on ne lit pas le suivant
  const habitudes = useLiveQuery(() => db.cuisine_habitudes.toArray(), [], []);
  useEcranAllume();
  useEffect(() => {
    addEventListener("echo-retour", onQuitter);
    return () => removeEventListener("echo-retour", onQuitter);
  }, [onQuitter]);

  const dernier = useRef({ code: "", vu: 0 }); // le code qu'on vient de traiter : il faut le quitter des yeux avant de le relire
  const montrer = async (code: string) => {
    if (occupe.current) return;
    occupe.current = true;
    vibrer(12); setCherche(true);
    try {
      const t = await chercherProduit(code);
      const habitudes = await db.cuisine_habitudes.toArray().catch(() => []);
      dernier.current = { code, vu: Date.now() };
      setLieu(lieuProbable(t.nom, habitudes)); setTrouve(t);
    } catch { occupe.current = false; toast("Je n'ai pas pu chercher ce produit. Réessaie."); }
    finally { setCherche(false); }
  };
  const suivant = () => { setTrouve(null); dernier.current.vu = Date.now(); occupe.current = false; };

  useEffect(() => {
    let flux: MediaStream | null = null, parti = false, minuteur = 0;
    const couper = () => { flux?.getTracks().forEach((t) => t.stop()); flux = null; };
    (async () => {
      try {
        flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (parti) { couper(); return; }
        const lecteur = await ouvrirLecteur();
        const v = video.current;
        if (parti || !v) { couper(); return; }
        v.srcObject = flux;
        await v.play();
        setCamera("ok");
        // Trois lectures par seconde suffisent, et laissent le téléphone tranquille.
        let rates = 0;
        const lire = async () => {
          if (parti) return;
          if (!occupe.current && v.readyState >= 2) {
            let code = "";
            try { code = (await lecteur.detect(v))[0]?.rawValue ?? ""; rates = 0; }
            catch { if (++rates >= 6) { couper(); setCamera("non"); return; } } // le lecteur ne marche pas ici : on tape le code
            const d = dernier.current;
            if (code && code === d.code && Date.now() - d.vu < 2500) d.vu = Date.now(); // toujours le même produit sous l'objectif
            else if (code && codeValide(code)) await montrer(code);
          }
          minuteur = window.setTimeout(lire, 330);
        };
        lire();
      } catch { couper(); if (!parti) setCamera("non"); }
    })();
    return () => { parti = true; clearTimeout(minuteur); couper(); };
    // La caméra s'ouvre une fois, à l'arrivée sur la page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="magasin scanner">
      <div className="magasin-tete">
        <button type="button" className="loupe-ouvrir" aria-label="Fermer le scanner" onClick={onQuitter}><X size={20} strokeWidth={2.2} /></button>
        <div><b>Scanner des produits</b><span>{camera === "non" ? "Caméra indisponible" : "Vise le code-barres"}</span></div>
      </div>

      <div className={`viseur${camera === "ok" && !trouve ? " actif" : ""}`} hidden={camera === "non"}>
        <video ref={video} playsInline muted aria-label="Caméra" />
        <i aria-hidden="true" />
      </div>

      {camera === "non" && !trouve && (
        <form className="g ajout-stock" autoComplete="off" onSubmit={(e) => { e.preventDefault(); const c = (e.currentTarget.elements.namedItem("code") as HTMLInputElement).value.replace(/\D/g, ""); if (c) montrer(c); }}>
          <p className="aide-champ">La caméra ou le lecteur n'a pas pu démarrer. Autorise la caméra pour Echo dans les réglages du téléphone, ou tape les chiffres sous le code-barres.</p>
          <label className="vh" htmlFor="code-barres">Chiffres du code-barres</label>
          <input id="code-barres" name="code" className="saisie" inputMode="numeric" placeholder="7610200012345" maxLength={14} enterKeyHint="search" />
          <button type="submit" className="bouton petit">Chercher</button>
        </form>
      )}

      {cherche && <div className="g barre-echo" role="status"><span className="echo-points" aria-hidden="true"><i /><i /><i /></span><b>Je cherche ce produit…</b></div>}

      {trouve && (
        <form className="g fiche-scan" autoComplete="off" onSubmit={(e) => {
          e.preventDefault();
          const f = e.currentTarget.elements, nom = (f.namedItem("nom") as HTMLInputElement).value, qte = (f.namedItem("qte") as HTMLInputElement).value;
          if (!nom.trim()) return;
          rangerScanne({ code: trouve.code, nom, qte }, lieu).then(suivant);
        }}>
          <span className="lab">{trouve.connu ? "Produit trouvé" : "Produit inconnu : écris son nom"}</span>
          <label className="vh" htmlFor="scan-nom">Nom du produit</label>
          <input id="scan-nom" name="nom" className="saisie" defaultValue={trouve.nom} placeholder="Nom du produit" maxLength={60} autoFocus={!trouve.connu} enterKeyHint="done"
            onBlur={(e) => { if (!trouve.connu && e.target.value.trim()) setLieu(lieuProbable(e.target.value, habitudes)); }} />
          <label className="vh" htmlFor="scan-qte">Taille</label>
          <input id="scan-qte" name="qte" className="saisie" defaultValue={trouve.qte} placeholder="Taille (25 cl, 500 g…)" maxLength={20} enterKeyHint="done" />
          <div className="stock-restes" role="group" aria-label="Où le ranger">
            {LIEUX.map((l) => <button key={l.id} type="button" className="puce" aria-pressed={lieu === l.id} onClick={() => setLieu(l.id)}>{l.nom}</button>)}
          </div>
          <div className="rangee">
            <button type="submit" className="bouton">Ajouter au stock</button>
            <button type="button" className="bouton-texte" onClick={suivant}>Passer</button>
          </div>
        </form>
      )}

      {!trouve && !cherche && camera === "ok" && <p className="note-donnees">Le même produit scanné deux fois compte pour deux. Le nom vient d'Open Food Facts : seul le numéro du code est envoyé.</p>}
    </div>
  );
}
