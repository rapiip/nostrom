import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";

/**
 * Rewrites the Open Graph / Twitter image tags to absolute URLs.
 *
 * Social scrapers (X, Facebook, LinkedIn, WhatsApp, Discord) do not resolve
 * relative image paths — a link preview silently renders without its image. The
 * canonical origin is only known at build time, so it comes from VITE_SITE_URL
 * (e.g. https://nostrom.xyz). When unset the relative paths are left as-is, so a
 * preview deploy is still valid HTML; it just has no social image.
 */
function absoluteSocialUrls() {
  const raw = process.env.VITE_SITE_URL?.trim();
  const origin = raw?.replace(/\/+$/, "");

  return {
    name: "absolute-social-urls",
    transformIndexHtml(html: string) {
      if (!origin) return html;
      return html
        .replace(
          /(<meta\s+(?:property|name)="(?:og:image|twitter:image)"\s+content=")\/([^"]*)"/g,
          `$1${origin}/$2"`,
        )
        .replace(
          /<meta property="og:type"/,
          `<link rel="canonical" href="${origin}/" />\n    <meta property="og:url" content="${origin}/" />\n    <meta property="og:type"`,
        );
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), absoluteSocialUrls()],
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
