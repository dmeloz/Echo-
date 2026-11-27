-- Cuisine : le plan du batch (genre « batch ») et le livre de recettes (genre « recette ») partent au foyer comme le reste.
alter table public.elements drop constraint elements_genre_check;
alter table public.elements add constraint elements_genre_check
  check (genre in ('tache', 'horaire', 'course', 'habitude', 'repas', 'stock', 'gout', 'ticket', 'journal', 'memoire', 'batch', 'recette'));
