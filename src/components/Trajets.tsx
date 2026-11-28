import { useRef, useState } from "react";
import { useReglage } from "../data/hooks";
import { MOYENS, TRAJETS_DEFAUT, heureDepart, lireTrajets, modeDe, poserTrajets, type Moyen, type Trajets } from "../lib/trajet";
import { lieuDe } from "../lib/meteo";
import { auJour, heureFr } from "../lib/dates";

// Réglages → Agenda → Trajets : d'où on part, où on travaille, et comment. L'accueil dit alors « pars à 7 h 30 ».
export function SectionTrajets() {
  const t = { ...TRAJETS_DEFAUT, ...useReglage<Partial<Trajets>>("trajets", {}) };
  // Les enregistrements se suivent ; « Essayer » attend le dernier.
  const file = useRef<Promise<unknown>>(Promise.resolve());
  const poser = (x: Partial<Trajets>) => { file.current = file.current.then(() => poserTrajets(x)).catch(() => {}); };
  const [essai, setEssai] = useState("");
  const essayer = async () => {
    setEssai("Je calcule…");
    await file.current;
    const t = await lireTrajets();
    const d = await heureDepart({ de: t.maison, a: t.travail, jour: auJour(1), arrivee: "08:00", mode: modeDe(t.moyen) });
    if (d === "adresses") setEssai("Écris d'abord les deux adresses.");
    else if (d === "introuvable") setEssai("Je ne trouve pas ce trajet. Écris l'adresse avec la rue et la ville.");
    else if (d === "service") setEssai("Le calcul ne répond pas pour l'instant. Réessaie plus tard.");
    else setEssai(`Pour arriver à 8 h : pars à ${heureFr(d.depart).replace(/^0/, "")} (${d.minutes} min${d.train ? `, ${d.ligne} de ${heureFr(d.train).replace(/^0/, "")}` : ""}).`);
  };
  return (
    <section className="g reglages">
      <span className="lab">Trajets</span>
      <label className="champ">D'où tu pars
        <input key={`m${t.maison}`} defaultValue={t.maison} placeholder="Rue, code postal et ville" autoComplete="street-address" onBlur={(e) => poser({ maison: e.target.value.trim() })} />
      </label>
      <label className="champ">Ton travail
        <input key={`t${t.travail}`} defaultValue={t.travail} placeholder="Nom ou rue, et la ville" autoComplete="off" onBlur={(e) => poser({ travail: e.target.value.trim() })} />
      </label>
      <label className="champ">Comment tu y vas
        <select value={MOYENS.includes(t.moyen) ? t.moyen : "moto"} onChange={(e) => poser({ moyen: MOYENS.find((m) => m === e.target.value) ?? ("moto" satisfies Moyen) })}>
          <option value="moto">Moto</option>
          <option value="voiture">Voiture</option>
          <option value="transports">Transports publics</option>
        </select>
      </label>
      {t.moyen === "moto" && <p className="aide-champ">S'il neige ou si la route gèle à l'heure de partir, l'accueil te propose les transports à la place.</p>}
      <label className="champ">Ta ville, pour la météo
        <input key={`v${t.ville}`} defaultValue={t.ville} placeholder={lieuDe("", t.maison) ? `Trouvée avec ton adresse (${lieuDe("", t.maison)})` : "Lausanne, Morges…"} autoComplete="address-level2" onBlur={(e) => poser({ ville: e.target.value.trim() })} />
      </label>
      <p className="aide-champ">Les jours de travail, l'accueil te dit à quelle heure partir. Les adresses sont gardées sur ce téléphone et servent seulement à calculer le trajet. Pour la météo, seul le nom de la ville (ou le code postal) est envoyé à Open-Meteo.</p>
      <button type="button" className="bouton-texte" onClick={essayer}>Essayer</button>
      {essai && <p className="aide-champ" role="status">{essai}</p>}
    </section>
  );
}
