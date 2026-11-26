-- Le foyer et la synchro d'Echo. Chacun ne voit que son foyer (règles RLS).
create schema if not exists prive;

create table public.foyers (
  id uuid primary key default gen_random_uuid(),
  cree_le timestamptz not null default now()
);

create table public.membres (
  foyer_id uuid not null references public.foyers on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  prenom text not null check (char_length(prenom) between 1 and 40),
  place text not null check (place in ('moi','elle')),
  cree_le timestamptz not null default now(),
  primary key (foyer_id, user_id),
  unique (foyer_id, place),
  unique (user_id)
);

create table public.invitations (
  code text primary key,
  foyer_id uuid not null references public.foyers on delete cascade,
  expire timestamptz not null,
  cree_par uuid not null references auth.users on delete cascade
);

create table prive.tentatives (
  user_id uuid not null,
  quand timestamptz not null default now()
);
create index on prive.tentatives (user_id, quand);

-- Une ligne par tâche ou par horaire. Une suppression laisse une ligne « supprime » pour que l'autre téléphone l'apprenne.
create table public.elements (
  foyer_id uuid not null references public.foyers on delete cascade,
  genre text not null check (genre in ('tache','horaire')),
  cle text not null,
  data jsonb,
  supprime boolean not null default false,
  par uuid,
  maj timestamptz not null default clock_timestamp(),
  primary key (foyer_id, genre, cle)
);
create index on public.elements (foyer_id, maj);

-- L'heure et l'auteur sont posés par le serveur, pas par le téléphone.
create function prive.marquer() returns trigger language plpgsql set search_path = '' as $$
begin
  new.maj := clock_timestamp();
  new.par := auth.uid();
  return new;
end $$;
create trigger marquer before insert or update on public.elements for each row execute function prive.marquer();

create function prive.mon_foyer() returns uuid language sql stable security definer set search_path = '' as $$
  select foyer_id from public.membres where user_id = auth.uid()
$$;

alter table public.foyers enable row level security;
alter table public.membres enable row level security;
alter table public.invitations enable row level security;
alter table public.elements enable row level security;

grant usage on schema prive to authenticated;
grant execute on function prive.mon_foyer() to authenticated;

create policy "mon foyer" on public.foyers for select to authenticated using (id = (select prive.mon_foyer()));
create policy "membres de mon foyer" on public.membres for select to authenticated using (foyer_id = (select prive.mon_foyer()));
create policy "lire" on public.elements for select to authenticated using (foyer_id = (select prive.mon_foyer()));
create policy "ajouter" on public.elements for insert to authenticated with check (foyer_id = (select prive.mon_foyer()));
create policy "changer" on public.elements for update to authenticated using (foyer_id = (select prive.mon_foyer())) with check (foyer_id = (select prive.mon_foyer()));

revoke all on public.invitations from anon, authenticated;
revoke all on public.foyers, public.membres, public.elements from anon;

-- Créer son foyer (ou retrouver celui qu'on a déjà).
create function public.creer_foyer(p_prenom text, p_place text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare f uuid;
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  select foyer_id into f from public.membres where user_id = auth.uid();
  if f is not null then return f; end if;
  insert into public.foyers default values returning id into f;
  insert into public.membres (foyer_id, user_id, prenom, place)
    values (f, auth.uid(), trim(p_prenom), case when p_place = 'elle' then 'elle' else 'moi' end);
  return f;
end $$;

-- Un code à 6 chiffres pour inviter l'autre, valable 2 jours.
create function public.creer_invitation() returns text
language plpgsql security definer set search_path = '' as $$
declare f uuid; c text;
begin
  select foyer_id into f from public.membres where user_id = auth.uid();
  if f is null then raise exception 'sans_foyer'; end if;
  delete from public.invitations where foyer_id = f or expire < now();
  loop
    c := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.invitations where code = c);
  end loop;
  insert into public.invitations (code, foyer_id, expire, cree_par) values (c, f, now() + interval '2 days', auth.uid());
  return c;
end $$;

-- Rejoindre un foyer avec le code reçu. 10 essais ratés par heure au plus.
create function public.rejoindre_foyer(p_code text, p_prenom text) returns table (foyer uuid, place text)
language plpgsql security definer set search_path = '' as $$
declare f uuid; p text; deja uuid;
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  if (select count(*) from prive.tentatives t where t.user_id = auth.uid() and t.quand > now() - interval '1 hour') >= 10 then
    raise exception 'trop_essais';
  end if;
  select i.foyer_id into f from public.invitations i where i.code = trim(p_code) and i.expire > now();
  if f is null then
    insert into prive.tentatives (user_id) values (auth.uid());
    raise exception 'code_invalide';
  end if;
  select m.foyer_id into deja from public.membres m where m.user_id = auth.uid();
  if deja = f then
    select m.place into p from public.membres m where m.user_id = auth.uid();
    return query select f, p; return;
  end if;
  if deja is not null then raise exception 'deja_membre'; end if;
  select x into p from unnest(array['moi','elle']) x where x not in (select m.place from public.membres m where m.foyer_id = f) limit 1;
  if p is null then raise exception 'complet'; end if;
  insert into public.membres (foyer_id, user_id, prenom, place) values (f, auth.uid(), trim(p_prenom), p);
  delete from public.invitations where code = trim(p_code);
  return query select f, p;
end $$;

revoke execute on function public.creer_foyer(text, text), public.creer_invitation(), public.rejoindre_foyer(text, text) from public, anon;
grant execute on function public.creer_foyer(text, text), public.creer_invitation(), public.rejoindre_foyer(text, text) to authenticated;

alter publication supabase_realtime add table public.elements, public.membres;
