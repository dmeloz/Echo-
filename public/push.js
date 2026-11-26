// Ajouté au service worker d'Echo : afficher un rappel reçu, et ouvrir Echo quand on le touche.
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch { /* message vide */ }
  e.waitUntil(self.registration.showNotification(d.titre || "Echo", { body: d.texte || "", tag: d.tag, icon: "icon-192.png", badge: "icon-192.png" }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((l) => (l.length ? l[0].focus() : self.clients.openWindow(self.registration.scope))));
});
