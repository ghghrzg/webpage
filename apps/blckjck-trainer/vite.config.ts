import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  base: "/contents/blckjck_trainer/",
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "icon.svg",
        "icon-192.png",
        "icon-512.png",
        "apple-touch-icon.png",
      ],
      manifest: {
        name: "European Blackjack Trainer",
        short_name: "Blackjack",
        description:
          "Basic Strategy lernen. Wiesbaden Rules · ENHC · S17 · 6 Decks.",
        lang: "de",
        theme_color: "#101916",
        background_color: "#101916",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,webmanifest}"],
        navigateFallback: "index.html",
      },
    }),
  ],
  build: {
    outDir: fileURLToPath(
      new URL("../../contents/blckjck_trainer", import.meta.url),
    ),
    emptyOutDir: true,
  },
  test: { include: ["src/**/*.test.ts"] },
});
