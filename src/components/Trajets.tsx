import { useState } from "react";
import { poserReglage, useReglage } from "../data/hooks";
import { TRAJETS_DEFAUT, heureDepart, type Trajets } from "../lib/trajet";
import { auJour, heureFr } from "../lib/dates";

// Réglages → Agenda → Trajets : d'où on part, où on travaille, et comment. L'accueil dit alors « pars à 7 h 30 ».
export function SectionTrajets() {
  const t = { ...TRAJETS_DEFAUT, ...useReglage<Partial<Trajets>>("trajets", {}) };
  const poser = (x: Partial<Trajets>) => poserReglage("trajets", { ...t, ...x });
  const [essai, setEssai] = useState("");
  const essayer = async () => {
    setEssai("Je calcule…");
    const d = await heureDepart({ de: t.maison, a: t.travail, jour: auJour(1), arrivee: "08:00", mode: t.moyen });
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
        <select value={t.moyen} onChange={(e) => poser({ moyen: e.target.value === "transports" ? "transports" : "moto" })}>
          <option value="moto">Moto ou voiture</option>
          <option value="transports">Transports publics</option>
        </select>
      </label>
      <p className="aide-champ">Les jours de travail, l'accueil te dit à quelle heure partir. Les adresses restent sur ce téléphone.</p>
      <button type="button" className="bouton-texte" onClick={essayer}>Essayer</button>
      {essai && <p className="aide-champ" role="status">{essai}</p>}
    </section>
  );
}
