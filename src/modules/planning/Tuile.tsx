import { CalendarDays } from "pulsoicon-react";
import { auJour } from "../../lib/dates";
import { useTaches } from "../../data/hooks";
import type { ContexteModule } from "../contrat";
import { duJour, joursAVenir } from "./semaine";

// Sa tuile sur l'accueil : ce qui arrive demain et dans la semaine. Elle ouvre la page Agenda.
export function TuilePlanning({ now, aller }: ContexteModule) {
  const taches = useTaches() ?? [];
  const today = auJour(0, now);
  const demain = duJour(taches, auJour(1, now), today).length;
  const semaine = joursAVenir(now).slice(1).reduce((n, j) => n + duJour(taches, j, today).length, 0);
  return (
    <a className="tuile" href="#planning" onClick={(e) => { e.preventDefault(); aller("planning"); }}>
      <span className="tuile-icone" aria-hidden="true"><CalendarDays size={18} strokeWidth={1.8} animated={false} /></span>
      <b>Agenda</b>
      <span>{demain ? `Demain : ${demain} chose${demain > 1 ? "s" : ""}` : semaine ? `${semaine} chose${semaine > 1 ? "s" : ""} cette semaine` : "Semaine libre"}</span>
    </a>
  );
}

