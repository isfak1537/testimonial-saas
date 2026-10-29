import { defineConfig } from "vite";

// Builds a single self-executing script served by the API at /embed/widget.v1.js.
// The IIFE has no exports, so it adds no globals to host pages.
export default defineConfig({
  build: {
    target: "es2020",
    lib: {
      entry: "src/index.ts",
      formats: ["iife"],
      name: "TestimonialSaaSWidget",
      fileName: () => "widget.v1.js",
    },
    emptyOutDir: true,
  },
});
