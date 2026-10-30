import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
// Relative import: the config is bundled by Vite before workspace packages are built.
import { PRODUCT_NAME } from "../../packages/shared/src/brand.ts";

function productName(): Plugin {
  return {
    name: "product-name",
    transformIndexHtml: (html) => html.replaceAll("%PRODUCT_NAME%", PRODUCT_NAME),
  };
}

export default defineConfig({
  plugins: [react(), productName()],
  resolve: {
    // Consume workspace packages from source (see "source" in their exports).
    conditions: ["source"],
  },
  server: {
    // Matches APP_ORIGIN=http://localhost:5173 when the API runs next to the Vite dev server.
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:3000",
      "/embed": "http://localhost:3000",
    },
  },
});
