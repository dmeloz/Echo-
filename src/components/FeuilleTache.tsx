import { useLiveQuery } from "dexie-react-hooks";
import { Camera, X } from "pulsoicon-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Drawer } from "vaul";
import { trembler } from "../lib/gestes";
import type { Compris } from "../lib/comprendre";
import { auJour, nouvelId } from "../lib/dates";
import { reduirePhoto } from "../lib/photos";
import { db, type Photo } from "../data/db";

const AUCUNE: Photo[] = [];
import { NIVEAUX, niveauPropose } from "../lib/importance";
import type { Niveau, Noms, Personne, Qui, Repete, Tache } from "../lib/types";
import { ajouter, modifier, supprimer, type Brouillon } from "../data/actions";

interface Props { ouverte: boolean; tache: Tache | null; pre: Compris | null; noms: Noms; proprio: Personne; onFermer: () => void }

// La feuille du bas pour ajouter ou modifier une tâche (Vaul : on peut la tirer vers le bas pour la fermer).
export function FeuilleTache({ ouverte, tache, pre, noms, proprio, onFermer }: Props) {
  const vide: Brouillon = { titre: "", jour: auJour(), heure: "", qui: proprio, niveau: null, repete: "", note: "" };
  const [b, setB] = useState<Brouillon>(vide);
  const [sur, setSur] = useState(false);
  const [nouvelleEtape, setNouvelleEtape] = useState("");
  const [photosAjoutees, setPhotosAjoutees] = useState<Blob[]>([]);
  const [photosRetirees, setPhotosRetirees] = useState<string[]>([]); // retirées pour de bon seulement à « Enregistrer »
  const [envoi, setEnvoi] = useState(false);
  const photosEnregistrees = useLiveQuery(() => (tache ? db.photos.where("tacheId").equals(tache.id).sortBy("cree") : []), [tache?.id]) ?? AUCUNE;
  const urls = useMemo(() => ({
    anciennes: photosEnregistrees.map((p) => ({ id: p.id, url: URL.createObjectURL(p.blob) })),
    nouvelles: photosAjoutees.map((b) => URL.createObjectURL(b)),
  }), [photosEnregistrees, photosAjoutees]);
  useEffect(() => () => { urls.anciennes.forEach((u) => URL.revokeObjectURL(u.url)); urls.nouvelles.forEach((u) => URL.revokeObjectURL(u)); }, [urls]);

  useEffect(() => {
    if (!ouverte) return;
    const base = tache ?? { ...vide, ...(pre || {}) };
    setB({ titre: base.titre, jour: base.jour, heure: base.heure || "", qui: base.qui, niveau: base.niveau ?? null, repete: base.repete || "", note: base.note || "", etapes: base.etapes ? [...base.etapes] : [], evt: !!base.evt, fin: base.fin ?? "" });
    setSur(false); setNouvelleEtape(""); setPhotosAjoutees([]); setPhotosRetirees([]); setEnvoi(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouverte, tache, pre]);

  const maj = (x: Partial<Brouillon>) => setB((d) => ({ ...d, ...x }));
  const today = auJour(), demain = auJour(1);
  const autreJour = b.jour !== today && b.jour !== demain;
  const propose = niveauPropose({ titre: b.titre, jour: b.jour, heure: b.heure });
  const puce = (actif: boolean, onClick: () => void, texte: string, extra = "") => (
    <button type="button" className={`puce ${extra}`} aria-pressed={actif} onClick={onClick}>{texte}</button>
  );

  return (
    <Drawer.Root open={ouverte} onOpenChange={(o) => { if (!o) onFermer(); }} repositionInputs>
      <Drawer.Portal>
        <Drawer.Overlay className="feuille-fond" />
        <Drawer.Content className="feuille" aria-describedby={undefined}>
          <div className="feuille-defile">
            <div className="poignee" aria-hidden="true" />
            <form className={b.evt ? "feuille-evt" : undefined} onSubmit={async (e) => {
              e.preventDefault();
              const formulaire = e.currentTarget;
              const etapes = [...(b.etapes || []), ...(nouvelleEtape.trim() ? [{ id: nouvelId(), texte: nouvelleEtape.trim(), fait: false }] : [])];
              const d = { ...b, titre: b.titre.trim(), note: b.note.trim(), etapes, evt: !!b.evt, fin: b.evt && b.heure && (b.fin ?? "") > b.heure ? b.fin : "" };
              if (!d.titre || envoi) return;
              setEnvoi(true);
              try {
                if (tache) await modifier(tache.id, d, photosAjoutees, photosRetirees); else await ajouter(d, photosAjoutees);
                onFermer();
              } catch {
                // Rien n'est perdu : la feuille reste ouverte avec ce qui a été écrit.
                setEnvoi(false);
                trembler(formulaire);
                toast("Pas enregistré. Le téléphone manque peut-être de place : libère un peu de stockage (ou retire une photo), puis réessaie.", { duration: 7000 });
              }
            }}>
              <Drawer.Title asChild><h2>{b.evt ? (tache ? "Modifier l'événement" : "Nouvel événement") : (tache ? "Modifier la tâche" : "Nouvelle tâche")}</h2></Drawer.Title>
              {tache?.ical?.serie && <p className="aide-champ">Cet événement se répète dans iCloud : change-le dans l'app Calendrier, il suivra ici.</p>}
              <div className="champ"><label htmlFor="f-titre">Quoi</label>
                <input className="saisie" id="f-titre" required maxLength={140} enterKeyHint="done" value={b.titre} onChange={(e) => maj({ titre: e.target.value })} autoFocus={!tache && !pre} /></div>

              <div className="champ"><span className="lab">C'est</span>
                <div className="puces">
                  {puce(!b.evt, () => maj({ evt: false }), "Une tâche")}
                  {puce(!!b.evt, () => maj({ evt: true, repete: "" }), "Un événement")}
                </div></div>

              <div className="champ"><span className="lab">Quand</span>
                <div className="puces">
                  {puce(b.jour === today, () => maj({ jour: today }), "Aujourd'hui")}
                  {puce(b.jour === demain, () => maj({ jour: demain }), "Demain")}
                  <span className="puce" aria-pressed={autreJour}><label className="vh" htmlFor="f-date">Autre jour</label>
                    <input type="date" id="f-date" value={b.jour} onChange={(e) => e.target.value && maj({ jour: e.target.value })} /></span>
                </div></div>

              <div className="champ"><span className="lab">Heure</span>
                <div className="puces">
                  {puce(!b.heure, () => maj({ heure: "" }), "Sans heure")}
                  <span className="puce" aria-pressed={!!b.heure}><label className="vh" htmlFor="f-time">Choisir l'heure</label>
                    <input type="time" id="f-time" value={b.heure} onChange={(e) => maj({ heure: e.target.value || "" })} /></span>
                  {b.evt && b.heure && <span className="puce" aria-pressed={!!b.fin}><label htmlFor="f-fin">Fin</label>
                    <input type="time" id="f-fin" value={b.fin ?? ""} onChange={(e) => maj({ fin: e.target.value || "" })} /></span>}
                </div></div>

              <div className="champ"><span className="lab">Pour qui</span>
                <div className="puces">
                  {(["moi", "elle", "nous"] as Qui[]).map((q) => puce(b.qui === q, () => maj({ qui: q }), q === "nous" ? "Nous deux" : noms[q], q === "elle" ? "p-elle" : ""))}
                </div></div>

              <div className="champ seul-tache"><span className="lab">Importance</span>
                <div className="puces">
                  {puce(b.niveau === null, () => maj({ niveau: null }), `Proposée : ${NIVEAUX[propose].toLowerCase()}`)}
                  {([2, 1, 0] as Niveau[]).map((n) => puce(b.niveau === n, () => maj({ niveau: n }), NIVEAUX[n], n === 2 ? "p-imp" : ""))}
                </div>
                <p className="aide-champ">« Proposée » : l'app choisit avec une règle simple (heure proche, facture, rendez-vous…). L'assistant IA prendra le relais plus tard.</p>
              </div>

              <div className="champ seul-tache"><span className="lab">Répéter</span>
                <div className="puces">
                  {([["", "Non"], ["jour", "Chaque jour"], ["semaine", "Chaque semaine"]] as Array<[Repete, string]>).map(([v, l]) => puce(b.repete === v, () => maj({ repete: v }), l))}
                </div></div>

              <div className="champ seul-tache"><span className="lab">Étapes</span>
                {(b.etapes || []).length > 0 && (
                  <ul className="etapes">
                    {(b.etapes || []).map((e) => (
                      <li key={e.id} className={e.fait ? "fait" : undefined}>
                        <label><input type="checkbox" checked={e.fait} onChange={() => maj({ etapes: b.etapes!.map((x) => (x.id === e.id ? { ...x, fait: !x.fait } : x)) })} /><span>{e.texte}</span></label>
                        <button type="button" className="retirer" aria-label={`Retirer l'étape ${e.texte}`} onClick={() => maj({ etapes: b.etapes!.filter((x) => x.id !== e.id) })}><X size={16} strokeWidth={2.2} /></button>
                      </li>
                    ))}
                  </ul>
                )}
                <input className="saisie" id="f-etape" placeholder="Ajouter une étape, puis Entrée" enterKeyHint="enter" value={nouvelleEtape} onChange={(e) => setNouvelleEtape(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const texte = nouvelleEtape.trim();
                    if (texte) { maj({ etapes: [...(b.etapes || []), { id: nouvelId(), texte, fait: false }] }); setNouvelleEtape(""); }
                  }} />
              </div>

              <div className="champ"><span className="lab">Photos</span>
                <div className="photos">
                  {urls.anciennes.filter((p) => !photosRetirees.includes(p.id)).map((p) => (
                    <span key={p.id} className="photo"><a href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt="Photo de la tâche" /></a>
                      <button type="button" className="retirer" aria-label="Retirer la photo" onClick={() => setPhotosRetirees((l) => [...l, p.id])}><X size={14} strokeWidth={2.4} /></button></span>
                  ))}
                  {urls.nouvelles.map((u, i) => (
                    <span key={u} className="photo"><img src={u} alt="Nouvelle photo" />
                      <button type="button" className="retirer" aria-label="Retirer la photo" onClick={() => setPhotosAjoutees((l) => l.filter((_, k) => k !== i))}><X size={14} strokeWidth={2.4} /></button></span>
                  ))}
                  <label className="ajout-photo"><Camera size={22} strokeWidth={2} /><span>Ajouter</span>
                    <input type="file" accept="image/*" multiple className="vh" onChange={async (e) => {
                      const fichiers = [...(e.target.files || [])];
                      e.target.value = "";
                      const reduites = await Promise.all(fichiers.map((f) => reduirePhoto(f)));
                      setPhotosAjoutees((l) => [...l, ...reduites]);
                    }} /></label>
                </div>
              </div>

              <div className="champ"><label htmlFor="f-note">Note</label>
                <textarea className="saisie" id="f-note" maxLength={1000} placeholder="Un détail, un numéro, une adresse…" value={b.note} onChange={(e) => maj({ note: e.target.value })} /></div>

              <div className="actions">
                {tache && <button type="button" className={`bouton danger${sur ? " sur" : ""}`} onClick={() => {
                  if (!sur) { setSur(true); return; }
                  onFermer(); supprimer(tache.id);
                }}>{sur ? "Touche encore" : "Supprimer"}</button>}
                <div className="droite">
                  <button type="button" className="bouton second" onClick={onFermer}>Annuler</button>
                  <button type="submit" className="bouton" disabled={envoi}>{tache ? "Enregistrer" : "Ajouter"}</button>
                </div>
              </div>
            </form>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
