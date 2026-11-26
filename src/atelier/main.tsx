import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/figtree";
import { Atelier } from "./Atelier";
import "./atelier.css";

createRoot(document.getElementById("root")!).render(<StrictMode><Atelier /></StrictMode>);
