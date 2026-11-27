import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, ChevronRight, Phone, Plus, WashingMachine } from "pulsoicon-react";
import { useEffect, useState, type ReactNode } from "react";
import { db } from "../../data/db";
import { iso, libelleJour } from "../../lib/dates";
import { vibrer } from "../../lib/gestes";
import type { ContexteModule } from "../contrat";
import { ajouterAppareil, ajouterContact, ajouterCorvees, ajouterReparation, changerAppareil, changerContact, changerReparation, etatReparation, memeNom, retirerAppareil, retirerContact, retirerReparation } from "./actions";
import { LigneCorvee } from "./Corvee";
import { ETATS_REPARATION, GARANTIES, aFaire, gestesPour, jourDu, lireContact, lireCorvee, texteGarantie, type Appareil, type Contact, type Corvee, type Reparation } from "./donnees";

// L'entretien : ce qui est cassé en haut, ce qui s'entretient en dessous, puis les appareils et les contacts.

// Un champ qui s'écrit tout seul : enregistré quand on le quitte.
function Champ({ nom, valeur, onChange, ...reste }: { nom: string; valeur: string; onChange: (v: string) => void; type?: string; maxLength?: number; inputMode?: "tel"; placeholder?: string }) {
  const [v, setV] = useState(valeur);
  useEffect(() => setV(valeur), [valeur]);
  return <input aria-label={nom} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v.trim() !== valeur) onChange(v.trim()); }} enterKeyHint="done" {...reste} />;
}
// La petite barre « Ajouter » en bas d'une liste.
function Ajout({ id, nom, exemple, onAjout }: { id: string; nom: string; exemple: string; onAjout: (texte: string) => void }) {
  const [texte, setTexte] = useState("");
  return (
    <form className="ajout-courses ajout-dans" autoComplete="off" onSubmit={(e) => { e.preventDefault(); if (!texte.trim()) return; onAjout(texte); setTexte(""); }}>
      <label className="vh" htmlFor={id}>{nom}</label>
      <input id={id} enterKeyHint="done" maxLength={80} placeholder={exemple} value={texte} onChange={(e) => setTexte(e.target.value)} />
      {texte.trim() && <button type="submit" className="rond-champ plein" aria-label={nom}><Plus size={20} strokeWidth={2.4} /></button>}
    </form>
  );
}

