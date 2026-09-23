import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";

/**
 * pdf.js needs its worker as a separate script. Serving it from a stable path with a
 * `.js` extension works everywhere (browsers, and the Capacitor web view, which does
 * not know the `.mjs` MIME type).
 */
function pdfWorkerPlugin(): Plugin {
  const src = path.resolve(__dirname, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs");
  return {
    name: "deiza-pdf-worker",
    configureServer(server) {
      server.middlewares.use("/pdf.worker.min.js", (_req, res) => {
        res.setHeader("Content-Type", "text/javascript");
        fs.createReadStream(src).pipe(res);
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "pdf.worker.min.js", source: fs.readFileSync(src) });
    },
  };
}

// https://vitejs.dev/config/
const devBackend = process.env.DEIZA_DEV_BACKEND || 'http://127.0.0.1:5000';

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    // Local dev only: /api and /auth go to the backend in DEIZA_DEV_BACKEND
    // (default: Flask on 127.0.0.1:5000). The vite dev server is never deployed.
    proxy: {
      '/api': { target: devBackend, changeOrigin: true, secure: devBackend.startsWith('https') },
      '/auth': { target: devBackend, changeOrigin: true, secure: devBackend.startsWith('https') },
    },
  },
  plugins: [
    react(),
    pdfWorkerPlugin(),
    // PWA/Service Worker deliberately disabled — precaching every asset exhausted
    // browser memory on low-end phones. version.json handles cache busting instead.
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 700,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-ui": ["framer-motion", "sonner", "@radix-ui/react-dialog", "@radix-ui/react-tooltip"],
          "vendor-markdown": ["react-markdown", "remark-gfm"],
          "vendor-math": ["remark-math", "rehype-katex", "katex"],
          "vendor-highlight": ["react-syntax-highlighter"],
          "vendor-panels": ["react-resizable-panels"],
        },
      },
    },
    minify: 'esbuild',
    target: 'es2020',
  },
}));
