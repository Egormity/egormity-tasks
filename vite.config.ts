import {
  internalTasksDevelopmentPolicy,
  internalTasksPolicy,
} from "./src/api/contracts/policy.js";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { URL, fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  base: internalTasksPolicy.basePath,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src/web", import.meta.url)),
      "@contracts": fileURLToPath(new URL("./src/api/contracts", import.meta.url)),
    },
  },
  build: { outDir: "dist/web/client" },
  server: {
    host: internalTasksDevelopmentPolicy.frontendHost,
    port: internalTasksDevelopmentPolicy.frontendPort,
    strictPort: true,
    // New chats create Git worktrees here. Their tsconfig/index files must not reload this UI.
    watch: { ignored: ["**/.runtime/**"] },
    proxy: { [internalTasksPolicy.apiPath]: `http://127.0.0.1:${internalTasksPolicy.port}` },
  },
});
