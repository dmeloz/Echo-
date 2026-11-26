-- Sécurité (relecture du 26/11) :
-- 1. Le code d'invitation à 6 chiffres ne doit pas pouvoir être deviné. Avant, la limite (10 essais par heure)
--    comptait par compte ; or un compte anonyme se crée en un instant, donc la limite ne protégeait rien.
--    Maintenant : 5 essais ratés par heure et par compte, ET au plus 20 essais ratés en 15 minutes pour tout le monde.
--    À ce rythme, deviner un code parmi un million prendrait des années, et un code ne vit qu'une heure.
--    Un essai raté ne lève plus d'erreur (une erreur annulerait aussi l'essai noté) : la fonction ne renvoie
--    simplement aucune ligne, et l'app dit « code faux ».
--    Choix assumé : pendant une attaque, la limite commune peut faire attendre aussi un vrai membre.
--    Mieux vaut attendre un quart d'heure que de voir un inconnu entrer dans le foyer.
-- 2. Les fonctions qui appellent l'IA (echo, lire-horaires) : seuls les foyers listés dans prive.ia_foyers
--    y ont droit (créer un foyer ne suffit pas, n'importe qui peut en créer un), ou le code Echo.
--    Les appels sont comptés, pour qu'un code partagé ne puisse pas vider le crédit.

create index if not exists tentatives_quand on prive.tentatives (quand);

create or replace function public.rejoindre_foyer(p_code text, p_prenom text) returns table (foyer uuid, place text)
language plpgsql security definer set search_path = '' as $$
declare f uuid; inviteur uuid; p text; deja uuid;
begin
  if auth.uid() is null then raise exception 'non_connecte'; end if;
  if (select count(*) from prive.tentatives t where t.user_id = auth.uid() and t.quand > now() - interval '1 hour') >= 5
     or (select count(*) from prive.tentatives t where t.quand > now() - interval '15 minutes') >= 20 then
    raise exception 'trop_essais';
  end if;
  if trim(coalesce(p_code, '')) !~ '^\d{6}$' then
    insert into prive.tentatives (user_id) values (auth.uid());
    return;
  end if;
  select i.foyer_id, i.cree_par into f, inviteur from public.invitations i where i.code = trim(p_code) and i.expire > now();
  if f is null then
    insert into prive.tentatives (user_id) values (auth.uid());
    return;
  end if;
  select m.foyer_id into deja from public.membres m where m.user_id = auth.uid();
  if deja = f then
    select m.place into p from public.membres m where m.user_id = auth.uid();
    return query select f, p; return;
  end if;
  if deja is not null then raise exception 'deja_membre'; end if;
  select x into p from unnest(array['moi','elle']) x where x not in (select m.place from public.membres m where m.foyer_id = f) limit 1;
  if p is null then
    select m.place into p from public.membres m where m.foyer_id = f and m.user_id <> inviteur limit 1;
    if p is null then raise exception 'complet'; end if;
    delete from public.membres m where m.foyer_id = f and m.place = p;
  end if;
  insert into public.membres (foyer_id, user_id, prenom, place) values (f, auth.uid(), trim(p_prenom), p);
  delete from public.invitations where code = trim(p_code);
  -- Ménage : les essais de plus d'un jour ne servent plus.
  delete from prive.tentatives where quand < now() - interval '1 day';
  return query select f, p;
end $$;
revoke execute on function public.rejoindre_foyer(text, text) from public, anon;
grant execute on function public.rejoindre_foyer(text, text) to authenticated;

-- Les appels aux fonctions d'IA, comptés par personne (ou par code) et pour tout le monde.
create table if not exists prive.appels (
  qui text not null,
  quoi text not null,
  quand timestamptz not null default now()
);
create index if not exists appels_quoi_quand on prive.appels (quoi, quand);
create index if not exists appels_quand on prive.appels (quand);
alter table prive.appels enable row level security;

-- Renvoie true si l'appel est permis (et le note), false si une limite est atteinte. Réservée au serveur.
create or replace function public.noter_appel(p_qui text, p_quoi text, p_max_personne int, p_max_tous int)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  -- Un appel à la fois par fonction : des appels lancés ensemble ne passent pas tous sous la limite.
  perform pg_advisory_xact_lock(hashtext('echo-appels:' || p_quoi));
  if (select count(*) from prive.appels a where a.quoi = p_quoi and a.qui = p_qui and a.quand > now() - interval '1 hour') >= p_max_personne
     or (p_max_tous > 0 and (select count(*) from prive.appels a where a.quoi = p_quoi and a.qui = 'code' and a.quand > now() - interval '1 hour') >= p_max_tous) then
    return false;
  end if;
  insert into prive.appels (qui, quoi) values (p_qui, p_quoi);
  delete from prive.appels where quand < now() - interval '1 day';
  return true;
end $$;
revoke all on function public.noter_appel(text, text, int, int) from public, anon, authenticated;
grant execute on function public.noter_appel(text, text, int, int) to service_role;

-- Les foyers qui ont droit à l'IA d'Echo (assistant, lecture de la fiche). Ajoutés à la main, comme pour iCloud.
create table if not exists prive.ia_foyers (
  foyer_id uuid primary key references public.foyers on delete cascade
);
alter table prive.ia_foyers enable row level security;

-- Le foyer de cette personne, s'il a droit à l'IA. Réservée au serveur.
create or replace function public.foyer_ia(p_user uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select m.foyer_id from public.membres m join prive.ia_foyers i on i.foyer_id = m.foyer_id where m.user_id = p_user
$$;
revoke all on function public.foyer_ia(uuid) from public, anon, authenticated;
grant execute on function public.foyer_ia(uuid) to service_role;
