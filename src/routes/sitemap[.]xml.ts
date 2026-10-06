import { createFileRoute } from "@tanstack/react-router";

const BASE_URL = "https://pesaki.co.ke";

// Static pages (non-KAZI)
const STATIC_PAGES = [
  { path: "/", priority: 1.0, changefreq: "daily" },
  { path: "/about", priority: 0.7, changefreq: "monthly" },
  { path: "/business-funding", priority: 0.7, changefreq: "monthly" },
  { path: "/compliance", priority: 0.6, changefreq: "monthly" },
  { path: "/security", priority: 0.6, changefreq: "monthly" },
  { path: "/contact", priority: 0.6, changefreq: "monthly" },
  { path: "/privacy", priority: 0.3, changefreq: "yearly" },
  { path: "/terms", priority: 0.3, changefreq: "yearly" },
  { path: "/refund", priority: 0.3, changefreq: "yearly" },
  { path: "/cookies", priority: 0.3, changefreq: "yearly" },
  { path: "/auth", priority: 0.4, changefreq: "monthly" },
];

function buildStaticSitemap(): string {
  const today = new Date().toISOString().slice(0, 10);
  const urls = STATIC_PAGES.map(
    (p) => `  <url>
    <loc>${BASE_URL}${p.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority.toFixed(1)}</priority>
  </url>`,
  ).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        // Fetch dynamic KAZI profiles from backend
        let kaziUrls = "";
        try {
          const res = await fetch("https://pesaki-server.onrender.com/kazi/sitemap");
          if (res.ok) {
            const xml = await res.text();
            // Extract <url> entries from backend response and merge
            const urlMatches = xml.match(/<url>[\s\S]*?<\/url>/g);
            if (urlMatches) kaziUrls = urlMatches.join("\n");
          }
        } catch {
          // Silently fall back to static only
        }

        const today = new Date().toISOString().slice(0, 10);
        const staticUrls = STATIC_PAGES.map(
          (p) => `  <url>
    <loc>${BASE_URL}${p.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority.toFixed(1)}</priority>
  </url>`,
        ).join("\n");

        const allUrls = kaziUrls ? `${kaziUrls}\n${staticUrls}` : staticUrls;

        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allUrls}
</urlset>`,
          {
            headers: {
              "Content-Type": "application/xml; charset=utf-8",
              "Cache-Control": "public, max-age=3600",
            },
          }
        );
      },
    },
  },
});