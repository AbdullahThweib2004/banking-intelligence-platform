import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

const API_TARGET = "http://127.0.0.1:8000";

const httpsOptions = {
  key: fs.readFileSync(path.resolve(__dirname, "./certs/dev-key.pem")),
  cert: fs.readFileSync(path.resolve(__dirname, "./certs/dev-cert.pem")),
};

export default defineConfig(({ mode }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
    https: httpsOptions,

    proxy: {
      "/documents/extract-id": {
        target: API_TARGET,
        changeOrigin: true,
      },
      "^/documents/[^/]+/extract-fields$": {
        target: API_TARGET,
        changeOrigin: true,
      },
      "/documents/extract-employment-proof": {
        target: API_TARGET,
        changeOrigin: true,
      },
      "^/documents/[^/]+/extract-employment-fields$": {
        target: API_TARGET,
        changeOrigin: true,
      },
      "^/documents/[^/]+/generate-form$": {
        target: API_TARGET,
        changeOrigin: true,
      },
      "^/documents/[^/]+/pdf$": {
        target: API_TARGET,
        changeOrigin: true,
      },
      "/accounts/open-new": {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },

  plugins: [
    react(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));