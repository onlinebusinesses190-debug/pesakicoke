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
        workbox: {
          globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
          globDirectory: resolve(process.cwd(), ".output/public"),
          navigateFallback: "/",
          navigateFallbackDenylist: [
            /^\/api\//,
            /^\/functions\//,
            /^\/admin\//,
          ],
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
