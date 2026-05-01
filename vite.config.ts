import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { visualizer } from "rollup-plugin-visualizer";
import type { PluginOption } from "vite";

// https://vite.dev/config/
export default defineConfig(() => {
  // Bundle visualization is opt-in via `ANALYZE=1 vite build`
  // (or `npm run build:analyze`). Gating it keeps normal `npm run build`
  // and `npm run dev` free of the extra rollup work / dist artifact.
  const analyze = process.env.ANALYZE === "1";

  const plugins: PluginOption[] = [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,svg,woff2}"],
      },
      manifest: {
        name: "Party Planner",
        short_name: "Party",
        description: "Plan parties together — food, drinks, music, and more.",
        theme_color: "#cc38f5",
        background_color: "#f8fafc",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        scope: "/",
        icons: [
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
    plugins,
  };
});
