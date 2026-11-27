-- Maison, lot 3 : les papiers du foyer partent au foyer comme le reste, et leurs photos vont dans un dossier privé du foyer.
alter table public.elements drop constraint elements_genre_check;
alter table public.elements add constraint elements_genre_check
  check (genre in ('tache', 'horaire', 'course', 'habitude', 'repas', 'stock', 'gout', 'ticket', 'journal', 'memoire', 'batch', 'recette', 'corvee', 'corvee_faite', 'reparation', 'appareil', 'contact', 'papier'));

-- Les photos des papiers (choix de Dany : sur le serveur du foyer). Privé : seuls les membres du foyer lisent et écrivent
-- dans le dossier « <id du foyer>/ ». 5 Mo au plus par photo, des images seulement.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('papiers', 'papiers', false, 5242880, array['image/jpeg', 'image/png', 'image/heic', 'image/webp'])
on conflict (id) do nothing;

create policy "papiers du foyer : lire" on storage.objects for select to authenticated
  using (bucket_id = 'papiers' and (storage.foldername(name))[1] = (select prive.mon_foyer())::text);
create policy "papiers du foyer : ajouter" on storage.objects for insert to authenticated
  with check (bucket_id = 'papiers' and (storage.foldername(name))[1] = (select prive.mon_foyer())::text);
create policy "papiers du foyer : remplacer" on storage.objects for update to authenticated
  using (bucket_id = 'papiers' and (storage.foldername(name))[1] = (select prive.mon_foyer())::text);
create policy "papiers du foyer : retirer" on storage.objects for delete to authenticated
  using (bucket_id = 'papiers' and (storage.foldername(name))[1] = (select prive.mon_foyer())::text);
