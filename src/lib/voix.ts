// La dictée : le navigateur écoute et écrit la phrase dans la barre (rien n'est envoyé par Echo).
// Sur un téléphone qui ne sait pas faire, on le dit et le micro du clavier reste possible.

interface Reconnaissance {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
type Fabrique = new () => Reconnaissance;

const fabrique = (): Fabrique | undefined => {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: Fabrique; webkitSpeechRecognition?: Fabrique };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

export const voixPossible = () => !!fabrique();

const ERREURS: Record<string, string> = {
  "not-allowed": "Echo n'a pas le droit d'utiliser le micro. Autorise-le dans les réglages du téléphone, ou touche le micro du clavier.",
  "service-not-allowed": "La dictée n'est pas permise ici. Touche le micro du clavier pour parler.",
  "no-speech": "Je n'ai rien entendu. Maintiens l'étoile et parle juste après la petite vibration.",
  "audio-capture": "Pas de micro trouvé. Touche le micro du clavier pour parler.",
  network: "La dictée a besoin d'internet. Écris ta phrase, ou réessaie plus tard.",
};

// Lance l'écoute. Renvoie de quoi l'arrêter. onFin est toujours appelé une fois, à la fin.
export function ecouterVoix({ onTexte, onFin, onErreur }: { onTexte: (t: string) => void; onFin: () => void; onErreur: (message: string) => void }): () => void {
  const F = fabrique();
  if (!F) { onErreur("La dictée n'est pas possible sur ce téléphone. Touche le micro du clavier pour parler."); onFin(); return () => {}; }
  const r = new F();
  r.lang = "fr-FR"; r.interimResults = true; r.continuous = false;
  let fini = false;
  const finir = () => { if (!fini) { fini = true; onFin(); } };
  r.onresult = (e) => onTexte(Array.from(e.results, (x) => x[0]?.transcript ?? "").join(" ").trim());
  r.onerror = (e) => { if (e.error !== "aborted") onErreur(ERREURS[e.error] ?? "La dictée s'est arrêtée. Réessaie, ou écris ta phrase."); };
  r.onend = finir;
  try { r.start(); } catch { onErreur("La dictée n'a pas pu démarrer. Réessaie, ou écris ta phrase."); finir(); }
  return () => { try { r.stop(); } catch { /* déjà arrêtée */ } };
}
