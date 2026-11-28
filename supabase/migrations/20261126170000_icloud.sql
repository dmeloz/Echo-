-- Le calendrier iCloud : seuls les foyers listés ici peuvent utiliser la fonction « icloud ».
-- place = la personne du foyer à qui appartient le calendrier (ses événements lui sont attribués).
create table prive.icloud_foyers (
  foyer_id uuid primary key references public.foyers on delete cascade,
  place text not null check (place in ('moi','elle'))
);

create function public.icloud_place() returns text language sql stable security definer set search_path = '' as $$
  select place from prive.icloud_foyers where foyer_id = (select prive.mon_foyer())
$$;
revoke execute on function public.icloud_place() from public, anon;
grant execute on function public.icloud_place() to authenticated;
