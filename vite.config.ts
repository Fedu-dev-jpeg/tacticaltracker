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
  // @deademx/cs2 + @deademx/engine ship browser code that uses Vite's own
  // `?worker&inline` syntax. Pre-bundling with esbuild fails on that (esbuild
  // doesn't know the Vite worker suffix), so we skip the optimizer entirely
  // and let Vite serve those modules through its dev pipeline. `seek-bzip`
  // is CJS and must be prebundled; listing it in `include` ensures the
  // optimizer produces the bundle even though it's only referenced from a
  // Web Worker (Vite's dep discovery scans main-thread entries only).
  optimizeDeps: {
    include: ["seek-bzip"],
    exclude: ["@deademx/cs2", "@deademx/engine"],
  },
  worker: {
    format: "es",
  },
}));
