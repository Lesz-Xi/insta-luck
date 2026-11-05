import { resolve } from "node:path";
import { defineConfig } from "vite";

const webRoot = resolve(import.meta.dirname, "web");

export default defineConfig({
  root: webRoot,
  appType: "mpa",
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        index: resolve(webRoot, "index.html"),
        app: resolve(webRoot, "app.html")
      }
    }
  }
});
