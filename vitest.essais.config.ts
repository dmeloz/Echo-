import { defineConfig } from "vitest/config";

// Les phrases d'essai d'Echo (vrai modèle, payant) : à part des tests habituels. Voir essais/echo.essais.ts.
export default defineConfig({ test: { include: ["essais/**/*.essais.ts"], testTimeout: 120_000, fileParallelism: false } });
