import type { Module } from "../contrat";
import type { ContexteModule } from "../contrat";
import { aHorairesFixes } from "../../lib/fixes";
import { VueHoraires } from "../planning/Horaires";
import { CarteVacances, HorairesFixes } from "../planning/Vacances";

// Mes horaires, à part de l'Agenda : les horaires qui changent arrivent une ou deux semaines à l'avance,
// on les pose ici ; l'Agenda, l'accueil et le résumé du matin les lisent.
function PageHoraires({ noms, proprio, now }: ContexteModule) {
  return (
    <>
      {aHorairesFixes(noms, proprio) ? <HorairesFixes /> : <VueHoraires proprio={proprio} now={now} />}
      <CarteVacances noms={noms} now={now} />
    </>
  );
}

export const horaires: Module = {
  id: "horaires",
  libelle: "Mes horaires",
  resume: "Ton travail du mois et les vacances",
  etat: "construit",
  prevu: [],
  Page: PageHoraires,
};
