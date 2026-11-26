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
