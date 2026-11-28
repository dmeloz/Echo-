// « La suite » : le plan de l'app, que Melo range lui-même. Il vit dans la base de la page (atelier/suite), où Claude le lit et le tient à jour.
import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "pulsoicon-react";

export type Etape = { id: string; titre: string; etat: "fait" | "en-cours" | "a-venir" | "idee" };
const ETATS: { id: Etape["etat"]; nom: string }[] = [{ id: "en-cours", nom: "En cours" }, { id: "a-venir", nom: "À venir" }, { id: "idee", nom: "Idée" }, { id: "fait", nom: "Fait" }];
const CLE = "echo-atelier-suite";
type Fiche = { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>; set(d: Record<string, unknown>): Promise<void> };
const fiche = async () => ((await window.claude?.use("db")) as { doc(c: string): Fiche } | null | undefined)?.doc("atelier/suite") ?? null;

export function Suite() {
  const [liste, setListe] = useState<Etape[] | null>(null);
  const [nouveau, setNouveau] = useState("");
  const pret = useRef(false);

  useEffect(() => {
    let local: Etape[] = [];
    try { local = JSON.parse(localStorage.getItem(CLE) || "[]"); } catch { /* stockage fermé */ }
    const fin = setTimeout(() => { pret.current = true; setListe((l) => l ?? local); }, 10000);
    fiche().then((f) => f?.get()).then((s) => {
      const items = s?.exists ? s.data()?.items : null;
      pret.current = true; clearTimeout(fin);
      setListe(Array.isArray(items) ? (items as Etape[]) : local);
    }).catch(() => { pret.current = true; clearTimeout(fin); setListe(local); });
    return () => clearTimeout(fin);
  }, []);

  const changer = (suivante: Etape[]) => {
    setListe(suivante);
    try { localStorage.setItem(CLE, JSON.stringify(suivante)); } catch { /* stockage fermé */ }
    if (pret.current) fiche().then((f) => f?.set({ items: suivante, quand: new Date().toISOString() })).catch(() => {});
  };

  if (!liste) return <p className="vide">Le plan charge…</p>;
  const bouger = (i: number, pas: number) => { const l = [...liste]; const j = i + pas; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; changer(l); };
  return (
    <>
      <p className="aide">Le plan de l'app, dans l'ordre où tu veux avancer. Monte ce qui presse, ajoute tes idées : Claude suit cette liste.</p>
      <form className="ajout-suite" onSubmit={(e) => { e.preventDefault(); const t = nouveau.trim(); if (!t) return; changer([{ id: Date.now().toString(36), titre: t, etat: "idee" }, ...liste]); setNouveau(""); }}>
        <input id="suite-nouveau" className="champ" placeholder="Une idée, une suite…" value={nouveau} onChange={(e) => setNouveau(e.target.value)} />
        <button className="rond" aria-label="Ajouter au plan" disabled={!nouveau.trim()}><Plus size={20} /></button>
      </form>
      {liste.length === 0 && <p className="vide">Le plan est vide pour l'instant. Ajoute ta première idée, ou demande à Claude de le remplir.</p>}
      <ul className="changements">
        {liste.map((e, i) => (
          <li key={e.id} className={"etape " + e.etat}>
            <span>
              <b>{e.titre}</b>
              <select className="champ etat" aria-label={`État de ${e.titre}`} value={e.etat} onChange={(x) => changer(liste.map((y) => (y.id === e.id ? { ...y, etat: x.target.value as Etape["etat"] } : y)))}>
                {ETATS.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}
              </select>
            </span>
            <span className="fleches">
              <button className="rond petit" aria-label="Monter" disabled={i === 0} onClick={() => bouger(i, -1)}><ArrowUp size={15} /></button>
              <button className="rond petit" aria-label="Descendre" disabled={i === liste.length - 1} onClick={() => bouger(i, 1)}><ArrowDown size={15} /></button>
              <button className="rond petit" aria-label={`Retirer ${e.titre}`} onClick={() => changer(liste.filter((y) => y.id !== e.id))}><X size={15} /></button>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
