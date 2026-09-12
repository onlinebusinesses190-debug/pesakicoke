// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  vite: {
    build: {
      outDir: ".output/public",
      ssrOutDir: ".output/server",
    },
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        srcDir: ".output/public",
        filename: "sw.js",
        includeAssets: [
          "favicon.ico",
          "icons/icon-192.png",
          "icons/icon-512.png",
          "icons/favicon-32.png",
          "icons/apple-touch-icon-180.png"
        ],
        manifest: {
          name: "PESAKI",
          short_name: "PESAKI",
          description: "PESAKI -- a digital financial technology platform providing accessible tools for financial management, investment, business, and digital opportunities.",
          start_url: "/",
          scope: "/",
          display: "standalone",
          orientation: "portrait",
          theme_color: "#0a2e1a",
          background_color: "#0a2e1a",
          icons: [
            {
              src: "/icons/icon-192.png",
              sizes: "192x192",
              type: "image/png"
            },
            {
              src: "/icons/icon-512.png",
              sizes: "512x512",
              type: "image/png"
            },
            {
              src: "/icons/icon-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable"
            }
          ]
        }
      }),
    ],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
