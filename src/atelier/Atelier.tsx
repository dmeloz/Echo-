// L'atelier de design : la VRAIE app tourne dans le cadre à gauche (même adresse, mêmes fichiers),
// et le panneau pose par-dessus une feuille de style que l'on règle au doigt. Rien n'est redessiné ici.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, ChevronDown, ChevronUp, Copy, Eye, Layers, MousePointerClick, Palette, Pointer, RotateCcw, Undo2, X, Zap } from "pulsoicon-react";
import { CLE_BROUILLON, CLE_GARDE, VIDE, cssDe, ecrireCouleur, lireCouleur, nombreDeChangements, type Etat } from "../lib/atelier";
import { AMBIANCES, ECRANS, ETATS, GROUPES, NOMS_CLASSES, NOMS_JETONS, NOMS_PROPS, OMBRES, PROPS, RAPIDES, TAILLES, TEINTES, type Prop } from "./listes";

type Maillon = { el: Element; sel: string; nom: string };
type Jeton = { nom: string; origine: string };

const charger = (): Etat => { try { return { ...VIDE, ...JSON.parse(localStorage.getItem(CLE_BROUILLON) || "{}") }; } catch { return VIDE; } };
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
  const [garde, setGarde] = useState(() => !!localStorage.getItem(CLE_GARDE));
  const [choisir, setChoisir] = useState(true);
  const [onglet, setOnglet] = useState<"rapide" | "element" | "theme" | "liste">("rapide");
  const [maillons, setMaillons] = useState<Maillon[]>([]);
  const [sel, setSel] = useState<string>("");
  const [jetons, setJetons] = useState<Jeton[]>([]);
  const [taille, setTaille] = useState(0);
  const [ouvert, setOuvert] = useState(true);
  const [avant, setAvant] = useState(false);
  const [copie, setCopie] = useState(false);
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
    localStorage.setItem(CLE_BROUILLON, JSON.stringify(etat));
    if (garde && css) localStorage.setItem(CLE_GARDE, css); else localStorage.removeItem(CLE_GARDE);
    const st = doc()?.getElementById("atelier-direct");
    if (st) st.textContent = avant ? "" : css;
    redessiner((n) => n + 1);
  }, [etat, garde, avant]);

  useEffect(() => { doc()?.documentElement.classList.toggle("atelier-choisir", choisir); if (!choisir) placer("atelier-survol", null); }, [choisir]);

  const placer = (id: string, el: Element | null | undefined) => {
    const boite = doc()?.getElementById(id); if (!boite) return;
    if (!el || !el.isConnected) { boite.style.display = "none"; return; }
    const r = el.getBoundingClientRect();
    Object.assign(boite.style, { display: "block", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
  };

  // Le cadre suit l'élément choisi (défilement, animation, changement de taille).
  useEffect(() => {
    const t = setInterval(() => placer("atelier-choix", cible?.el), 150);
    return () => clearInterval(t);
  });

  const brancher = () => {
    const d = doc(); if (!d || d.getElementById("atelier-direct")) return;
    d.getElementById("atelier-garde")?.remove(); // ici, seul le brouillon compte
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
  const nb = nombreDeChangements(etat);
  const texte = cssDe(etat);
  const copier = async () => {
    const tout = "Changements de l'atelier Echo à mettre dans l'app :\n\n" + texte;
    try { await navigator.clipboard.writeText(tout); } catch {
      const z = document.createElement("textarea"); z.value = tout; document.body.append(z); z.select(); document.execCommand("copy"); z.remove();
    }
    setCopie(true); setTimeout(() => setCopie(false), 2500);
  };

  const t = TAILLES[taille];
  const style = cible ? cadre.current!.contentWindow!.getComputedStyle(cible.el) : null;

  return (
    <div className={"atelier" + (ouvert ? " ouvert" : "")}>
      <main className="cote-app">
        <div className="ecrans">
          <button className="puce mobile" aria-pressed={ouvert} onClick={() => setOuvert(!ouvert)}><Layers size={15} /> Régler</button>
          <button className="puce mobile" aria-pressed={choisir} onClick={() => setChoisir(!choisir)}><MousePointerClick size={15} /> Choisir</button>
          <a className="puce" href="./"><ArrowLeft size={15} /> Echo</a>
          {ECRANS.map((e) => <button key={e.id} className="puce" onClick={() => aller(e.id)}>{e.nom}</button>)}
          {ETATS.map((e) => <button key={e.nom} className="puce etat" onClick={() => ouvrirEtat(e.sel)}>{e.nom}</button>)}
          <button className="puce etat" onClick={recharger}>Tout refermer</button>
          <select className="puce" aria-label="Taille de l'écran" value={taille} onChange={(e) => setTaille(Number(e.target.value))}>
            {TAILLES.map((x, i) => <option key={x.nom} value={i}>{x.nom}</option>)}
          </select>
        </div>
        <div className="telephone" style={{ width: t.l * echelle, height: t.h * echelle }}>
          <iframe ref={cadre} title="L'app Echo" src="./" onLoad={auChargement} style={{ width: t.l, height: t.h, transform: `scale(${echelle})` }} />
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
          <button aria-pressed={onglet === "rapide"} onClick={() => setOnglet("rapide")}><Zap size={16} /> Rapide</button>
          <button aria-pressed={onglet === "element"} onClick={() => setOnglet("element")}><Layers size={16} /> Élément</button>
          <button aria-pressed={onglet === "theme"} onClick={() => setOnglet("theme")}><Palette size={16} /> Couleurs</button>
          <button aria-pressed={onglet === "liste"} onClick={() => setOnglet("liste")}>Changements{nb ? ` (${nb})` : ""}</button>
        </nav>

        <div className="contenu">
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

          {onglet === "liste" && (nb === 0
            ? <p className="vide">Aucun changement pour l'instant. L'app est exactement comme en ligne.</p>
            : <>
              <ul className="changements">
                {Object.entries(etat.jetons).map(([n, v]) => <li key={n}><span><b>{nomJeton(n)}</b> {v}</span><button className="rond petit" aria-label="Retirer ce changement" onClick={() => poserJeton(n, null)}><X size={15} /></button></li>)}
                {Object.entries(etat.regles).flatMap(([s, props]) => Object.entries(props).filter(([p]) => !p.startsWith("-webkit-")).map(([p, v]) => (
                  <li key={s + p}><span><b>{NOMS_CLASSES[s.slice(1)] ?? s}</b> {NOMS_PROPS[p] ?? PROPS.find((x) => x.css === p)?.nom ?? p} : {v}</span><button className="rond petit" aria-label="Retirer ce changement" onClick={() => poser(s, p, null)}><X size={15} /></button></li>
                )))}
              </ul>
              <div className="actions">
                <button className="bouton second" onClick={() => changer(() => VIDE)}><RotateCcw size={17} /> Tout remettre comme avant</button>
              </div>
              <section className="groupe">
                <h3>Pour Sarah aussi, et pour toujours</h3>
                <p className="aide">« Appliquer à mon app » change l'app sur cet appareil. Pour que ce soit le design d'Echo pour tout le monde, touche ce bouton et colle dans la conversation avec Claude : il s'occupe du reste.</p>
                <div className="actions"><button className="bouton second" onClick={copier}><Copy size={17} /> {copie ? "Copié, colle-le à Claude" : "Copier pour Claude"}</button></div>
              </section>
            </>)}
        </div>

        {(nb > 0 || garde) && (
          <footer className="pied-atelier">
            {garde
              ? <><span className="applique"><Check size={18} /> Dans ton app, sur cet appareil. Chaque réglage s'y ajoute tout seul.</span>
                  <a className="bouton" href="./">Voir l'app</a>
                  <button className="bouton second" onClick={() => setGarde(false)}>Retirer</button></>
              : <button className="bouton large" onClick={() => setGarde(true)}><Check size={18} /> Appliquer à mon app</button>}
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
