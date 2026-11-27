-- Budget, lot 1 : les postes (montants datés), les dépenses, les catégories, les soldes notés et les factures à payer partent au foyer comme le reste.
alter table public.elements drop constraint elements_genre_check;
alter table public.elements add constraint elements_genre_check
  check (genre in ('tache', 'horaire', 'course', 'habitude', 'repas', 'stock', 'gout', 'ticket', 'journal', 'memoire', 'batch', 'recette', 'corvee', 'corvee_faite', 'reparation', 'appareil', 'contact',
    'budget_poste', 'budget_depense', 'budget_categorie', 'budget_solde', 'budget_apayer'));
