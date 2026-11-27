-- Cuisine : les tickets de caisse lus par photo partent au foyer comme le reste (genre « ticket »).
alter table public.elements drop constraint elements_genre_check;
alter table public.elements add constraint elements_genre_check
  check (genre in ('tache', 'horaire', 'course', 'habitude', 'repas', 'stock', 'gout', 'ticket'));
