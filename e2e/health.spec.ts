import { expect, test } from "./test-fixture";

/**
 * `/healthz` is a static file (`public/healthz`) consumed by external uptime
 * monitors and by `.github/workflows/smoke.yml`. It must always return 200 and
 * the literal body "ok".
 *
 * The two regressions this catches before deploy:
 *   1. The Vercel SPA rewrite (`/(.*)" → /index.html`) accidentally swallows
 *      the path and serves the SPA shell instead — uptime checks that grep for
 *      "ok" would silently miss this because /index.html is also 200.
 *   2. The `public/healthz` file isn't copied into `dist/` (typo, .gitignore
 *      regression, etc.), so Vite preview / Vercel return 404.
 *
 * Header assertions (Cache-Control: no-store, Content-Type: text/plain) are
 * Vercel-only — `vite preview` serves the static file with default headers, so
 * those live in `vercel.json` and the post-deploy Smoke workflow.
 */
test.describe("Health endpoint", () => {
  test("/healthz returns 200 ok", async ({ request }) => {
    const res = await request.get("/healthz");
    expect(res.status()).toBe(200);
    const body = (await res.text()).trim();
    expect(body).toBe("ok");
  });

  test("/robots.txt disallows the unsubscribe surface", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();
    // Crawl rules surface in plain text — assert the most sensitive surfaces
    // ship a Disallow so a future edit cannot silently expose token URLs to
    // crawlers / archive.org.
    expect(body).toMatch(/^Disallow:\s+\/email\/unsubscribe\b/m);
    expect(body).toMatch(/^Disallow:\s+\/settings\b/m);
    expect(body).toMatch(/^Disallow:\s+\/update-password\b/m);
  });
});
