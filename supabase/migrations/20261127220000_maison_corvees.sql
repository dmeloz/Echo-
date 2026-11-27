-- Maison : les corvées (genre « corvee ») et les corvées faites (genre « corvee_faite ») partent au foyer comme le reste.
alter table public.elements drop constraint elements_genre_check;
alter table public.elements add constraint elements_genre_check
  check (genre in ('tache', 'horaire', 'course', 'habitude', 'repas', 'stock', 'gout', 'ticket', 'journal', 'memoire', 'batch', 'recette', 'corvee', 'corvee_faite'));
