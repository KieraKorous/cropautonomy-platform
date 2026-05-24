import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      strategies: "generateSW",
      includeAssets: ["favicon.svg", "robots.txt"],
      manifest: {
        name: "CropAutonomy Field",
        short_name: "CA Field",
        description: "Field Capture for CropAutonomy operators.",
        theme_color: "#0c1f17",
        background_color: "#fafaf8",
        display: "standalone",
        orientation: "portrait",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin.endsWith(".supabase.co"),
            handler: "NetworkOnly",
            // Storage uploads must always hit the network; never cache them.
            options: { backgroundSync: { name: "supabase-storage-queue" } as never }
          }
        ],
        // Allow Background Sync registrations from our IndexedDB queue worker.
        skipWaiting: true,
        clientsClaim: true
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  server: {
    host: "field.lvh.me",
    port: 5173
  },
  preview: {
    host: "field.lvh.me",
    port: 5173
  }
});
