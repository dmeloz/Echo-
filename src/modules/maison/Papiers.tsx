import { useLiveQuery } from "dexie-react-hooks";
import { Camera, Car, ChevronLeft, FileText, Folder, HeartPulse, House, IdCard, Landmark, Plus, Repeat, ShieldCheck, X } from "pulsoicon-react";
import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { db } from "../../data/db";
import { nouvelId, sansAccents } from "../../lib/dates";
import { vibrer } from "../../lib/gestes";
import { reduirePhoto } from "../../lib/photos";
import type { ContexteModule } from "../contrat";
import { ajouterPapier, changerPapier, papierFait, retirerPapier } from "./actions";
import { DOSSIERS, QUOIS, REPETES, aFairePapier, bientot, joursAvant, lireMontant, lirePapier, nomDossier, quandPapier, texteMontant, type Dossier, type Papier } from "./donnees";
import { envoyerEnAttente, garderPhoto, oublierPhotos, photosDe } from "./photosPapiers";

// Les papiers du foyer : en haut ce qui arrive bientôt, puis les dossiers. Tout se fait à la main ; Echo aide, il n'est pas obligé.

const ICONES: Record<Dossier, ComponentType<{ size?: number; strokeWidth?: number; animated?: boolean }>> = {
  impots: Landmark, logement: House, assurances: ShieldCheck, sante: HeartPulse, vehicule: Car, abonnements: Repeat, identite: IdCard, garanties: FileText, autre: Folder,
};
const trier = (a: Papier, b: Papier) => joursAvant(a) - joursAvant(b) || b.cree - a.cree;
// La petite ligne sous le titre, le plus utile d'abord : « dans 5 jours · 89.90 CHF · à payer · Abonnements ».
const sous = (p: Papier, now: Date, avecDossier = false) => [
  aFairePapier(p) ? quandPapier(p, now) : "",
  p.montant ? texteMontant(p.montant) : "",
  p.fait ? QUOIS.find((q) => q.id === p.quoi)?.fait : aFairePapier(p) ? QUOIS.find((q) => q.id === p.quoi)?.nom.toLowerCase() : "",
  !p.quoi ? p.emetteur : "",
  avecDossier ? nomDossier(p.dossier) : "",
].filter(Boolean).join(" · ").replace(/^./, (c) => c.toUpperCase());

function Champ({ nom, valeur, onChange, ...reste }: { nom: string; valeur: string; onChange: (v: string) => void; maxLength?: number; inputMode?: "decimal"; placeholder?: string }) {
  const [v, setV] = useState(valeur);
  useEffect(() => setV(valeur), [valeur]);
  return <input aria-label={nom} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v.trim() !== valeur) onChange(v.trim()); }} enterKeyHint="done" {...reste} />;
}

