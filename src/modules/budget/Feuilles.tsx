import { Plus } from "pulsoicon-react";
import { useState, type ReactNode } from "react";
import { Drawer } from "vaul";
import { vibrer } from "../../lib/gestes";
import type { Noms, Personne } from "../../lib/types";
import { ajouterCategorie, ajouterDepense, ajouterPoste, arreterPoste, changerPoste, changerValeur, noterSolde, recalculerVirements, retirerDerniereValeur } from "./actions";
import {
  chf, ecrire, effets, historique, lireMontant, nomMois, plusMoisB, proposerVirements, toutesCategories, valeurDe,
  type Categorie, type Compte, type CompteSolde, type Effet, type Payeur, type Poste, type Rythme, type Sorte,
} from "./donnees";

// Les feuilles du Budget (elles montent du bas, comme la feuille d'une tâche).

function Feuille({ titre, onFermer, onValider, children }: { titre: string; onFermer: () => void; onValider?: () => void; children: ReactNode }) {
  return (
    <Drawer.Root open onOpenChange={(o) => { if (!o) onFermer(); }} repositionInputs>
      <Drawer.Portal>
        <Drawer.Overlay className="feuille-fond" />
        <Drawer.Content className="feuille" aria-describedby={undefined}>
          <div className="feuille-defile">
            <div className="poignee" aria-hidden="true" />
            <form className="budget-feuille" autoComplete="off" onSubmit={(e) => { e.preventDefault(); onValider?.(); }}>
              <Drawer.Title asChild><h2>{titre}</h2></Drawer.Title>
              {children}
            </form>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

// Le grand champ du montant, au milieu de la feuille.
function ChampMontant({ id, valeur, onChange, unite = "CHF", focus }: { id: string; valeur: string; onChange: (v: string) => void; unite?: string; focus?: boolean }) {
  return (
    <div className="budget-montant">
      <label className="vh" htmlFor={id}>Montant</label>
      <input id={id} inputMode="decimal" enterKeyHint="done" maxLength={10} placeholder="0" style={{ width: `${Math.max(1, valeur.length) + 0.4}ch` }} value={valeur} onChange={(e) => onChange(e.target.value)} autoFocus={focus} />
      <span>{unite}</span>
    </div>
  );
}
const Pied = ({ onFermer, libelle, pret }: { onFermer: () => void; libelle: string; pret: boolean }) => (
  <div className="actions"><div className="droite">
    <button type="button" className="bouton second" onClick={onFermer}>Annuler</button>
    <button type="submit" className="bouton" disabled={!pret}>{libelle}</button>
  </div></div>
);

/* ---------- Changer une valeur ---------- */

const NOM_EFFET = (e: Effet["quoi"], noms: Noms, proprio: Personne) =>
  e === "commun" ? "Reste du commun" : e === "plaisir" ? "Plaisir" : e === "epargne" ? "Épargne"
    : (e === "reste-moi") === (proprio === "moi") ? "Il te reste" : `Il reste à ${noms[e === "reste-moi" ? "moi" : "elle"]}`;

type Quand = "ce-mois" | "suivant" | "une-fois";
export function FeuilleChanger({ poste, postes, mois, noms, proprio, onFermer }: { poste: Poste; postes: Poste[]; mois: string; noms: Noms; proprio: Personne; onFermer: () => void }) {
  const part = poste.sorte === "part";
  const actuel = valeurDe(poste, mois) ?? 0;
  const [texte, setTexte] = useState(actuel ? (part ? String(actuel) : chf(actuel).replace(/ /g, "")) : "");
  const [quand, setQuand] = useState<Quand>("ce-mois");
  const [sur, setSur] = useState(false);
  const lu = part ? (/^\d{1,3}$/.test(texte.trim()) && Number(texte) <= 100 ? Number(texte) : null) : lireMontant(texte);
  const des = quand === "suivant" ? plusMoisB(mois, 1) : mois;
  const x = lu === null ? null : { c: lu, des, une: quand === "une-fois", par: proprio };
  const change = x ? effets(postes, poste.id, x) : [];
  // Rien à valider si le mois visé a déjà ce montant (« seulement ce mois » avec le même montant ne change rien non plus).
  const pareil = lu === null || lu === (valeurDe(poste, des) ?? -1);
  const histo = historique(poste);
  const calcule = poste.sorte === "virement" ? proposerVirements(postes, mois) : null;
  const titre = poste.sorte === "virement" || poste.sorte === "revenu" ? `${poste.nom} · ${poste.qui === proprio ? "toi" : noms[poste.qui ?? "moi"]}` : poste.nom;

  return (
    <Feuille titre={titre} onFermer={onFermer} onValider={async () => { if (!x || pareil) return; await changerValeur(poste.id, x); onFermer(); }}>
      <ChampMontant id="b-montant" valeur={texte} onChange={setTexte} unite={part ? "% du reste commun" : poste.rythme === "an" ? "CHF par an" : "CHF par mois"} />
      {poste.rythme === "an" && lu !== null && <p className="aide-champ centre">Soit {chf(Math.round(lu / 12))} CHF mis de côté chaque mois.</p>}

      <div className="champ"><span className="lab">À partir de</span>
        <div className="puces" role="group" aria-label="À partir de quand">
          {([["ce-mois", nomMois(mois)], ["suivant", nomMois(plusMoisB(mois, 1))], ["une-fois", `Seulement ${nomMois(mois).toLowerCase()}`]] as const).map(([id, nom]) =>
            <button key={id} type="button" className="puce" aria-pressed={quand === id} onClick={() => { vibrer(4); setQuand(id); }}>{nom}</button>)}
        </div>
        <p className="aide-champ">Les mois d'avant ne bougent pas.</p>
      </div>

      {x && !pareil && (
        <div className="champ"><span className="lab">Ce que ça change en {nomMois(des).toLowerCase()}</span>
          {change.length ? (
            <ul className="budget-effets">
              {change.map((e) => <li key={e.quoi}><span>{NOM_EFFET(e.quoi, noms, proprio)}</span><s>{chf(e.avant)}</s><b className={e.apres < e.avant ? "moins" : "plus"}>{chf(e.apres)}</b></li>)}
            </ul>
          ) : <p className="aide-champ">Aucun total ne bouge.</p>}
        </div>
      )}

      {calcule && poste.qui && calcule[poste.qui] !== actuel && (
        <div className="champ"><span className="lab">Le calcul d'Echo</span>
          <p className="aide-champ">Selon vos deux salaires, ce serait {chf(calcule[poste.qui])} pour {poste.qui === proprio ? "toi" : noms[poste.qui]} et {chf(calcule[poste.qui === "moi" ? "elle" : "moi"])} pour {poste.qui === proprio ? noms[proprio === "moi" ? "elle" : "moi"] : "toi"}. Le total versé au commun reste le même.</p>
          <button type="button" className="bouton-texte gauche" onClick={async () => { await recalculerVirements(mois, proprio); onFermer(); }}>Prendre ce calcul pour vous deux</button>
        </div>
      )}

      {poste.sorte === "foyer" && (
        <div className="champ"><span className="lab">Payé par</span>
          <div className="puces" role="group" aria-label="Le compte qui paie">
            {([["commun", "Compte commun"], ["facture", "Compte facture"]] as const).map(([id, nom]) =>
              <button key={id} type="button" className="puce" aria-pressed={(poste.compte ?? "commun") === id} onClick={() => { vibrer(4); changerPoste(poste.id, { compte: id }); }}>{nom}</button>)}
          </div>
        </div>
      )}
      {poste.rythme === "an" && (
        <div className="champ"><label htmlFor="b-echeance">La facture tombe le</label>
          <input id="b-echeance" className="saisie" type="date" value={poste.echeance ? `${mois.slice(0, 4)}-${poste.echeance}` : ""} onChange={(e) => changerPoste(poste.id, { echeance: e.target.value ? e.target.value.slice(5) : undefined })} />
        </div>
      )}

      {histo.length > 1 && (
        <div className="champ"><span className="lab">Historique</span>
          <ul className="budget-histo">
            {histo.slice(0, 5).map((v) => <li key={`${v.des}-${v.quand}-${v.une ? 1 : 0}`}><b>{ecrire(poste, v.c)}</b><span>{v.une ? `seulement ${nomMois(v.des).toLowerCase()}` : `à partir de ${nomMois(v.des).toLowerCase()} ${v.des.slice(0, 4)}`}{v.par ? ` · ${v.par === proprio ? "toi" : noms[v.par]}` : ""}</span></li>)}
          </ul>
          <button type="button" className="bouton-texte gauche" onClick={async () => { if (await retirerDerniereValeur(poste.id)) onFermer(); }}>Revenir à la valeur d'avant</button>
        </div>
      )}

      <div className="actions">
        {(poste.sorte === "foyer" || poste.sorte === "perso") && <button type="button" className={`bouton danger${sur ? " sur" : ""}`} onClick={() => { if (!sur) { setSur(true); return; } onFermer(); arreterPoste(poste, mois); }}>{sur ? "Touche encore" : "Arrêter"}</button>}
        <div className="droite">
          <button type="button" className="bouton second" onClick={onFermer}>Annuler</button>
          <button type="submit" className="bouton" disabled={pareil}>Valider</button>
        </div>
      </div>
    </Feuille>
  );
}

/* ---------- Une nouvelle charge ---------- */

export interface Nouveau { sorte: Sorte; qui?: Personne; groupe?: string }
export function FeuillePoste({ nouveau, mois, proprio, onFermer }: { nouveau: Nouveau; mois: string; proprio: Personne; onFermer: () => void }) {
  const [nom, setNom] = useState("");
  const [texte, setTexte] = useState("");
  const [rythme, setRythme] = useState<Rythme>(nouveau.groupe ? "an" : "mois");
  const [compte, setCompte] = useState<Compte>(nouveau.groupe ? "facture" : "commun");
  const c = lireMontant(texte);
  const pret = !!nom.trim() && c !== null;
  const titre = nouveau.sorte === "foyer" ? "Nouvelle charge du foyer" : nouveau.sorte === "perso" ? "Nouvelle charge perso" : "Nouvelle ligne";
  return (
    <Feuille titre={titre} onFermer={onFermer} onValider={async () => { if (!pret) return; if (await ajouterPoste({ ...nouveau, nom, c: c!, des: mois, rythme, compte, par: proprio })) onFermer(); }}>
      <ChampMontant id="b-nv-montant" valeur={texte} onChange={setTexte} unite={rythme === "an" ? "CHF par an" : "CHF par mois"} />
      <div className="champ"><label htmlFor="b-nv-nom">C'est quoi</label>
        <input id="b-nv-nom" className="saisie" maxLength={60} enterKeyHint="done" value={nom} onChange={(e) => setNom(e.target.value)} autoFocus /></div>
      <div className="champ"><span className="lab">Ça revient</span>
        <div className="puces" role="group" aria-label="Le rythme">
          {([["mois", "Chaque mois"], ["an", "Une fois par an"]] as const).map(([id, n]) => <button key={id} type="button" className="puce" aria-pressed={rythme === id} onClick={() => setRythme(id)}>{n}</button>)}
        </div>
        {rythme === "an" && <p className="aide-champ">Echo met un douzième de côté chaque mois.</p>}
      </div>
      {nouveau.sorte === "foyer" && (
        <div className="champ"><span className="lab">Payé par</span>
          <div className="puces" role="group" aria-label="Le compte qui paie">
            {([["commun", "Compte commun"], ["facture", "Compte facture"]] as const).map(([id, n]) => <button key={id} type="button" className="puce" aria-pressed={compte === id} onClick={() => setCompte(id)}>{n}</button>)}
          </div>
        </div>
      )}
      <Pied onFermer={onFermer} libelle="Ajouter" pret={pret} />
    </Feuille>
  );
}

/* ---------- Une dépense ---------- */

export function FeuilleDepense({ categories, noms, proprio, onFermer }: { categories: Categorie[]; noms: Noms; proprio: Personne; onFermer: () => void }) {
  const [texte, setTexte] = useState("");
  const [quoi, setQuoi] = useState("");
  const [cat, setCat] = useState("courses");
  const [qui, setQui] = useState<Payeur>("commun");
  const [nouvelle, setNouvelle] = useState<string | null>(null);
  const c = lireMontant(texte);
  const pret = c !== null && c > 0;
  const toutes = toutesCategories(categories);
  const autre: Personne = proprio === "moi" ? "elle" : "moi";
  return (
    <Feuille titre="Nouvelle dépense" onFermer={onFermer} onValider={async () => { if (!pret) return; const creee = nouvelle?.trim() ? await ajouterCategorie(nouvelle) : null; await ajouterDepense({ c: c!, quoi, cat: creee?.id ?? cat, qui }); onFermer(); }}>
      <ChampMontant id="b-dep-montant" valeur={texte} onChange={setTexte} focus />
      <div className="champ"><label htmlFor="b-dep-quoi">C'est quoi</label>
        <input id="b-dep-quoi" className="saisie" maxLength={80} enterKeyHint="done" value={quoi} onChange={(e) => setQuoi(e.target.value)} /></div>
      <div className="champ"><span className="lab">Catégorie</span>
        <div className="puces" role="group" aria-label="Catégorie">
          {toutes.map((k) => <button key={k.id} type="button" className="puce" aria-pressed={cat === k.id && nouvelle === null} onClick={() => { vibrer(4); setCat(k.id); setNouvelle(null); }}>{k.nom}</button>)}
          {nouvelle === null && <button type="button" className="puce puce-plus" onClick={() => setNouvelle("")}><Plus size={14} strokeWidth={2.6} animated={false} />Nouvelle</button>}
        </div>
        {nouvelle !== null && (
          <>
            <label className="vh" htmlFor="b-dep-cat">Nom de la nouvelle catégorie</label>
            <input id="b-dep-cat" className="saisie" maxLength={30} placeholder="Nom de la catégorie" enterKeyHint="done" value={nouvelle} onChange={(e) => setNouvelle(e.target.value)} autoFocus />
            <p className="aide-champ">Elle est gardée pour vous deux.</p>
          </>
        )}
      </div>
      <div className="champ"><span className="lab">Qui a payé</span>
        <div className="puces" role="group" aria-label="Qui a payé">
          {([["commun", "Compte commun"], [proprio, noms[proprio]], [autre, noms[autre]]] as Array<[Payeur, string]>).map(([id, n]) =>
            <button key={id} type="button" className={`puce${id === "elle" ? " p-elle" : ""}`} aria-pressed={qui === id} onClick={() => { vibrer(4); setQui(id); }}>{n}</button>)}
        </div>
        {qui !== "commun" && <p className="aide-champ">Payé avec {qui === proprio ? "ton argent" : `l'argent de ${noms[qui]}`} : c'est noté dans Entre nous, pour que le compte commun le rende.</p>}
      </div>
      <Pied onFermer={onFermer} libelle="Ajouter" pret={pret} />
    </Feuille>
  );
}

/* ---------- Noter un vrai solde ---------- */

export function FeuilleSolde({ compte, onFermer }: { compte: CompteSolde; onFermer: () => void }) {
  const [texte, setTexte] = useState("");
  const c = lireMontant(texte);
  return (
    <Feuille titre={compte === "epargne" ? "Le solde de l'épargne" : "Le solde du compte facture"} onFermer={onFermer} onValider={async () => { if (c === null) return; await noterSolde(compte, c); onFermer(); }}>
      <ChampMontant id="b-solde" valeur={texte} onChange={setTexte} focus />
      <p className="aide-champ centre">Le chiffre que tu vois dans ta banque aujourd'hui.</p>
      <Pied onFermer={onFermer} libelle="Noter" pret={c !== null} />
    </Feuille>
  );
}
