import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// En ligne sur GitHub Pages, l'app vit dans /Echo-/ ; en local, à la racine.
const atelier = !!process.env.ATELIER;
const base = atelier ? "./" : process.env.BASE || "/";

const maintenant = new Date();
const dateVersion = maintenant.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Zurich" })
  + " à " + maintenant.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" });

export default defineConfig({
  base,
  // ATELIER=1 : construit aussi l'atelier de design (outil de travail, publié à part), dans dist-atelier, sans mise en cache.
  build: atelier ? { outDir: "dist-atelier", rollupOptions: { input: { index: "index.html", atelier: "atelier.html" } } } : {},
  define: {
    __DATE_VERSION__: JSON.stringify(dateVersion),
    __CODE_VERSION__: JSON.stringify((process.env.GITHUB_SHA || "").slice(0, 7)),
  },
  plugins: [
    react(),
    // L'app s'installe sur l'écran d'accueil de l'iPhone et marche sans réseau.
    VitePWA({
      disable: atelier,
      registerType: "prompt",
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Echo · notre foyer",
        short_name: "Echo",
        description: "Les tâches, la maison, la cuisine et le budget du foyer, à deux.",
        lang: "fr",
        theme_color: "#f2f6f8",
        background_color: "#f2f6f8",
        display: "standalone",
        start_url: ".",
        scope: ".",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,svg,png,woff2,wasm}"], importScripts: ["push.js"] }, // push.js : les rappels
    }),
  ],
});
