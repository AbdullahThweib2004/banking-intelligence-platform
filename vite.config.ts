import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const API_TARGET = "http://127.0.0.1:8000";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    strictPort: true,
    // Proxy ONLY backend API paths — never the SPA route GET /documents.
    proxy: {
      "/documents/extract-id": {
        target: API_TARGET,
        changeOrigin: true,
      },
      "^/documents/[^/]+/extract-fields$": {
        target: API_TARGET,
        changeOrigin: true,
      },
      "^/documents/[^/]+/generate-form$": {
        target: API_TARGET,
        changeOrigin: true,
      },
      "/accounts/open-new": {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
