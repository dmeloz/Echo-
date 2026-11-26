// L'atelier de design : la VRAIE app tourne dans le cadre à gauche (même adresse, mêmes fichiers),
// et le panneau pose par-dessus une feuille de style que l'on règle au doigt. Rien n'est redessiné ici.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Check, EyeOff, ChevronDown, ChevronUp, Eye, Send, Layers, MousePointerClick, Palette, Pointer, ListTodo, MessageSquarePlus, MonitorDown, Sparkles, Mic, RotateCcw, Undo2, X, Zap } from "pulsoicon-react";
import { CLE_BROUILLON, VIDE, cssDe, ecrireCouleur, lireCouleur, nombreDeChangements, type Etat } from "../lib/atelier";
import { Suite } from "./Suite";
import { Assistant, type Outil } from "./Assistant";
import { AMBIANCES, ECRANS, ETATS, GROUPES, NOMS_CLASSES, NOMS_JETONS, NOMS_PROPS, OMBRES, PROPS, RAPIDES, TAILLES, TEINTES, type Prop } from "./listes";

type Maillon = { el: Element; sel: string; nom: string };
type Jeton = { nom: string; origine: string };

const charger = (): Etat => { try { return { ...VIDE, ...JSON.parse(localStorage.getItem(CLE_BROUILLON) || "{}") }; } catch { return VIDE; } };

// L'atelier vit dans une page du projet Claude : « Envoyer à Claude » range le design dans la base de la page, où Claude le relit.
type Fiche = { get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>; set(d: Record<string, unknown>): Promise<void> };
type Base = { doc(chemin: string): Fiche };
declare global { interface Window { claude?: { use(nom: string): Promise<unknown> } } }
const base = async () => ((await window.claude?.use("db")) as Base | null | undefined) ?? null;
const APP = import.meta.env.VITE_APP ?? "./";
const SESSION = import.meta.env.VITE_SESSION ?? ""; // la session Claude qui travaille sur l'app, prévenue à chaque envoi
const classes = (el: Element) => [...el.classList].filter((c) => !c.startsWith("atelier-") && !["arrivee", "respire", "tremble"].includes(c));

/** Du plus précis au plus large : l'élément touché, puis ce qui l'entoure. */
function chemin(depart: Element): Maillon[] {
  const liste: Maillon[] = [];
  let el: Element | null = depart.closest("svg") ?? depart;
  while (el && el !== el.ownerDocument.body && liste.length < 7) {
    const c = classes(el);
    if (c.length) for (const k of c) { if (!liste.some((m) => m.sel === "." + CSS.escape(k))) liste.push({ el, sel: "." + CSS.escape(k), nom: NOMS_CLASSES[k] ?? k }); }
    else if (!liste.length || el === depart) {
      const parent = el.parentElement, pc = parent ? classes(parent) : [];
      const tag = el.tagName.toLowerCase();
      if (pc.length) liste.push({ el, sel: `.${CSS.escape(pc[0])} ${tag}`, nom: `${tag === "svg" ? "Icône" : tag === "b" || tag === "small" || tag === "span" || tag === "p" ? "Texte" : tag} dans ${NOMS_CLASSES[pc[0]] ?? pc[0]}` });
    }
    el = el.parentElement;
  }
  return liste;
}

function lireJetons(doc: Document): Jeton[] {
  const vus = new Map<string, string>();
  for (const f of doc.styleSheets) {
    if ((f.ownerNode as Element | null)?.id?.startsWith("atelier-")) continue;
    let regles: CSSRuleList; try { regles = f.cssRules; } catch { continue; }
    for (const r of regles) {
      const st = (r as CSSStyleRule).style;
      if ((r as CSSStyleRule).selectorText === ":root" && st) for (const n of st) if (n.startsWith("--")) vus.set(n, st.getPropertyValue(n).trim());
    }
  }
  return [...vus].map(([nom, origine]) => ({ nom, origine }));
}

