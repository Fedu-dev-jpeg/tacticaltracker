import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    mcpPlugin(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  // The demo parser worker imports @deademx/cs2 + seek-bzip. Vite's dep
  // optimizer scans main-thread entry points only, so worker-only imports
  // must be listed explicitly or the worker gets a 504 on the prebundle.
  optimizeDeps: {
    include: ["@deademx/cs2", "@deademx/engine", "seek-bzip"],
  },
  worker: {
    format: "es",
  },
}));
