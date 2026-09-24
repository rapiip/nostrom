import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        // Vite 8 / rolldown: manualChunks is function-only. The wallet + RPC
        // layer is large and stable, so it is split out to keep the landing
        // page's first paint independent of it. Route-level code splitting is
        // handled by React.lazy in App.tsx.
        manualChunks(id) {
          if (/node_modules[\\/](wagmi|viem|@tanstack|@wagmi|ox|abitype)/.test(id)) {
            return "web3";
          }
          return undefined;
        },
      },
    },
  },
});