export function Atelier() {
  const [etat, setEtat] = useState<Etat>(charger);
  const [brouillonDemande, setBrouillonDemande] = useState("");
  const [envoi, setEnvoi] = useState<"" | "en-cours" | "fait" | "copie">("");
  const [choisir, setChoisir] = useState(true);
  const [onglet, setOnglet] = useState<"claude" | "rapide" | "element" | "theme" | "demandes" | "suite" | "liste">("claude");
  const [maillons, setMaillons] = useState<Maillon[]>([]);
  const [sel, setSel] = useState<string>("");
  const [jetons, setJetons] = useState<Jeton[]>([]);
  const [taille, setTaille] = useState(0);
  const [ouvert, setOuvert] = useState(true);
  const [avant, setAvant] = useState(false);
    const [echelle, setEchelle] = useState(1);
  const cadre = useRef<HTMLIFrameElement>(null);
  const vif = useRef({ etat, choisir, avant });
  vif.current = { etat, choisir, avant };
  const passe = useRef<{ liste: Etat[]; quand: number }>({ liste: [], quand: 0 });
  const [, redessiner] = useState(0);
  const passeDroit = useRef(false); // un toucher fait par l'atelier lui-même (ouvrir le menu, une tâche…)

  const doc = () => cadre.current?.contentDocument ?? null;
  const maillon = maillons.find((m) => m.sel === sel);
  // L'app redessine parfois l'élément : on le retrouve par son sélecteur.
  const elCible = maillon ? (maillon.el.isConnected ? maillon.el : doc()?.querySelector(sel) ?? null) : null;
  const cible = maillon && elCible ? { ...maillon, el: elCible } : undefined;

  const changer = useCallback((f: (e: Etat) => Etat) => {
    const p = passe.current;
    if (Date.now() - p.quand > 600) { p.liste.push(vif.current.etat); if (p.liste.length > 60) p.liste.shift(); }
    p.quand = Date.now();
    setEtat(f);
  }, []);
  const annuler = () => { const e = passe.current.liste.pop(); if (e) { passe.current.quand = 0; setEtat(e); } };

  const poser = (s: string, prop: string, v: string | null) => changer((e) => {
    const r = { ...e.regles[s] };
    const noms = prop === "backdrop-filter" ? [prop, "-webkit-backdrop-filter"] : [prop];
    for (const n of noms) { if (v == null) delete r[n]; else r[n] = v; }
    const regles = { ...e.regles, [s]: r };
    if (!Object.keys(r).length) delete regles[s];
    return { ...e, regles };
  });
  const poserJeton = (n: string, v: string | null) => changer((e) => {
    const j = { ...e.jetons }; if (v == null) delete j[n]; else j[n] = v;
    return { ...e, jetons: j };
  });

  // Les changements vont dans le cadre, dans le brouillon, et (si demandé) dans la vraie app de cet appareil.
  useEffect(() => {
    const css = cssDe(etat, true);
    try { localStorage.setItem(CLE_BROUILLON, JSON.stringify(etat)); } catch { /* stockage fermé : le brouillon vit le temps de la page */ }
    setEnvoi("");
    const st = doc()?.getElementById("atelier-direct");
    if (st) st.textContent = avant ? "" : css;
    redessiner((n) => n + 1);
  }, [etat, avant]);

  // Sur un autre appareil (brouillon vide), on repart du dernier design envoyé.
  useEffect(() => {
    if (nombreDeChangements(charger())) return;
    base().then((b) => b?.doc("atelier/design").get()).then((f) => {
      const e = f?.exists ? f.data()?.etat : null;
      if (typeof e === "string") setEtat({ ...VIDE, ...JSON.parse(e) });
    }).catch(() => {});
  }, []);

  useEffect(() => { doc()?.documentElement?.classList.toggle("atelier-choisir", choisir); if (!choisir) placer("atelier-survol", null); }, [choisir]);

  const placer = (id: string, el: Element | null | undefined) => {
    const boite = doc()?.getElementById(id); if (!boite) return;
    if (!el || !el.isConnected) { boite.style.display = "none"; return; }
    const r = el.getBoundingClientRect();
    Object.assign(boite.style, { display: "block", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
  };

  // Le cadre suit l'élément choisi (défilement, animation, changement de taille).
  useEffect(() => {
    const t = setInterval(() => {
      placer("atelier-choix", cible?.el);
      // L'app réécrit ses textes quand elle se redessine : on repose les mots changés.
      const d = doc(); if (!d || vif.current.avant) return;
      for (const x of vif.current.etat.textes) for (const el of d.querySelectorAll(x.sel)) if (!el.childElementCount && el.textContent === x.avant) el.textContent = x.apres;
    }, 150);
    return () => clearInterval(t);
  });

  const brancher = () => {
    const d = doc(); if (!d || d.getElementById("atelier-direct")) return;
    const direct = d.createElement("style"); direct.id = "atelier-direct"; direct.textContent = vif.current.avant ? "" : cssDe(vif.current.etat, true);
    const outil = d.createElement("style"); outil.id = "atelier-outil";
    outil.textContent = `.atelier-boite{position:fixed;z-index:2147483647;pointer-events:none;display:none;border-radius:6px}
#atelier-choix{border:2px solid #2f6bff;box-shadow:0 0 0 4px rgb(47 107 255 / .18)}
#atelier-survol{border:1.5px dashed rgb(47 107 255 / .7)}
html.atelier-choisir, html.atelier-choisir *{cursor:crosshair !important}`;
    d.head.append(direct, outil);
    for (const id of ["atelier-survol", "atelier-choix"]) { const b = d.createElement("div"); b.id = id; b.className = "atelier-boite"; d.body.append(b); }
    d.documentElement.classList.toggle("atelier-choisir", vif.current.choisir);

    // En mode « choisir », l'app ne reçoit plus les touchers : on les arrête avant elle. Le défilement reste libre.
    const arreter = (e: Event) => { if (vif.current.choisir) e.stopPropagation(); };
    for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "touchstart", "touchend", "keydown"]) d.addEventListener(type, arreter, true);
    d.addEventListener("click", (e) => {
      if (!vif.current.choisir || passeDroit.current) return;
      e.preventDefault(); e.stopPropagation();
      const liste = chemin(e.target as Element);
      if (!liste.length) return;
      setMaillons(liste); setSel(liste[0].sel); setOnglet("element"); setOuvert(true);
    }, true);
    d.addEventListener("mousemove", (e) => { if (vif.current.choisir) placer("atelier-survol", (e.target as Element).closest("svg") ?? (e.target as Element)); }, true);
    d.addEventListener("mouseleave", () => placer("atelier-survol", null));
    setJetons(lireJetons(d));
  };
  // Le fichier de styles de l'app peut arriver un instant après la page.
  const auChargement = () => { brancher(); setTimeout(() => { const d = doc(); if (d) setJetons(lireJetons(d)); }, 800); };

  useEffect(() => {
    const mesurer = () => setEchelle(Math.min(1, (innerHeight - 150) / TAILLES[taille].h, (innerWidth - 470) / TAILLES[taille].l));
    mesurer(); addEventListener("resize", mesurer);
    return () => removeEventListener("resize", mesurer);
  }, [taille]);

  const aller = (id: string) => { const w = cadre.current?.contentWindow; if (w) w.location.hash = id; };
  // Ouvre un écran caché en touchant le bon bouton de l'app à la place de Melo.
  const ouvrirEtat = (selecteur: string) => {
    aller("aujourdhui");
    setTimeout(() => {
      const b = doc()?.querySelector<HTMLElement>(selecteur); if (!b) return;
      passeDroit.current = true; b.click(); passeDroit.current = false;
    }, 250);
  };
  const recharger = () => cadre.current?.contentWindow?.location.reload();
  const poserJetons = (lot: Record<string, string | null>) => changer((e) => {
    const j = { ...e.jetons };
    for (const [n, v] of Object.entries(lot)) { if (v == null) delete j[n]; else j[n] = v; }
    return { ...e, jetons: j };
  });
  const ecran = () => cadre.current?.contentWindow?.location.hash.slice(1) || "aujourdhui";
  const nomEcran = (id: string) => ECRANS.find((e) => e.id === id)?.nom ?? id;
  // Les mots d'un élément simple (un titre, un bouton sans icône) : on retient l'ancien texte pour que Claude le retrouve dans le code.
  const texteCible = cible && !cible.el.childElementCount ? cible.el.textContent ?? "" : null;
  const changerTexte = (apres: string) => {
    if (!cible || texteCible == null) return;
    const deja = etat.textes.find((x) => x.sel === sel && x.apres === texteCible);
    const avant = deja?.avant ?? texteCible;
    cible.el.textContent = apres;
    changer((e) => {
      const autres = e.textes.filter((x) => x !== deja && !(x.sel === sel && x.avant === avant));
      return { ...e, textes: apres === avant ? autres : [...autres, { sel, ecran: ecran(), avant, apres }] };
    });
  };
  // La dictée : prête d'avance, car elle doit démarrer dans le toucher même, sans attendre.
  type Dictee = { start(o?: { language?: string }): Promise<void>; stop(): Promise<void>; onFinal(f: (x: { text: string }) => void): unknown; onState(f: (x: { state: string }) => void): unknown };
  const dictee = useRef<Dictee | null>(null);
  const [micro, setMicro] = useState<"absent" | "pret" | "ecoute">("absent");
  useEffect(() => {
    window.claude?.use("dictation").then((d) => {
      if (!d) return;
      const x = d as Dictee; dictee.current = x; setMicro("pret");
      x.onFinal(({ text }) => setBrouillonDemande((b) => (b ? b + " " : "") + text));
      x.onState(({ state }) => setMicro(state === "idle" ? "pret" : "ecoute"));
    }).catch(() => {});
  }, []);
  const dicter = () => { const d = dictee.current; if (!d) return; (micro === "ecoute" ? d.stop() : d.start({ language: "fr" })).catch(() => setMicro("pret")); };
  const ajouterDemande = () => {
    const t = brouillonDemande.trim(); if (!t) return;
    changer((e) => ({ ...e, demandes: [...e.demandes, { id: Date.now().toString(36), ecran: ecran(), element: cible?.nom ?? "", sel: cible ? sel : "", texte: t }] }));
    setBrouillonDemande("");
  };
  // Ce que Claude, dans l'atelier, sait et peut faire : l'état de l'app, et des outils qui règlent l'atelier comme le ferait Melo.
  const reglesClaude = () => [
    "Tu es Claude, dans l'atelier de travail de l'app Echo (app du foyer de Dany et Sarah : tâches, agenda, cuisine, maison, budget). Dany n'est pas développeur.",
    "Parle en français simple, phrases courtes, tutoie. Ne montre jamais de CSS ni de code. Guide-le : dis ce que tu as fait et propose l'étape suivante.",
    "Tu changes l'apparence toi-même avec les outils regler_theme et regler_element : l'aperçu se met à jour tout de suite. Fais des changements mesurés, l'app est en verre clair (style Givre lagon) et il l'aime déjà.",
    "Tout ce qui n'est pas de l'apparence (nouvelle fonction, bouton, bug, contenu, logique) : appelle noter_demande, puis dis-lui de toucher « Envoyer à Claude » pour que ce soit construit dans l'app.",
    "Écran affiché : " + nomEcran(ecran()) + ". Élément choisi : " + (cible ? `${cible.nom} (${sel})` : "aucun") + ".",
    "Réglages de base (nom : valeur) : " + jetons.map((j) => `${j.nom}: ${etat.jetons[j.nom] ?? j.origine}`).join("; "),
    "Éléments connus (sélecteur = nom) : " + Object.entries(NOMS_CLASSES).map(([k, v]) => `.${k} = ${v}`).join("; "),
    "Propriétés réglables d'un élément : " + PROPS.map((p) => p.css).join(", ") + ", display.",
    "Changements déjà faits : " + (cssDe(etat) || "aucun") + ". Demandes notées : " + (etat.demandes.map((d) => d.texte).join(" | ") || "aucune") + ".",
  ].join("\n");
  const outilsClaude: Outil[] = [
    { name: "regler_theme", description: "Change un réglage de base de l'app (couleur, taille de texte, espace). valeur vide = remettre comme avant.",
      inputSchema: { type: "object", properties: { nom: { type: "string", description: "ex. --bleu" }, valeur: { type: "string", description: "valeur CSS, ex. #3b6fe0 ou 17px" } }, required: ["nom", "valeur"] },
      execute: ({ nom, valeur }) => { const n = String(nom); if (!jetons.some((j) => j.nom === n)) throw new Error("réglage inconnu"); poserJeton(n, String(valeur ?? "") || null); return "fait"; } },
    { name: "regler_element", description: "Change une propriété d'un élément de l'app, par son sélecteur. valeur vide = remettre comme avant.",
      inputSchema: { type: "object", properties: { selecteur: { type: "string", description: "ex. .g" }, propriete: { type: "string", description: "ex. border-radius" }, valeur: { type: "string", description: "ex. 20px" } }, required: ["selecteur", "propriete", "valeur"] },
      execute: ({ selecteur, propriete, valeur }) => {
        const s2 = String(selecteur), p = String(propriete);
        if (/[{};<>]/.test(s2 + p + String(valeur ?? "")) || !doc()?.querySelector(s2)) throw new Error("élément introuvable sur cet écran");
        poser(s2, p, String(valeur ?? "") || null); return "fait";
      } },
    { name: "noter_demande", description: "Note une demande de travail sur l'app (fonction, bouton, bug, contenu) pour Claude qui écrit le code.",
      inputSchema: { type: "object", properties: { texte: { type: "string" } }, required: ["texte"] },
      execute: ({ texte: t }) => { const x = String(t ?? "").trim(); if (!x) throw new Error("demande vide"); changer((e) => ({ ...e, demandes: [...e.demandes, { id: Date.now().toString(36), ecran: ecran(), element: cible?.nom ?? "", sel: cible ? sel : "", texte: x }] })); return "notée"; } },
  ];
  // L'atelier peut s'installer comme une app sur l'ordinateur (depuis l'app Claude de bureau).
  type Bureau = { install?: { state(): Promise<string>; request(): Promise<unknown> } };
  const bureau = useRef<Bureau | null>(null);
  const [installable, setInstallable] = useState(false);
  useEffect(() => {
    (window.claude?.use("desktop") ?? Promise.resolve(null)).then(async (d) => {
      bureau.current = d as Bureau | null;
      setInstallable((await bureau.current?.install?.state()) === "available");
    }).catch(() => {});
  }, []);
  const installer = () => { bureau.current?.install?.request().catch(() => {}); };
  const nb = nombreDeChangements(etat);
  const texte = cssDe(etat);
  const copier = async () => {
    const tout = "Changements de l'atelier Echo à mettre dans l'app :\n\n" + texte;
    try { await navigator.clipboard.writeText(tout); } catch {
      const z = document.createElement("textarea"); z.value = tout; document.body.append(z); z.select(); document.execCommand("copy"); z.remove();
    }
  };
  const envoyer = async () => {
    setEnvoi("en-cours");
    try {
      const b = await base();
      if (!b) throw new Error("pas de base");
      await b.doc("atelier/design").set({ css: texte, textes: etat.textes, demandes: etat.demandes, etat: JSON.stringify(etat), nombre: nb, quand: new Date().toISOString() });
      setEnvoi("fait");
      // On prévient aussi Claude, qui travaille sur l'app, qu'un envoi l'attend (si la vue le permet).
      type Lien = { callTool(serveur: string, outil: string, entree: Record<string, unknown>): Promise<unknown> };
      (window.claude?.use("mcp") ?? Promise.resolve(null)).then((m) => (m as Lien | null)?.callTool("Claude Code Remote", "send_message", {
        session_id: SESSION, message: `Atelier Echo : nouvel envoi de Melo (${nb} changement${nb > 1 ? "s" : ""}, dont ${etat.demandes.length} demande${etat.demandes.length > 1 ? "s" : ""}). À lire dans la base de la page, document atelier/design.`,
      })).catch(() => {});
    } catch { await copier(); setEnvoi("copie"); } // secours : le texte est copié, à coller dans la conversation
  };

  const t = TAILLES[taille];
  const style = cible ? cadre.current!.contentWindow!.getComputedStyle(cible.el) : null;

  return (
    <div className={"atelier" + (ouvert ? " ouvert" : "")}>
      <main className="cote-app">
        <div className="ecrans">
          <button className="puce mobile" aria-pressed={ouvert} onClick={() => setOuvert(!ouvert)}><Layers size={15} /> Régler</button>
          <button className="puce mobile" aria-pressed={choisir} onClick={() => setChoisir(!choisir)}><MousePointerClick size={15} /> Choisir</button>
          {ECRANS.map((e) => <button key={e.id} className="puce" onClick={() => aller(e.id)}>{e.nom}</button>)}
          {ETATS.map((e) => <button key={e.nom} className="puce etat" onClick={() => ouvrirEtat(e.sel)}>{e.nom}</button>)}
          <button className="puce etat" onClick={recharger}>Tout refermer</button>
          <select className="puce" aria-label="Taille de l'écran" value={taille} onChange={(e) => setTaille(Number(e.target.value))}>
            {TAILLES.map((x, i) => <option key={x.nom} value={i}>{x.nom}</option>)}
          </select>
        </div>
        <div className="telephone" style={{ width: t.l * echelle, height: t.h * echelle }}>
          <iframe ref={cadre} title="L'app Echo" src={APP} onLoad={auChargement} style={{ width: t.l, height: t.h, transform: `scale(${echelle})` }} />
        </div>
      </main>

      <aside className="panneau">
        <button className="poignee" onClick={() => setOuvert(!ouvert)} aria-label={ouvert ? "Baisser le panneau" : "Monter le panneau"}>
          {ouvert ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
        </button>
        <div className="modes">
          <div className="bascule" role="group" aria-label="Que fait un toucher sur l'app ?">
            <button aria-pressed={choisir} onClick={() => setChoisir(true)}><MousePointerClick size={17} /> Choisir</button>
            <button aria-pressed={!choisir} onClick={() => setChoisir(false)}><Pointer size={17} /> Utiliser l'app</button>
          </div>
          <button className="rond" disabled={!passe.current.liste.length} onClick={annuler} aria-label="Annuler le dernier changement"><Undo2 size={18} /></button>
          <button className="rond" aria-pressed={avant} disabled={!nb} onClick={() => setAvant(!avant)} aria-label="Voir comme avant"><Eye size={18} /></button>
        </div>
        {avant && <p className="bandeau">Tu vois l'app comme avant. Retouche l'œil pour revoir tes changements.</p>}

        <nav className="onglets">
          <button aria-pressed={onglet === "claude"} onClick={() => setOnglet("claude")}><Sparkles size={16} /> Claude</button>
          <button aria-pressed={onglet === "rapide"} onClick={() => setOnglet("rapide")}><Zap size={16} /> Rapide</button>
          <button aria-pressed={onglet === "element"} onClick={() => setOnglet("element")}><Layers size={16} /> Élément</button>
          <button aria-pressed={onglet === "theme"} onClick={() => setOnglet("theme")}><Palette size={16} /> Couleurs</button>
          <button aria-pressed={onglet === "demandes"} onClick={() => setOnglet("demandes")}><MessageSquarePlus size={16} /> Demandes{etat.demandes.length ? ` (${etat.demandes.length})` : ""}</button>
          <button aria-pressed={onglet === "suite"} onClick={() => setOnglet("suite")}><ListTodo size={16} /> La suite</button>
          <button aria-pressed={onglet === "liste"} onClick={() => setOnglet("liste")}>Changements{nb ? ` (${nb})` : ""}</button>
        </nav>

        <div className="contenu">
          {onglet === "claude" && <>
            <Assistant regles={reglesClaude} outils={outilsClaude} />
            {installable && <div className="actions"><button className="bouton second" onClick={installer}><MonitorDown size={17} /> Installer l'atelier sur cet ordinateur</button></div>}
          </>}

          {onglet === "rapide" && <>
            <section className="groupe">
              <h3>Couleur principale</h3>
              <div className="pastilles">
                {TEINTES.map((t) => {
                  const active = (etat.jetons["--bleu"] ?? "") === t.hex;
                  return <button key={t.nom} className="pastille" aria-pressed={active} aria-label={t.nom} title={t.nom} style={{ background: t.hex || "#2f6bff" }}
                    onClick={() => poserJetons({ "--bleu": t.hex || null, "--bleu-pale": t.hex ? `color-mix(in srgb, ${t.hex} 13%, #fff)` : null })}>{active && <Check size={18} />}</button>;
                })}
              </div>
            </section>
            <section className="groupe">
              <h3>Ambiance du fond</h3>
              <div className="chemin">
                {AMBIANCES.map((a) => {
                  const active = ["--fond", "--reflet-bleu", "--reflet-turquoise", "--reflet-lavande"].every((n) => (etat.jetons[n] ?? "") === (a.jetons[n] ?? ""));
                  return <button key={a.nom} className="puce" aria-pressed={active} onClick={() => poserJetons({ "--fond": null, "--reflet-bleu": null, "--reflet-turquoise": null, "--reflet-lavande": null, ...a.jetons })}>{a.nom}</button>;
                })}
              </div>
            </section>
            <section className="groupe">
              <h3>Formes et tailles</h3>
              {RAPIDES.map((p) => {
                const pose = etat.regles[p.sel]?.[p.css];
                return <Ligne key={p.nom} nom={p.nom} change={pose != null} onRemettre={() => poser(p.sel, p.css, null)}>
                  <Curseur valeur={pose != null ? parseFloat(pose) : p.defaut} min={p.min!} max={p.max!} pas={p.pas!} unite={p.unite ?? ""} onChange={(n) => poser(p.sel, p.css, n + (p.unite ?? ""))} />
                </Ligne>;
              })}
            </section>
            <section className="groupe">
              <h3>Le verre des cartes</h3>
              <Ligne nom="Transparence" change={"--verre" in etat.jetons} onRemettre={() => poserJeton("--verre", null)}>
                <Curseur valeur={Math.round((lireCouleur(etat.jetons["--verre"] ?? "rgb(255 255 255 / .6)")?.a ?? 0.6) * 100)} min={20} max={100} pas={1} unite="%" onChange={(n) => poserJeton("--verre", `rgb(255 255 255 / ${n / 100})`)} />
              </Ligne>
              {PROPS.filter((p) => p.type === "flou" || p.type === "ombre").map((p) => <Reglage key={p.css} p={p} style={null} pose={etat.regles[".g"]?.[p.css]} onChange={(v) => poser(".g", p.css, v)} />)}
            </section>
            <p className="aide">Pour régler un seul élément (un titre, un bouton, une icône), touche-le dans l'app.</p>
          </>}

          {onglet === "element" && (!cible || !style
            ? <p className="vide">Touche un élément de l'app (une carte, un titre, un bouton, une icône) pour le régler. Pour ouvrir le menu ou une tâche, passe sur « Utiliser l'app », puis reviens sur « Choisir ».</p>
            : <>
              <div className="chemin">
                {maillons.map((m, i) => <button key={m.sel + i} className="puce" aria-pressed={m.sel === sel} onClick={() => setSel(m.sel)}>{m.nom}</button>)}
              </div>
              <p className="aide">{(() => { const n = doc()?.querySelectorAll(sel).length ?? 0; return n > 1 ? `Il y en a ${n} sur cet écran : ils changent tous ensemble.` : "Tu règles cet élément, partout où il apparaît dans l'app."; })()}</p>
              {texteCible != null && texteCible.trim() !== "" && (
                <section className="groupe">
                  <h3>Les mots</h3>
                  <input className="champ" aria-label="Texte de l'élément" value={texteCible} onChange={(e) => changerTexte(e.target.value)} />
                </section>
              )}
              <div className="actions">
                <button className="bouton second" onClick={() => setOnglet("demandes")}><MessageSquarePlus size={17} /> Demander autre chose ici</button>
                <button className="bouton second" onClick={() => { poser(sel, "display", "none"); setOnglet("liste"); }}><EyeOff size={17} /> Cacher</button>
              </div>
              {GROUPES.map((g) => (
                <section key={g} className="groupe">
                  <h3>{g}</h3>
                  {PROPS.filter((p) => p.groupe === g).map((p) => <Reglage key={p.css} p={p} style={style} pose={etat.regles[sel]?.[p.css]} onChange={(v) => poser(sel, p.css, v)} />)}
                </section>
              ))}
            </>)}

          {onglet === "theme" && (jetons.length === 0 ? <p className="vide">L'app charge…</p> : <>
            <p className="aide">Toutes les couleurs et mesures de base de l'app. Changer le bleu ici le change partout.</p>
            {NOMS_JETONS.map((g) => (
              <section key={g.groupe} className="groupe">
                <h3>{g.groupe}</h3>
                {jetons.filter((j) => g.test(j.nom)).map((j) => {
                  const v = etat.jetons[j.nom] ?? j.origine, c = lireCouleur(v);
                  const nom = g.noms[j.nom] ?? j.nom.slice(2);
                  const change = j.nom in etat.jetons;
                  const m = /^(-?[\d.]+)(px|ms)$/.exec(v);
                  return (
                    <Ligne key={j.nom} nom={nom} change={change} onRemettre={() => poserJeton(j.nom, null)}>
                      {c ? <ChampCouleur valeur={v} onChange={(x) => poserJeton(j.nom, x)} />
                        : m ? <Curseur valeur={Number(m[1])} min={0} max={m[2] === "ms" ? 1000 : j.nom.startsWith("--t-") ? 44 : 48} pas={m[2] === "ms" ? 10 : 0.5} unite={m[2]} onChange={(n) => poserJeton(j.nom, n + m[2])} />
                        : <input className="champ" value={v} onChange={(e) => poserJeton(j.nom, e.target.value)} />}
                    </Ligne>
                  );
                })}
              </section>
            ))}
          </>)}

          {onglet === "demandes" && <>
            <section className="groupe">
              <h3>Une demande pour Claude</h3>
              <p className="aide">{cible ? `Sur « ${cible.nom} », écran ${nomEcran(ecran())}. ` : "Pour toute l'app. Touche d'abord un élément pour parler d'un endroit précis. "}Écris avec tes mots : une idée, un bouton à ajouter, quelque chose qui marche mal, la suite que tu veux.</p>
              <textarea id="demande" className="champ" rows={4} placeholder="Ici je voudrais…" value={brouillonDemande} onChange={(e) => setBrouillonDemande(e.target.value)} />
              <div className="actions">
                <button className="bouton" disabled={!brouillonDemande.trim()} onClick={ajouterDemande}>Ajouter la demande</button>
                {micro !== "absent" && <button className="bouton second" aria-pressed={micro === "ecoute"} onClick={dicter}><Mic size={17} /> {micro === "ecoute" ? "J'écoute… touche pour finir" : "Dicter"}</button>}
              </div>
            </section>
            {etat.demandes.length > 0 && (
              <ul className="changements">
                {etat.demandes.map((d) => <li key={d.id}><span><b>{d.element || "Toute l'app"} · {nomEcran(d.ecran)}</b> {d.texte}</span><button className="rond petit" aria-label="Retirer cette demande" onClick={() => changer((e) => ({ ...e, demandes: e.demandes.filter((x) => x.id !== d.id) }))}><X size={15} /></button></li>)}
              </ul>
            )}
          </>}

          {onglet === "suite" && <Suite />}

          {onglet === "liste" && (nb === 0
            ? <p className="vide">Aucun changement pour l'instant. L'app est exactement comme en ligne.</p>
            : <>
              <ul className="changements">
                {Object.entries(etat.jetons).map(([n, v]) => <li key={n}><span><b>{nomJeton(n)}</b> {v}</span><button className="rond petit" aria-label="Retirer ce changement" onClick={() => poserJeton(n, null)}><X size={15} /></button></li>)}
                {etat.textes.map((x) => <li key={x.sel + x.avant}><span><b>Mots changés · {nomEcran(x.ecran)}</b> « {x.avant} » devient « {x.apres} »</span><button className="rond petit" aria-label="Retirer ce changement" onClick={() => changer((e) => ({ ...e, textes: e.textes.filter((y) => y !== x) }))}><X size={15} /></button></li>)}
                {etat.demandes.map((d) => <li key={d.id}><span><b>Demande · {d.element || "Toute l'app"}</b> {d.texte}</span><button className="rond petit" aria-label="Retirer cette demande" onClick={() => changer((e) => ({ ...e, demandes: e.demandes.filter((y) => y.id !== d.id) }))}><X size={15} /></button></li>)}
                {Object.entries(etat.regles).flatMap(([s, props]) => Object.entries(props).filter(([p]) => !p.startsWith("-webkit-")).map(([p, v]) => (
                  <li key={s + p}><span><b>{NOMS_CLASSES[s.slice(1)] ?? s}</b> {p === "display" ? "caché" : `${NOMS_PROPS[p] ?? PROPS.find((x) => x.css === p)?.nom ?? p} : ${v}`}</span><button className="rond petit" aria-label="Retirer ce changement" onClick={() => poser(s, p, null)}><X size={15} /></button></li>
                )))}
              </ul>
              <div className="actions">
                <button className="bouton second" onClick={() => changer(() => VIDE)}><RotateCcw size={17} /> Tout remettre comme avant</button>
              </div>
            </>)}
        </div>

        {nb > 0 && (
          <footer className="pied-atelier">
            {envoi === "fait" && <span className="applique"><Check size={18} /> Envoyé. Dis à Claude « applique le design » dans la conversation.</span>}
            {envoi === "copie" && <span className="applique"><Check size={18} /> Copié. Colle-le dans la conversation avec Claude.</span>}
            <button className="bouton large" disabled={envoi === "en-cours" || envoi === "fait"} onClick={envoyer}><Send size={18} /> {envoi === "en-cours" ? "Envoi…" : envoi === "fait" ? "Envoyé à Claude" : "Envoyer à Claude"}</button>
          </footer>
        )}
      </aside>
    </div>
  );
}

const nomJeton = (n: string) => { for (const g of NOMS_JETONS) if (g.noms[n]) return g.noms[n]; return n.slice(2); };

function Ligne({ nom, change, onRemettre, children }: { nom: string; change: boolean; onRemettre: () => void; children: ReactNode }) {
  return (
    <div className={"reglage" + (change ? " change" : "")}>
      <span className="reglage-nom">{nom}{change && <button className="remettre" onClick={onRemettre} aria-label={`Remettre ${nom} comme avant`}><RotateCcw size={14} /></button>}</span>
      {children}
    </div>
  );
}

function Curseur({ valeur, min, max, pas, unite, onChange }: { valeur: number; min: number; max: number; pas: number; unite: string; onChange: (n: number) => void }) {
  return (
    <span className="curseur">
      <input type="range" min={Math.min(min, valeur)} max={Math.max(max, valeur)} step={pas} value={valeur} onChange={(e) => onChange(Number(e.target.value))} />
      <input type="number" className="champ nombre" step={pas} value={valeur} onChange={(e) => { if (e.target.value !== "") onChange(Number(e.target.value)); }} />
      <small>{unite}</small>
    </span>
  );
}

function ChampCouleur({ valeur, onChange }: { valeur: string; onChange: (v: string) => void }) {
  const c = lireCouleur(valeur) ?? { hex: "#ffffff", a: 1 };
  return (
    <span className="couleur">
      <input type="color" value={c.hex} onChange={(e) => onChange(ecrireCouleur({ hex: e.target.value, a: c.a || 1 }))} aria-label="Couleur" />
      <input type="range" min={0} max={100} value={Math.round(c.a * 100)} onChange={(e) => onChange(ecrireCouleur({ hex: c.hex, a: Number(e.target.value) / 100 }))} aria-label="Transparence" />
      <small>{Math.round(c.a * 100)} %</small>
    </span>
  );
}

function Reglage({ p, style, pose, onChange }: { p: Prop; style: CSSStyleDeclaration | null; pose: string | undefined; onChange: (v: string | null) => void }) {
  const lu = pose ?? style?.getPropertyValue(p.lit ?? p.css) ?? (p.type === "flou" ? "blur(20px)" : "");
  let champ: ReactNode;
  if (p.type === "couleur") champ = <ChampCouleur valeur={lu} onChange={onChange} />;
  else if (p.type === "ombre") champ = (
    <select className="champ" value={pose ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Comme dans l'app</option>
      {OMBRES.map((o) => <option key={o.nom} value={o.css}>{o.nom}</option>)}
    </select>
  );
  else if (p.type === "flou") {
    const m = /blur\(([\d.]+)px\)/.exec(lu);
    champ = <Curseur valeur={m ? Number(m[1]) : 0} min={0} max={40} pas={1} unite="px" onChange={(n) => onChange(n ? `blur(${n}px) saturate(1.7)` : "none")} />;
  } else {
    const n = parseFloat(lu);
    champ = <Curseur valeur={Number.isFinite(n) ? Math.round(n * 100) / 100 : 0} min={p.min!} max={p.max!} pas={p.pas!} unite={p.unite ?? ""} onChange={(x) => onChange(x + (p.unite ?? ""))} />;
  }
  return <Ligne nom={p.nom} change={pose != null} onRemettre={() => onChange(null)}>{champ}</Ligne>;
}
