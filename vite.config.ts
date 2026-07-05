import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    // Proxy only account-opening API calls — NOT the SPA route GET /documents.
    proxy: {
      "/documents/extract-id": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/documents": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        bypass(req) {
          const url = req.url ?? "";
          // Browser navigation to the Documents page — serve the React app.
          if (url === "/documents" || url.startsWith("/documents?")) {
            return url;
          }
          // POST /documents/{id}/extract-fields — proxy to FastAPI.
          if (/^\/documents\/[^/]+\/extract-fields/.test(url)) {
            return null;
          }
          // Any other /documents/* path is frontend — do not proxy.
          return url;
        },
      },
      "/accounts/open-new": {
        target: "http://127.0.0.1:8000",
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
