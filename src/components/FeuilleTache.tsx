import { useEffect, useState } from "react";
import { Drawer } from "vaul";
import type { Compris } from "../lib/comprendre";
import { auJour } from "../lib/dates";
import { NIVEAUX, niveauPropose } from "../lib/importance";
import type { Niveau, Noms, Qui, Repete, Tache } from "../lib/types";
import { ajouter, modifier, supprimer, type Brouillon } from "../data/actions";

interface Props { ouverte: boolean; tache: Tache | null; pre: Compris | null; noms: Noms; onFermer: () => void }

// La feuille du bas pour ajouter ou modifier une tâche (Vaul : on peut la tirer vers le bas pour la fermer).
export function FeuilleTache({ ouverte, tache, pre, noms, onFermer }: Props) {
  const vide: Brouillon = { titre: "", jour: auJour(), heure: "", qui: "moi", niveau: null, repete: "", note: "" };
  const [b, setB] = useState<Brouillon>(vide);
  const [sur, setSur] = useState(false);

  useEffect(() => {
    if (!ouverte) return;
    const base = tache ?? { ...vide, ...(pre || {}) };
    setB({ titre: base.titre, jour: base.jour, heure: base.heure || "", qui: base.qui, niveau: base.niveau ?? null, repete: base.repete || "", note: base.note || "" });
    setSur(false);
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
            <form onSubmit={async (e) => {
              e.preventDefault();
              const d = { ...b, titre: b.titre.trim(), note: b.note.trim() };
              if (!d.titre) return;
              if (tache) await modifier(tache.id, d); else await ajouter(d);
              onFermer();
            }}>
              <Drawer.Title asChild><h2>{tache ? "Modifier la tâche" : "Nouvelle tâche"}</h2></Drawer.Title>
              <div className="champ"><label htmlFor="f-titre">Quoi</label>
                <input className="saisie" id="f-titre" required maxLength={140} enterKeyHint="done" value={b.titre} onChange={(e) => maj({ titre: e.target.value })} autoFocus={!tache && !pre} /></div>

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
                </div></div>

              <div className="champ"><span className="lab">Pour qui</span>
                <div className="puces">
                  {(["moi", "elle", "nous"] as Qui[]).map((q) => puce(b.qui === q, () => maj({ qui: q }), q === "nous" ? "Nous deux" : noms[q], q === "elle" ? "p-elle" : ""))}
                </div></div>

              <div className="champ"><span className="lab">Importance</span>
                <div className="puces">
                  {puce(b.niveau === null, () => maj({ niveau: null }), `Proposée : ${NIVEAUX[propose].toLowerCase()}`)}
                  {([2, 1, 0] as Niveau[]).map((n) => puce(b.niveau === n, () => maj({ niveau: n }), NIVEAUX[n], n === 2 ? "p-imp" : ""))}
                </div>
                <p className="aide-champ">« Proposée » : l'app choisit avec une règle simple (heure proche, facture, rendez-vous…). L'assistant IA prendra le relais plus tard.</p>
              </div>

              <div className="champ"><span className="lab">Répéter</span>
                <div className="puces">
                  {([["", "Non"], ["jour", "Chaque jour"], ["semaine", "Chaque semaine"]] as Array<[Repete, string]>).map(([v, l]) => puce(b.repete === v, () => maj({ repete: v }), l))}
                </div></div>

              <div className="champ"><label htmlFor="f-note">Note</label>
                <textarea className="saisie" id="f-note" maxLength={1000} placeholder="Un détail, un numéro, une adresse…" value={b.note} onChange={(e) => maj({ note: e.target.value })} /></div>

              <div className="actions">
                {tache && <button type="button" className={`bouton danger${sur ? " sur" : ""}`} onClick={() => {
                  if (!sur) { setSur(true); return; }
                  onFermer(); supprimer(tache.id);
                }}>{sur ? "Touche encore" : "Supprimer"}</button>}
                <div className="droite">
                  <button type="button" className="bouton second" onClick={onFermer}>Annuler</button>
                  <button type="submit" className="bouton">{tache ? "Enregistrer" : "Ajouter"}</button>
                </div>
              </div>
            </form>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
