// Claude dans l'atelier : Melo écrit ce qu'il veut, Claude règle l'app lui-même avec les outils de l'atelier, ou note une demande pour le code.
import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Square } from "pulsoicon-react";

export type Outil = { name: string; description: string; inputSchema?: Record<string, unknown>; execute(input: Record<string, unknown>): unknown };
type Tour = { role: "user" | "assistant"; content: string };
type Demander = (input: Tour[], options: Record<string, unknown>) => Promise<{ text: string }>;

const IDEES = ["Guide-moi : par où je commence ?", "Rends les cartes un peu plus rondes", "Essaie un bleu plus doux partout", "Que penses-tu de cet écran ?"];

export function Assistant({ regles, outils }: { regles: () => string; outils: Outil[] }) {
  const [demander, setDemander] = useState<Demander | null | undefined>(undefined);
  const [tours, setTours] = useState<Tour[]>([]);
  const [texte, setTexte] = useState("");
  const [enCours, setEnCours] = useState<string | null>(null);
  const [erreur, setErreur] = useState("");
  const arret = useRef<AbortController | null>(null);
  const bas = useRef<HTMLDivElement>(null);

  useEffect(() => { (window.claude?.use("sample") ?? Promise.resolve(null)).then((s) => setDemander(() => (s as Demander | null) ?? null)).catch(() => setDemander(null)); }, []);
  useEffect(() => { bas.current?.scrollIntoView({ block: "end" }); }, [tours, enCours]);

  const envoyer = async (message: string) => {
    const m = message.trim(); if (!m || !demander || enCours != null) return;
    const suite: Tour[] = [...tours, { role: "user", content: m }];
    setTours(suite); setTexte(""); setErreur(""); setEnCours("");
    arret.current = new AbortController();
    try {
      const { text } = await demander([{ role: "user", content: regles() }, { role: "assistant", content: "Compris." }, ...suite.slice(-12)], {
        cache: false, signal: arret.current.signal, tools: outils, onText: ({ text }: { text: string }) => setEnCours(text),
      });
      setTours([...suite, { role: "assistant", content: text }]);
    } catch (e) {
      const { code, text } = e as { code?: string; text?: string };
      if (text) setTours([...suite, { role: "assistant", content: text }]);
      if (code === "not_granted") setDemander(null);
      else if (code !== "cancelled") setErreur(code === "rate_limited" ? "Trop de demandes d'un coup. Réessaie dans un instant." : "Claude n'a pas pu répondre. Réessaie.");
    } finally { setEnCours(null); }
  };

  if (demander === undefined) return <p className="vide">Claude arrive…</p>;
  if (demander === null) return <p className="vide">Claude n'est pas disponible dans cette vue. Tu peux tout régler avec les autres onglets, puis écrire tes demandes dans « Demandes ».</p>;
  return (
    <div className="claude-fil">
      {tours.length === 0 && (
        <div className="accueil-claude">
          <p className="aide">Je suis dans l'atelier avec toi. Dis-moi ce que tu veux avec tes mots : je fais les réglages moi-même sur l'app à gauche, et ce qui demande du vrai travail de code, je le note pour l'envoyer.</p>
          <div className="chemin">{IDEES.map((i) => <button key={i} className="puce" onClick={() => envoyer(i)}>{i}</button>)}</div>
        </div>
      )}
      {tours.map((t, i) => <p key={i} className={"bulle " + t.role}>{t.content}</p>)}
      {enCours != null && <p className="bulle assistant">{enCours || "Je réfléchis…"}</p>}
      {erreur && <p className="bandeau">{erreur}</p>}
      <div ref={bas} />
      <form className="ajout-suite saisie-claude" onSubmit={(e) => { e.preventDefault(); envoyer(texte); }}>
        <span className="icone-claude" aria-hidden="true"><Sparkles size={18} /></span>
        <input id="claude-message" className="champ" placeholder="Écris à Claude…" value={texte} onChange={(e) => setTexte(e.target.value)} />
        {enCours != null
          ? <button type="button" className="rond" aria-label="Arrêter" onClick={() => arret.current?.abort()}><Square size={16} /></button>
          : <button className="rond" aria-label="Envoyer à Claude dans l'atelier" disabled={!texte.trim()}><Send size={18} /></button>}
      </form>
    </div>
  );
}
