// Prépare dist-atelier pour une page Claude : l'app devient app.html, et l'atelier devient page.html
// (seulement le contenu : la page Claude fournit elle-même <html>, <head> et <body>).
import { readFileSync, renameSync, writeFileSync } from "node:fs";

renameSync("dist-atelier/index.html", "dist-atelier/app.html");
const html = readFileSync("dist-atelier/atelier.html", "utf8");
const balises = [...html.matchAll(/<(?:script|link)[^>]*(?:src|href)="\.\/assets[^>]*>(?:<\/script>)?/g)].map((m) => m[0]);
writeFileSync("dist-atelier/page.html", [
  "<title>Atelier Echo</title>",
  ...balises,
  '<div id="root"></div>',
].join("\n") + "\n");
console.log("dist-atelier/page.html : " + balises.length + " fichiers liés.");
