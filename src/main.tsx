import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import "@fontsource-variable/figtree"; // la police est dans l'app : rien n'est demandé à un autre site, et elle marche hors ligne
import App from "./App";
import { suivreClavier } from "./lib/clavier";
import "./styles.css";
import "./finitions.css";

// Filet de sécurité : un enregistrement qui rate ne reste jamais muet.
addEventListener("unhandledrejection", (e) => {
  console.error("[Echo]", e.reason);
  toast("Ça n'a pas marché. Rien n'est perdu : réessaie. Si ça continue, libère un peu de stockage sur le téléphone.", { id: "erreur", duration: 7000 });
});

suivreClavier();

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