function Photos({ p }: { p: Papier }) {
  const [vues, setVues] = useState<Array<{ nom: string; url: string }>>([]);
  const noms = p.photos.join(",");
  useEffect(() => {
    let fini = false; let urls: string[] = [];
    photosDe(p).then((l) => { if (fini) return; const v = l.map((x) => ({ nom: x.nom, url: URL.createObjectURL(x.blob) })); urls = v.map((x) => x.url); setVues(v); }).catch(() => {});
    return () => { fini = true; urls.forEach((u) => URL.revokeObjectURL(u)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.id, noms]);
  const ajouter = async (fichiers: File[]) => {
    const ajoutees: string[] = [];
    for (const f of fichiers.slice(0, 12 - p.photos.length)) ajoutees.push(await garderPhoto(p, await reduirePhoto(f), nouvelId()));
    if (ajoutees.length) await changerPapier(p.id, { photos: [...p.photos, ...ajoutees] });
  };
  return (
    <div className="photos">
      {vues.map((v) => (
        <span key={v.nom} className="photo"><a href={v.url} target="_blank" rel="noreferrer"><img src={v.url} alt={`Photo de ${p.titre}`} /></a>
          <button type="button" className="retirer" aria-label="Retirer la photo" onClick={async () => { await changerPapier(p.id, { photos: p.photos.filter((n) => n !== v.nom) }); oublierPhotos([v.nom]).catch(() => {}); }}><X size={14} strokeWidth={2.4} /></button></span>
      ))}
      {p.photos.length < 12 && (
        <label className="ajout-photo"><Camera size={22} strokeWidth={2} /><span>Photo</span>
          <input type="file" accept="image/*" multiple className="vh" onChange={(e) => { const f = [...(e.target.files || [])]; e.target.value = ""; ajouter(f).catch(() => {}); }} /></label>
      )}
    </div>
  );
}

function Detail({ p, onFermer }: { p: Papier; onFermer: () => void }) {
  return (
    <div className="stock-plus">
      <Photos p={p} />
      <span className="lab">Dossier</span>
      <div className="stock-restes" role="group" aria-label={`Le dossier de ${p.titre}`}>
        {DOSSIERS.map((d) => <button key={d.id} type="button" className="puce" aria-pressed={p.dossier === d.id} onClick={() => { vibrer(); changerPapier(p.id, { dossier: d.id }); }}>{d.nom}</button>)}
      </div>
      <span className="lab">À faire</span>
      <div className="stock-restes" role="group" aria-label={`Ce qu'il y a à faire pour ${p.titre}`}>
        {QUOIS.map((q) => <button key={q.id} type="button" className="puce" aria-pressed={p.quoi === q.id} onClick={() => { vibrer(); changerPapier(p.id, { quoi: q.id, fait: undefined }); }}>{q.nom}</button>)}
      </div>
      {p.quoi && <>
        <label className="puce">Pour le <input type="date" max="2099-12-31" value={p.echeance ?? ""} onChange={(e) => changerPapier(p.id, { echeance: e.target.value || undefined, fait: undefined })} /></label>
        <div className="stock-restes" role="group" aria-label="Ça revient">
          {REPETES.map((r) => <button key={r.id} type="button" className="puce" aria-pressed={p.repete === r.id} onClick={() => { vibrer(); changerPapier(p.id, { repete: r.id }); }}>{r.nom}</button>)}
        </div>
      </>}
      {p.quoi === "payer" && <Champ nom="Le montant" valeur={p.montant ? texteMontant(p.montant).replace(" CHF", "") : ""} inputMode="decimal" maxLength={12} placeholder="Le montant en francs" onChange={(v) => changerPapier(p.id, { montant: lireMontant(v) })} />}
      <Champ nom="De qui" valeur={p.emetteur} maxLength={60} placeholder="De qui : « Swisscom », « le propriétaire »" onChange={(emetteur) => changerPapier(p.id, { emetteur })} />
      <Champ nom="Une note" valeur={p.note} maxLength={300} placeholder="Une note : numéro de contrat, référence…" onChange={(note) => changerPapier(p.id, { note })} />
      <button type="button" className="bouton-texte danger" onClick={() => { onFermer(); retirerPapier(p, oublierPhotos); }}>Retirer</button>
    </div>
  );
}

function Ligne({ p, now, ouvert, onOuvrir, avecDossier }: { p: Papier; now: Date; ouvert: boolean; onOuvrir: (id: string | null) => void; avecDossier?: boolean }) {
  const n = joursAvant(p, now), q = QUOIS.find((x) => x.id === p.quoi);
  return (
    <li className={ouvert ? "ouvert" : ""}>
      <div className="corvee">
        {aFairePapier(p) && <button type="button" className="coche" aria-label={`${p.titre} : ${q?.fait.toLowerCase()}`} onClick={() => { vibrer(12); onOuvrir(null); papierFait(p, now); }} />}
        <button type="button" className="stock-ligne" aria-expanded={ouvert} onClick={() => onOuvrir(ouvert ? null : p.id)}>
          <b>{p.titre}<small>{sous(p, now, avecDossier)}</small></b>
          {aFairePapier(p) && n <= 7 && <span className={`compte${n < 0 ? " attend" : " en-cours"}`}>{n < 0 ? "En retard" : "Bientôt"}</span>}
        </button>
      </div>
      {ouvert && <Detail p={p} onFermer={() => onOuvrir(null)} />}
    </li>
  );
}

export function Papiers({ now, choix }: ContexteModule & { choix: ReactNode }) {
  const papiers = useLiveQuery(() => db.maison_papiers.toArray(), [], undefined);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [texte, setTexte] = useState("");
  useEffect(() => { envoyerEnAttente().catch(() => {}); }, []);
  useEffect(() => {
    if (!dossier) return;
    const retour = () => setDossier(null);
    addEventListener("echo-retour", retour);
    return () => removeEventListener("echo-retour", retour);
  }, [dossier]);
  useEffect(() => { document.querySelector(".defile")?.scrollTo(0, 0); }, [dossier]);
  const cherche = sansAccents(texte.trim());
  const trouves = useMemo(() => (cherche.length < 2 || !papiers ? [] : papiers.filter((p) => sansAccents(`${p.titre} ${p.emetteur} ${p.note} ${nomDossier(p.dossier)}`).includes(cherche)).sort(trier)), [cherche, papiers]);
  if (papiers === undefined) return null;

  const ajouter = async (dans?: Dossier) => {
    const lu = lirePapier(texte, now);
    if (!lu) return;
    const p = await ajouterPapier({ ...lu, ...(dans ? { dossier: dans } : {}) });
    setTexte("");
    if (p) setOuvert(p.id);
  };
  // Une photo d'abord : le papier est créé avec sa photo, on complète ensuite.
  const photographier = async (fichiers: File[], dans?: Dossier) => {
    if (!fichiers.length) return;
    const p = await ajouterPapier({ titre: `Papier du ${now.toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} ${nouvelId().slice(-3)}`, dossier: dans ?? "autre" }, true);
    if (!p) return;
    const noms: string[] = [];
    for (const f of fichiers.slice(0, 12)) noms.push(await garderPhoto(p, await reduirePhoto(f), nouvelId()));
    await changerPapier(p.id, { photos: noms });
    setOuvert(p.id); if (!dans) setDossier(p.dossier);
  };
  const barre = (dans?: Dossier) => (
    <form className="g ajout-courses" autoComplete="off" onSubmit={(e) => { e.preventDefault(); ajouter(dans); }}>
      <label className="vh" htmlFor="ajout-papier">Ajouter ou chercher un papier</label>
      <input id="ajout-papier" enterKeyHint="done" maxLength={100} placeholder={dans ? "Ajouter dans ce dossier" : "Ajouter ou chercher un papier"} value={texte} onChange={(e) => setTexte(e.target.value)} />
      {texte.trim()
        ? <button type="submit" className="rond-champ plein" aria-label="Ajouter le papier"><Plus size={20} strokeWidth={2.4} /></button>
        : <label className="rond-champ" aria-label="Prendre un papier en photo"><Camera size={20} strokeWidth={2} />
            <input type="file" accept="image/*" multiple className="vh" onChange={(e) => { const f = [...(e.target.files || [])]; e.target.value = ""; photographier(f, dans).catch(() => {}); }} /></label>}
    </form>
  );
  const liste = (l: Papier[], avecDossier = false) => <ul>{l.map((p) => <Ligne key={p.id} p={p} now={now} ouvert={ouvert === p.id} onOuvrir={setOuvert} avecDossier={avecDossier} />)}</ul>;

  if (dossier) {
    const dedans = papiers.filter((p) => p.dossier === dossier).sort(trier);
    return (
      <>
        <div className="partie-tete">
          <button type="button" className="retour" onClick={() => setDossier(null)}><ChevronLeft size={20} strokeWidth={2.2} />Papiers</button>
          <h2 className="reglage-titre">{nomDossier(dossier)}</h2>
        </div>
        {barre(dossier)}
        {dedans.length ? <section className="g liste-stock corvees">{liste(dedans)}</section> : <p className="phrase">Rien dans ce dossier pour l'instant.</p>}
      </>
    );
  }

  const proches = papiers.filter((p) => bientot(p, now)).sort(trier);
  const total = proches.reduce((s, p) => s + (p.quoi === "payer" && p.montant ? p.montant : 0), 0);
  return (
    <>
      {choix}
      <p className="phrase">
        <b>{proches.length > 1 ? `${proches.length} choses dans les 30 jours.` : proches.length ? "1 chose dans les 30 jours." : "Rien d'urgent dans vos papiers."}</b>
        {total > 0 && ` ${texteMontant(total)} à payer.`}
        {!papiers.length && " Écris « facture Swisscom 89.90 le 15.12 », ou prends le papier en photo."}
      </p>
      {barre()}
      {cherche.length >= 2 && trouves.length > 0 && <section className="g liste-stock corvees"><span className="lab">Trouvé</span>{liste(trouves, true)}</section>}
      {proches.length > 0 && !trouves.length && <section className="g liste-stock corvees"><span className="lab">Bientôt</span>{liste(proches, true)}</section>}
      <div className="dossiers">
        {DOSSIERS.map((d) => {
          const Icone = ICONES[d.id], n = papiers.filter((p) => p.dossier === d.id).length;
          return (
            <button key={d.id} type="button" className="g dossier" onClick={() => { setOuvert(null); setTexte(""); setDossier(d.id); }}>
              <span className="tuile-icone" aria-hidden="true"><Icone size={18} strokeWidth={1.8} animated={false} /></span>
              <b>{d.nom}<small>{n > 1 ? `${n} papiers` : n ? "1 papier" : "Vide"}</small></b>
            </button>
          );
        })}
      </div>
    </>
  );
}
