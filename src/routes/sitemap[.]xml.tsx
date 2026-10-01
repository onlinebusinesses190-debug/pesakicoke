import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sitemap.xml")({
  headers: {
    "Content-Type": "application/xml; charset=utf-8",
  },
  component: SitemapPage,
});

const BASE_URL = "https://pesaki.co.ke";

// Member-only routes (/kazi, /business, /banking, /wallet, /profile) are
// login-walled and intentionally excluded so crawlers are not sent to sign up.
const PAGES = [
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

function SitemapPage() {
  const today = new Date().toISOString().slice(0, 10);
  const urls = PAGES.map((p) => {
    const loc = `${BASE_URL}${p.path}`;
    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority.toFixed(1)}</priority>
  </url>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

  return <pre style={{ fontFamily: "monospace", whiteSpace: "pre-wrap" }}>{xml}</pre>;
}
