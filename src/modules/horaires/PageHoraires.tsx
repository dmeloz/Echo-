import type { ContexteModule } from "../contrat";
import { aHorairesFixes } from "../../lib/fixes";
import { VueHoraires } from "../planning/Horaires";
import { CarteVacances, HorairesFixes } from "../planning/Vacances";

// Mes horaires, sous-page de l'Agenda (bouton en haut de l'Agenda) : les horaires qui changent arrivent une ou deux semaines à l'avance,
// on les pose ici ; l'Agenda, l'accueil et le résumé du matin les lisent.
export function PageHoraires({ noms, proprio, now }: ContexteModule) {
  return (
    <>
      {aHorairesFixes(noms, proprio) ? <HorairesFixes /> : <VueHoraires proprio={proprio} now={now} />}
      <CarteVacances noms={noms} now={now} />
    </>
  );
}
