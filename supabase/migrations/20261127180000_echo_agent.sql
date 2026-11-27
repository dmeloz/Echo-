-- Echo qui agit (lot 1 du moteur) : le budget du jour de l'IA, et le journal d'Echo partagé au foyer.

-- 1. Ce qu'Echo a dépensé, par jour (heure de Zurich) et par source, en micro-dollars. Réservé au serveur.
--    source : « membre » (les membres du foyer) ou « code » (le code partagé, avec un budget à part, plus petit).
create table if not exists prive.depenses_echo (
  jour date not null,
  source text not null check (source in ('membre', 'code')),
  micro bigint not null default 0,
  primary key (jour, source)
);
alter table prive.depenses_echo enable row level security;

create or replace function public.depense_echo_du_jour(p_source text)
returns bigint language sql security definer set search_path = '' as $$
  select coalesce((select d.micro from prive.depenses_echo d
    where d.jour = (now() at time zone 'Europe/Zurich')::date and d.source = p_source), 0);
$$;
revoke all on function public.depense_echo_du_jour(text) from public, anon, authenticated;
grant execute on function public.depense_echo_du_jour(text) to service_role;

create or replace function public.noter_depense_echo(p_source text, p_micro bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_micro is null or p_micro <= 0 or p_source not in ('membre', 'code') then return; end if;
  insert into prive.depenses_echo (jour, source, micro) values ((now() at time zone 'Europe/Zurich')::date, p_source, p_micro)
  on conflict (jour, source) do update set micro = prive.depenses_echo.micro + excluded.micro;
  delete from prive.depenses_echo where jour < (now() at time zone 'Europe/Zurich')::date - 400;
end $$;
revoke all on function public.noter_depense_echo(text, bigint) from public, anon, authenticated;
grant execute on function public.noter_depense_echo(text, bigint) to service_role;

-- 2. Le journal et la mémoire d'Echo partent au foyer comme les autres données (table « elements », genres « journal » et « memoire »).
alter table public.elements drop constraint elements_genre_check;
alter table public.elements add constraint elements_genre_check
  check (genre in ('tache', 'horaire', 'course', 'habitude', 'repas', 'stock', 'gout', 'ticket', 'journal', 'memoire'));
