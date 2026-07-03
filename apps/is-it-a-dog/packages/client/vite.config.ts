import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 33100,
    // Proxy the room WebSocket to the game-server Worker (wrangler dev) so dev is same-origin,
    // matching prod (one Worker serves the SPA + /rooms/:id/ws).
    proxy: {
      "/rooms": { target: "http://localhost:33300", changeOrigin: true, ws: true },
    },
  },
});
