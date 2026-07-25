import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    // Pre-bundle dependencies that no route on the entry path imports.
    //
    // `recharts` is reachable only from `/zones/:zoneId` and the incident
    // drawer. Landing *directly* on one of those URLs is therefore the first
    // time Vite sees it, so it stops to re-optimize and forces a full reload —
    // which presents as a blank page that "works after a refresh". Declaring
    // it here bundles it when the dev server boots instead of mid-navigation.
    //
    // `react-day-picker` and `date-fns` reach the browser the same way, via the
    // date filters on `/incidents`.
    include: ["recharts", "react-day-picker", "date-fns"],
  },
  server: {
    port: 5173,
    // Same-origin in development: the API and the socket are proxied to the
    // backend on :4000, so there is no CORS friction while developing. CORS is
    // still configured and tested on the backend for a deployed split origin.
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: true },
      "/socket.io": { target: "http://localhost:4000", ws: true },
    },
  },
})
