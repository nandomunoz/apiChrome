import { defineConfig } from "astro/config";

// Served from https://nandomunoz.github.io/apiChrome/ on GitHub Pages
export default defineConfig({
  site: "https://nandomunoz.github.io",
  base: "/apiChrome",
  output: "static",
  trailingSlash: "always",
});
