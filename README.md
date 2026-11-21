# Echo · notre foyer

L'app du foyer de Melo et Sarah : les tâches, la maison, la cuisine et le budget, à deux.
App web installable (PWA) pour iPhone et iPad d'abord.

## Ce qui marche (V1)

- **Aujourd'hui** : une phrase de résumé, la tâche « En premier », puis la suite de la journée.
- Ajout rapide en bas : « vétérinaire demain 15h pour nous » → jour, heure et pour qui compris (sans IA pour l'instant).
- Cocher une tâche (avec Annuler), tâches qui reviennent (chaque jour / semaine).
- Glisser une tâche → pour la monter en importance, ← pour la mettre en « plus tard ».
- Feuille du bas pour modifier : jour, heure, pour qui, importance, répétition, note.
- Menu glissant à droite (le bouton rond en bas à droite), style Givre lagon.
- Les données restent sur l'appareil (IndexedDB, avec Dexie).

## Pas encore construit

- Cuisine, Maison et Budget (pages marquées « Pas encore construit »).
- Le partage entre Melo et Sarah (synchro Supabase), les notifications, l'assistant IA.

## Technique

React + TypeScript + Vite, Tailwind, Motion, Dexie, vite-plugin-pwa,
Vaul (feuilles du bas), Sonner (messages), use-gesture (gestes), PulsoIcon (icônes, licence ISC).

```bash
npm install
npm run dev      # en local
npm test         # tests de la compréhension des phrases et de l'importance
npm run build    # version à mettre en ligne (dossier dist)
```
