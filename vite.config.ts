import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: Number(process.env.TROVE_WEB_PORT ?? 5173),
    strictPort: true,
    proxy: { "/api": `http://127.0.0.1:${process.env.PORT ?? 3001}` },
  },
});
