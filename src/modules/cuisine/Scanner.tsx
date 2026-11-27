import { useLiveQuery } from "dexie-react-hooks";
import { X } from "pulsoicon-react";
import { useEffect, useRef, useState } from "react";
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

  const montrer = async (code: string) => {
    if (occupe.current) return;
    occupe.current = true;
    vibrer(12); setCherche(true);
    const t = await chercherProduit(code);
    setCherche(false); setTrouve(t); setLieu(lieuProbable(t.nom, await db.cuisine_habitudes.toArray()));
  };
  const suivant = () => { setTrouve(null); occupe.current = false; };

  useEffect(() => {
    let flux: MediaStream | null = null, parti = false, minuteur = 0;
    (async () => {
      try {
        const [f, lecteur] = await Promise.all([navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false }), ouvrirLecteur()]);
        flux = f;
        const v = video.current;
        if (parti || !v) { f.getTracks().forEach((t) => t.stop()); return; }
        v.srcObject = f;
        await v.play();
        setCamera("ok");
        // Trois lectures par seconde suffisent, et laissent le téléphone tranquille.
        const lire = async () => {
          if (parti) return;
          if (!occupe.current && v.readyState >= 2) {
            const code = (await lecteur.detect(v).catch(() => []))[0]?.rawValue;
            if (code && codeValide(code)) await montrer(code);
          }
          minuteur = window.setTimeout(lire, 330);
        };
        lire();
      } catch { if (!parti) setCamera("non"); }
    })();
    return () => { parti = true; clearTimeout(minuteur); flux?.getTracks().forEach((t) => t.stop()); };
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
          <p className="aide-champ">Autorise la caméra pour Echo dans les réglages du téléphone, ou tape les chiffres sous le code-barres.</p>
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
