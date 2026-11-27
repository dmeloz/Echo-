import { useLiveQuery } from "dexie-react-hooks";
import { Camera, ChevronLeft } from "pulsoicon-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { libelleJour } from "../../lib/dates";
import { vibrer } from "../../lib/gestes";
import { Coche } from "./Courses";
import { LIEUX, montant, type LectureTicket, type Rangement } from "./donnees";
import { ErreurTicket, dejaRange, jourDuTicket, lireTicket, rangerTicket } from "./ticket";

// Le bouton « Prendre le ticket en photo » : ouvre l'appareil photo, envoie la photo à Echo, rend la lecture.
export function PhotoTicket({ onLu, discret = false }: { onLu: (lu: LectureTicket) => void; discret?: boolean }) {
  const [lit, setLit] = useState(false);
  const champ = useRef<HTMLInputElement>(null);
  const lire = async (fichier: File | undefined) => {
    if (!fichier) return;
    setLit(true);
    try { onLu(await lireTicket(fichier)); }
    catch (e) { toast(e instanceof ErreurTicket ? e.message : "La lecture n'a pas abouti. Réessaie.", { duration: 7000 }); }
    finally { setLit(false); if (champ.current) champ.current.value = ""; }
  };
  return (
    <>
      {discret ? (
        <button type="button" className="bouton-texte lien-ticket" disabled={lit} onClick={() => champ.current?.click()}>
          <Camera size={17} strokeWidth={2} play={lit} />{lit ? "Echo lit le ticket…" : "Cocher avec le ticket de caisse"}
        </button>
      ) : (
        <button type="button" className={`bouton-photo${lit ? " lit" : ""}`} disabled={lit} onClick={() => champ.current?.click()}>
          <Camera size={22} strokeWidth={1.9} play={lit} />
          <span><b>{lit ? "Echo lit le ticket…" : "Prendre le ticket en photo"}</b>
            <small>{lit ? "Ça prend quelques secondes." : "Echo remplit le stock et coche les courses."}</small></span>
        </button>
      )}
      <input ref={champ} type="file" accept="image/*" capture="environment" hidden onChange={(e) => lire(e.target.files?.[0])} />
    </>
  );
}

const RANGEMENTS: Array<{ id: Rangement; nom: string }> = [...LIEUX, { id: "aucun", nom: "Pas au stock" }];

// Ce qu'Echo a lu : on décoche ce qui est faux, on corrige l'endroit d'un toucher, puis « Ranger ».
export function ApercuTicket({ lu, now, onFini }: { lu: LectureTicket; now: Date; onFini: () => void }) {
  const [lignes, setLignes] = useState(() => lu.lignes.map((l, i) => ({ ...l, id: i, garde: true })));
  const [envoi, setEnvoi] = useState(false);
  const deja = useLiveQuery(() => dejaRange(lu), [lu], false);
  useEffect(() => {
    document.querySelector(".defile")?.scrollTo(0, 0);
    addEventListener("echo-retour", onFini);
    return () => removeEventListener("echo-retour", onFini);
  }, [onFini]);

  const gardees = lignes.filter((l) => l.garde);
  const auStock = gardees.filter((l) => l.lieu !== "aucun").length, coches = gardees.filter((l) => l.course).length;
  const changer = (id: number, x: Partial<(typeof lignes)[number]>) => setLignes((ls) => ls.map((l) => (l.id === id ? { ...l, ...x } : l)));
  const suivant = (r: Rangement) => RANGEMENTS[(RANGEMENTS.findIndex((x) => x.id === r) + 1) % RANGEMENTS.length].id;
  const ranger = async () => {
    setEnvoi(true);
    try { await rangerTicket(lu, gardees, now); vibrer(12); onFini(); }
    catch { setEnvoi(false); toast("Pas enregistré. Libère un peu de place sur le téléphone, puis réessaie."); }
  };
  const tete = [lu.magasin, libelleJour(jourDuTicket(lu, now), now).toLowerCase(), lu.total ? montant(lu.total, lu.monnaie) : ""].filter(Boolean).join(" · ");

  return (
    <div className="reglage-page ticket">
      <button type="button" className="retour" onClick={onFini}><ChevronLeft size={20} strokeWidth={2.2} />Cuisine</button>
      <h2 className="reglage-titre">Ton ticket</h2>
      <p className="ticket-tete">{tete}</p>
      {deja && <p className="ticket-note alerte" role="status">Ce ticket a déjà été rangé (même magasin, même jour, même total).</p>}
      {lu.remarque && <p className="ticket-note" role="status">{lu.remarque}</p>}
      <ul className="g liste-ticket">
        {lignes.map((l) => (
          <li key={l.id} className={l.garde ? "" : "non"}>
            <button type="button" className={`case${l.garde ? " cochee" : ""}`} role="checkbox" aria-checked={l.garde} aria-label={`Garder ${l.nom}`} onClick={() => changer(l.id, { garde: !l.garde })}>{l.garde && <Coche />}</button>
            <div className="ticket-nom">
              <b>{l.nom}{l.qte && <i> {l.qte}</i>}</b>
              <span>{[l.prix ? montant(l.prix, lu.monnaie) : "", l.course && l.garde ? "coche « " + l.course + " »" : "", l.sur ? "" : "à vérifier"].filter(Boolean).join(" · ")}</span>
            </div>
            <button type="button" className={`puce lieu-ticket${l.lieu === "aucun" ? " aucun" : ""}`} disabled={!l.garde} aria-label={`Rangement de ${l.nom} : ${RANGEMENTS.find((r) => r.id === l.lieu)!.nom}. Toucher pour changer.`} onClick={() => changer(l.id, { lieu: suivant(l.lieu) })}>
              {RANGEMENTS.find((r) => r.id === l.lieu)!.nom}
            </button>
          </li>
        ))}
      </ul>
      <p className="note-donnees">Touche l'endroit pour le changer. Pour le frais, Echo estime la date à manger avant. La photo n'est pas gardée.</p>
      <div className="ticket-pied">
        <button type="button" className="bouton" disabled={envoi || !gardees.length} onClick={ranger}>
          Ranger{auStock ? ` ${auStock} au stock` : ""}{coches ? `, cocher ${coches}` : ""}
        </button>
      </div>
    </div>
  );
}
