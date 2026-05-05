import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";
import type { PluginOption } from "vite";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// https://vite.dev/config/

/** RFC 9116 — `public/.well-known/security.txt` is dev fallback; production overwrites in `dist/` from env. */
function securityTxtBuild(): PluginOption {
  return {
    name: "security-txt-build",
      closeBundle() {
      const contact =
        process.env.VITE_SECURITY_CONTACT?.trim() ||
        process.env.SECURITY_CONTACT?.trim() ||
        "mailto:security@example.com";
      if (
        process.env.NODE_ENV === "production" &&
        /@example\.com|security@example/i.test(contact)
      ) {
        console.warn(
          "[security-txt-build] VITE_SECURITY_CONTACT still looks like a placeholder — set a real address in Vercel / CI before shipping.",
        );
      }
      const dir = path.resolve("dist", ".well-known");
      const body = [
        `Contact: ${contact}`,
        "Expires: 2028-12-31T23:59:59.000Z",
        "Preferred-Languages: en",
        "",
        "Acknowledgments: We appreciate responsible disclosure. Include steps to reproduce; do not access other users' data.",
      ].join("\n");
      try {
        mkdirSync(dir, { recursive: true });
        writeFileSync(path.join(dir, "security.txt"), body, "utf8");
      } catch (e) {
        console.warn("[security-txt-build]", e);
      }
    },
  };
}

function supabasePreconnect(): PluginOption {
  return {
    name: "supabase-preconnect",
    transformIndexHtml(html) {
      const raw = process.env.VITE_SUPABASE_URL?.trim();
      if (!raw) return html;
      try {
        const origin = new URL(raw).origin;
        const inject = `    <link rel="preconnect" href="${origin}" crossorigin />\n    <link rel="dns-prefetch" href="${origin}" />\n`;
        return html.replace("<head>", `<head>\n${inject}`);
      } catch {
        return html;
      }
    },
  };
}

function readPkgVersion(): string {
  try {
    const path = fileURLToPath(new URL("./package.json", import.meta.url));
    const pkg = JSON.parse(readFileSync(path, "utf-8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export default defineConfig(() => {
  const pkgVersion = readPkgVersion();
  const appRelease =
    process.env.VITE_APP_RELEASE?.trim() ||
    process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
    process.env.GITHUB_SHA?.trim() ||
    `party-planner@${pkgVersion}`;

  // Bundle visualization is opt-in via `ANALYZE=1 vite build`
  // (or `npm run build:analyze`). Gating it keeps normal `npm run build`
  // and `npm run dev` free of the extra rollup work / dist artifact.
  const analyze = process.env.ANALYZE === "1";

  const plugins: PluginOption[] = [
    react(),
    supabasePreconnect(),
    securityTxtBuild(),
    VitePWA({
      // NOTE: vite-plugin-pwa@1.2.0 still passes the deprecated
      // `inlineDynamicImports` option to Vite 8 when bundling the SW,
      // which prints a "use codeSplitting: false instead" warning.
      // The option isn't part of the plugin's public surface, so the
      // fix has to land upstream — we live with the warning until the
      // next plugin release.
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,svg,png,woff2}"],
      },
      manifest: {
        name: "Party Planner",
        short_name: "Party",
        description: "Plan parties together — food, drinks, music, and more.",
        theme_color: "#6366f1",
        background_color: "#f8fafc",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/party.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
    }),
  ];

  if (analyze) {
    plugins.push(
      visualizer({
        filename: "dist/stats.html",
        template: "treemap",
        gzipSize: true,
        brotliSize: true,
      }) as PluginOption,
    );
  }

  return {
    define: {
      "import.meta.env.VITE_APP_RELEASE": JSON.stringify(appRelease),
    },
    plugins,
  };
});
