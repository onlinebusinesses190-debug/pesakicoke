// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "node:path";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  nitro: {
    preset: "vercel",
  },
  vite: {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        publicDir: resolve(process.cwd(), ".output/public"),
        manifest: {
          name: "PESAKI — Work, Business & Financial Services",
          short_name: "PESAKI",
          description:
            "PESAKI brings together your wallet, jobs, business funding and banking in one powerful mobile app.",
          start_url: "/",
          scope: "/",
          display: "standalone",
          orientation: "portrait",
          background_color: "#0a2e1a",
          theme_color: "#0a2e1a",
          lang: "en-KE",
          categories: ["finance", "business", "productivity"],
          icons: [
            { src: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            {
              src: "/icons/icon-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          globDirectory: resolve(process.cwd(), ".output/public"),
          navigateFallback: "/",
          navigateFallbackDenylist: [/^\/api\//, /^\/functions\//, /^\/admin\//],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
  },
});
