-- Les rappels (notifications). Chaque téléphone qui les autorise a une ligne ici.
create table public.abonnements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  endpoint text not null unique check (char_length(endpoint) between 10 and 1000 and endpoint like 'https://%'),
  p256dh text not null check (char_length(p256dh) < 200),
  auth text not null check (char_length(auth) < 100),
  fuseau text not null default 'Europe/Zurich' check (char_length(fuseau) < 60),
  a_l_heure boolean not null default true,
  matin text check (matin ~ '^([01]\d|2[0-3]):[0-5]\d$'),
  maj timestamptz not null default now()
);
create index on public.abonnements (user_id);
alter table public.abonnements enable row level security;
create policy "mes abonnements" on public.abonnements for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Ce qui a déjà été envoyé, pour ne jamais envoyer deux fois. Lu seulement par la fonction du serveur.
create table public.rappels_envoyes (
  cle text primary key,
  quand timestamptz not null default now()
);
alter table public.rappels_envoyes enable row level security;
revoke all on public.rappels_envoyes from anon, authenticated;

-- Les secrets des rappels, gardés dans le coffre (vault) : echo_cron, vapid_publique, vapid_privee.
-- Seule la fonction du serveur (rôle service_role) peut les lire.
create function public.secrets_rappels() returns table(nom text, valeur text) language sql security definer set search_path = '' as $$
  select name, decrypted_secret from vault.decrypted_secrets where name in ('echo_cron', 'vapid_publique', 'vapid_privee')
$$;
revoke all on function public.secrets_rappels() from public, anon, authenticated;
grant execute on function public.secrets_rappels() to service_role;

-- Les clés d'envoi sont fabriquées par le serveur lui-même (au premier passage) et rangées dans le coffre.
create function public.poser_cles_rappels(p_publique text, p_privee text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from vault.secrets where name = 'vapid_privee') then return; end if;
  perform vault.create_secret(p_publique, 'vapid_publique');
  perform vault.create_secret(p_privee, 'vapid_privee');
end $$;
revoke all on function public.poser_cles_rappels(text, text) from public, anon, authenticated;
grant execute on function public.poser_cles_rappels(text, text) to service_role;

-- La clé publique, que le téléphone demande pour s'inscrire aux notifications.
create function public.cle_rappels() returns text language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'vapid_publique'
$$;
revoke all on function public.cle_rappels() from public, anon;
grant execute on function public.cle_rappels() to authenticated;

-- Le secret de l'appel planifié, fabriqué ici : personne ne le voit.
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'echo_cron')
where not exists (select 1 from vault.secrets where name = 'echo_cron');

-- Chaque minute, la base appelle la fonction « rappels » avec le secret gardé dans le coffre (vault, nom : echo_cron).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('echo-rappels', '* * * * *', $$
  select net.http_post(
    url := 'https://ewqvgayhptfwbpkxsaij.supabase.co/functions/v1/rappels',
    headers := jsonb_build_object('x-echo-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'echo_cron'), 'Content-Type', 'application/json'),
    body := '{}'::jsonb
  )
$$);
