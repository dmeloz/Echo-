-- Le module Cuisine part au foyer par la même table « elements » : on accepte ses genres de lignes.
-- (course = un article de la liste, habitude = un achat habituel, repas, stock, gout = le questionnaire d'une personne.)
alter table public.elements drop constraint elements_genre_check;
alter table public.elements add constraint elements_genre_check
  check (genre in ('tache', 'horaire', 'course', 'habitude', 'repas', 'stock', 'gout'));