function DetailReparation({ r, appareils, onFermer }: { r: Reparation; appareils: Appareil[]; onFermer: () => void }) {
  return (
    <div className="stock-plus">
      <div className="stock-restes" role="group" aria-label={`Où en est ${r.nom}`}>
        {ETATS_REPARATION.map((e) => <button key={e.id} type="button" className="puce" aria-pressed={r.etat === e.id} onClick={() => { vibrer(); if (e.id === 3) onFermer(); etatReparation(r, e.id); }}>{e.nom}</button>)}
      </div>
      <Champ nom="Une note" valeur={r.note} maxLength={200} placeholder="Une note : « régie prévenue, passage jeudi »" onChange={(note) => changerReparation(r.id, { note })} />
      {appareils.length > 0 && <span className="lab">C'est quel appareil ?</span>}
      {appareils.length > 0 && (
        <div className="stock-restes" role="group" aria-label="L'appareil concerné">
          {appareils.map((a) => <button key={a.id} type="button" className="puce" aria-pressed={r.appareil === a.id} onClick={() => { vibrer(); changerReparation(r.id, { appareil: r.appareil === a.id ? undefined : a.id }); }}>{a.nom}</button>)}
        </div>
      )}
      <button type="button" className="bouton-texte danger" onClick={() => { onFermer(); retirerReparation(r); }}>Retirer</button>
    </div>
  );
}

function DetailAppareil({ a, gestes, reparations, now, onFermer }: { a: Appareil; gestes: Corvee[]; reparations: Reparation[]; now: Date; onFermer: () => void }) {
  const proposes = gestesPour(a.nom).filter((g) => !gestes.some((c) => memeNom(c.nom, g.nom)));
  const histoire = reparations.filter((r) => r.appareil === a.id && r.etat === 3).sort((x, y) => (y.fini ?? 0) - (x.fini ?? 0));
  const garantie = texteGarantie(a, now);
  return (
    <div className="stock-plus">
      <Champ nom="La pièce" valeur={a.piece} maxLength={30} placeholder="La pièce : « buanderie »" onChange={(piece) => changerAppareil(a.id, { piece })} />
      <label className="puce">Acheté le <input type="date" max="2099-12-31" value={a.achat ?? ""} onChange={(e) => changerAppareil(a.id, { achat: e.target.value || undefined })} /></label>
      <span className="lab">Garantie</span>
      <div className="stock-restes" role="group" aria-label={`La garantie de ${a.nom}`}>
        {GARANTIES.map((g) => <button key={g.mois} type="button" className="puce" aria-pressed={a.garantie === g.mois} onClick={() => { vibrer(); changerAppareil(a.id, { garantie: g.mois }); }}>{g.nom}</button>)}
      </div>
      {a.garantie > 0 && !garantie && <p className="aide-champ">Donne la date d'achat pour savoir jusqu'à quand.</p>}
      {proposes.length > 0 && <>
        <span className="lab">À entretenir</span>
        <div className="stock-restes">
          {proposes.map((g) => <button key={g.nom} type="button" className="puce" onClick={() => { vibrer(); ajouterCorvees([{ ...g, entretien: true, appareil: a.id, piece: a.piece }]); }}>+ {g.nom}</button>)}
        </div>
      </>}
      {histoire.length > 0 && <>
        <span className="lab">Son histoire</span>
        {histoire.map((r) => <p key={r.id} className="aide-champ"><b>{r.nom}</b>, réparé {libelleJour(iso(new Date(r.fini ?? r.cree)), now).toLowerCase()}{r.note ? ` : ${r.note}` : ""}</p>)}
      </>}
      <button type="button" className="bouton-texte danger" onClick={() => { onFermer(); retirerAppareil(a); }}>Retirer</button>
    </div>
  );
}

// La page « Appareils et contacts ».
function Carnet({ appareils, contacts, gestes, reparations, now, onQuitter }: { appareils: Appareil[]; contacts: Contact[]; gestes: Corvee[]; reparations: Reparation[]; now: Date; onQuitter: () => void }) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  useEffect(() => {
    addEventListener("echo-retour", onQuitter);
    return () => removeEventListener("echo-retour", onQuitter);
  }, [onQuitter]);
  useEffect(() => { document.querySelector(".defile")?.scrollTo(0, 0); }, []);
  return (
    <>
      <div className="partie-tete">
        <button type="button" className="retour" onClick={onQuitter}><ChevronLeft size={20} strokeWidth={2.2} />Entretien</button>
        <h2 className="reglage-titre">Appareils et contacts</h2>
      </div>
      <section className="g liste-stock corvees">
        <span className="lab">Appareils</span>
        <ul>
          {appareils.map((a) => (
            <li key={a.id} className={ouvert === a.id ? "ouvert" : ""}>
              <button type="button" className="stock-ligne" aria-expanded={ouvert === a.id} onClick={() => setOuvert(ouvert === a.id ? null : a.id)}>
                <b>{a.nom}<small>{[a.piece, texteGarantie(a, now)].filter(Boolean).join(" · ")}</small></b>
              </button>
              {ouvert === a.id && <DetailAppareil a={a} gestes={gestes} reparations={reparations} now={now} onFermer={() => setOuvert(null)} />}
            </li>
          ))}
        </ul>
        <Ajout id="ajout-appareil" nom="Ajouter un appareil" exemple="Ajouter : « lave-linge »" onAjout={(t) => ajouterAppareil(t).then((a) => a && setOuvert(a.id))} />
      </section>
      <section className="g liste-stock corvees">
        <span className="lab">Contacts</span>
        <ul>
          {contacts.map((c) => (
            <li key={c.id} className={ouvert === c.id ? "ouvert" : ""}>
              <div className="corvee">
                <button type="button" className="stock-ligne" aria-expanded={ouvert === c.id} onClick={() => setOuvert(ouvert === c.id ? null : c.id)}>
                  <b>{c.nom}<small>{[c.role, c.tel].filter(Boolean).join(" · ")}</small></b>
                </button>
                {c.tel && <a className="rond-champ" href={`tel:${c.tel.replace(/ /g, "")}`} aria-label={`Appeler ${c.nom}`}><Phone size={18} strokeWidth={2} animated={false} /></a>}
              </div>
              {ouvert === c.id && (
                <div className="stock-plus">
                  <Champ nom="Qui c'est" valeur={c.role} maxLength={30} placeholder="Qui c'est : « régie », « plombier »" onChange={(role) => changerContact(c.id, { role })} />
                  <Champ nom="Téléphone" valeur={c.tel} type="tel" inputMode="tel" maxLength={20} placeholder="Téléphone" onChange={(tel) => changerContact(c.id, { tel: tel.replace(/[^\d+ ]/g, "") })} />
                  <button type="button" className="bouton-texte danger" onClick={() => { setOuvert(null); retirerContact(c); }}>Retirer</button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <Ajout id="ajout-contact" nom="Ajouter un contact" exemple="Ajouter : « plombier Martin 079 123 45 67 »" onAjout={(t) => { const lu = lireContact(t); if (lu) ajouterContact(lu); }} />
      </section>
    </>
  );
}

export function Entretien({ noms, proprio, now, corvees, choix }: ContexteModule & { corvees: Corvee[]; choix: ReactNode }) {
  const gestes = corvees.filter((c) => c.entretien);
  const reparations = useLiveQuery(() => db.maison_reparations.toArray(), [], undefined);
  const appareils = useLiveQuery(() => db.maison_appareils.orderBy("id").toArray(), [], []);
  const contacts = useLiveQuery(() => db.maison_contacts.orderBy("id").toArray(), [], []);
  const [carnet, setCarnet] = useState(false);
  const [ouvert, setOuvert] = useState<string | null>(null);
  if (reparations === undefined) return null;
  if (carnet) return <Carnet appareils={appareils} contacts={contacts} gestes={corvees} reparations={reparations} now={now} onQuitter={() => setCarnet(false)} />;

  const cassees = reparations.filter((r) => r.etat < 3).sort((a, b) => a.cree - b.cree);
  const tries = [...gestes].sort((a, b) => jourDu(a).localeCompare(jourDu(b)) || a.nom.localeCompare(b.nom));
  const du = tries.find((c) => aFaire(c, now));
  const nomAppareil = (id?: string) => appareils.find((a) => a.id === id)?.nom ?? "";
  const carnetTexte = [appareils.length ? `${appareils.length} appareil${appareils.length > 1 ? "s" : ""}` : "", ...contacts.slice(0, 2).map((c) => c.role || c.nom)].filter(Boolean).join(", ");

  return (
    <>
      {choix}
      <p className="phrase">
        <b>{cassees.length > 1 ? `${cassees.length} réparations à suivre.` : cassees.length ? "1 réparation à suivre." : "Rien de cassé."}</b>
        {du && ` ${du.nom} : c'est le moment.`}
      </p>
      <section className="g liste-stock corvees">
        <span className="lab">À réparer</span>
        <ul>
          {cassees.map((r) => (
            <li key={r.id} className={ouvert === r.id ? "ouvert" : ""}>
              <button type="button" className="stock-ligne" aria-expanded={ouvert === r.id} onClick={() => setOuvert(ouvert === r.id ? null : r.id)}>
                <b>{r.nom}<small>{[nomAppareil(r.appareil), r.note || `noté ${libelleJour(iso(new Date(r.cree)), now).toLowerCase()}`].filter(Boolean).join(" · ")}</small></b>
                <span className={`compte${r.etat === 2 ? " en-cours" : ""}`}>{ETATS_REPARATION[r.etat - 1].nom}</span>
              </button>
              {ouvert === r.id && <DetailReparation r={r} appareils={appareils} onFermer={() => setOuvert(null)} />}
            </li>
          ))}
        </ul>
        <Ajout id="ajout-reparation" nom="Noter une chose à réparer" exemple="Noter : « le robinet goutte »" onAjout={(t) => ajouterReparation(t)} />
      </section>
      <section className="g liste-stock corvees">
        <span className="lab">À entretenir</span>
        <ul>
          {tries.map((c) => <LigneCorvee key={c.id} c={c} sous={[nomAppareil(c.appareil), libelleJour(jourDu(c), now).toLowerCase()].filter(Boolean).join(" · ")} ouvert={ouvert === c.id} onOuvrir={setOuvert} noms={noms} proprio={proprio} now={now} />)}
        </ul>
        <Ajout id="ajout-geste" nom="Ajouter un entretien" exemple="Ajouter : « détartrer la bouilloire tous les 2 mois »" onAjout={(t) => { const lu = lireCorvee(t, 90); if (lu) ajouterCorvees([{ ...lu, entretien: true }]); }} />
      </section>
      <section className="g liste-stock corvees">
        <button type="button" className="stock-ligne corvees-autres" onClick={() => setCarnet(true)}>
          <span className="tuile-icone" aria-hidden="true"><WashingMachine size={18} strokeWidth={1.8} animated={false} /></span>
          <b>Appareils et contacts<small>{carnetTexte || "Garanties, régie, plombier"}</small></b>
          <ChevronRight size={18} strokeWidth={2} animated={false} />
        </button>
      </section>
    </>
  );
}
