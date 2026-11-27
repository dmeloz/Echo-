-- Echo qui agit (lot 1 du moteur) : le budget du jour de l'IA, et le journal d'Echo partagé au foyer.

-- 1. Ce qu'Echo a dépensé, par jour (heure de Zurich), en micro-dollars. Réservé au serveur.
create table if not exists prive.depenses_echo (
  jour date not null primary key,
  micro bigint not null default 0
);
alter table prive.depenses_echo enable row level security;

create or replace function public.depense_echo_du_jour()
returns bigint language sql security definer set search_path = '' as $$
  select coalesce((select d.micro from prive.depenses_echo d where d.jour = (now() at time zone 'Europe/Zurich')::date), 0);
$$;
revoke all on function public.depense_echo_du_jour() from public, anon, authenticated;
grant execute on function public.depense_echo_du_jour() to service_role;

create or replace function public.noter_depense_echo(p_micro bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_micro is null or p_micro <= 0 then return; end if;
  insert into prive.depenses_echo (jour, micro) values ((now() at time zone 'Europe/Zurich')::date, p_micro)
  on conflict (jour) do update set micro = prive.depenses_echo.micro + excluded.micro;
  delete from prive.depenses_echo where jour < (now() at time zone 'Europe/Zurich')::date - 400;
end $$;
revoke all on function public.noter_depense_echo(bigint) from public, anon, authenticated;
grant execute on function public.noter_depense_echo(bigint) to service_role;

-- 2. Le journal d'Echo part au foyer comme les autres données (table « elements », genre « journal »).
alter table public.elements drop constraint elements_genre_check;
alter table public.elements add constraint elements_genre_check
  check (genre in ('tache', 'horaire', 'course', 'habitude', 'repas', 'stock', 'gout', 'journal'));
