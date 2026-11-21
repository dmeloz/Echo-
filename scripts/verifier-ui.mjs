// Vérification automatique avant chaque version (lancée par la mise en ligne).
// Tient quelques règles de docs/REGLES-UI.md : rien sous 13 px, pas d'emoji dans l'interface.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const fautes = [];
const fichiers = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? fichiers(p) : [p]; });

const css = readFileSync("src/styles.css", "utf8").split("\n");
css.forEach((l, i) => {
  for (const m of l.matchAll(/font-size:\s*([\d.]+)px/g))
    if (Number(m[1]) < 13 && !l.includes("exception")) fautes.push(`styles.css:${i + 1} texte de ${m[1]} px (minimum 13 px)`);
});

for (const f of fichiers("src").filter((f) => /\.(tsx?|css)$/.test(f) && !f.endsWith(".test.ts"))) {
  readFileSync(f, "utf8").split("\n").forEach((l, i) => {
    if (/\p{Extended_Pictographic}/u.test(l)) fautes.push(`${f}:${i + 1} emoji dans l'interface`);
  });
}

if (fautes.length) { console.error("Règles UI non tenues :\n- " + fautes.join("\n- ")); process.exit(1); }
console.log("Règles UI : tout est bon.");
