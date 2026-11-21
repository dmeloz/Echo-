import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// En ligne sur GitHub Pages, l'app vit dans /Echo-/ ; en local, à la racine.
const base = process.env.BASE || "/";

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    // L'app s'installe sur l'écran d'accueil de l'iPhone et marche sans réseau.
    VitePWA({
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
      workbox: { globPatterns: ["**/*.{js,css,html,svg,png}"] },
    }),
  ],
});
