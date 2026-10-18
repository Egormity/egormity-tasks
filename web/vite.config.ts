import {
  internalTasksDevelopmentPolicy,
  internalTasksPolicy,
} from "./src/api/contracts/policy.js";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { URL, fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const previewHost = process.env.AMAZI_PREVIEW_HOST;
const apiTarget =
  process.env.OPERATIONS_AGENT_WEB_API_TARGET ??
  `http://127.0.0.1:${internalTasksPolicy.port}`;
const publicUrl =
  process.env.OPERATIONS_AGENT_PUBLIC_URL ??
  `http://localhost:${internalTasksPolicy.port}`;

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
    host: previewHost ? "0.0.0.0" : internalTasksDevelopmentPolicy.frontendHost,
    port: Number(process.env.PORT ?? internalTasksDevelopmentPolicy.frontendPort),
    strictPort: true,
    allowedHosts: [
      internalTasksDevelopmentPolicy.frontendHost,
      "localhost",
      "127.0.0.1",
      ...(previewHost ? [previewHost] : []),
    ],
    // New chats create Git worktrees here. Their tsconfig/index files must not reload this UI.
    watch: { ignored: ["**/.runtime/**"] },
    proxy: {
      [internalTasksPolicy.apiPath]: {
        target: apiTarget,
        // The API's preview route is host-routed; preserve its upstream Host while proxying.
        changeOrigin: true,
        configure: (proxy) => {
          // Preview traffic is proxied under the same public origin as production.
          proxy.on("proxyReq", (request) => request.setHeader("Origin", publicUrl));
        },
      },
    },
  },
});
