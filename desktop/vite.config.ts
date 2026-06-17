import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
import renderer from "vite-plugin-electron-renderer";
import path from "path";
import { copyFileSync, mkdirSync } from "fs";

function copyPreloadCjs(): void {
  const outDir = path.resolve(__dirname, "dist-electron");
  mkdirSync(outDir, { recursive: true });
  copyFileSync(
    path.resolve(__dirname, "electron/preload.cjs"),
    path.join(outDir, "preload.cjs"),
  );
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: "copy-preload-cjs",
      buildStart() {
        copyPreloadCjs();
      },
      closeBundle() {
        copyPreloadCjs();
      },
    },
    electron([
      {
        entry: "electron/main.ts",
        vite: { build: { outDir: "dist-electron", rollupOptions: { external: ["electron"] } } },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@core": path.resolve(__dirname, "../core/src"),
    },
  },
  // Prevent renderer from pre-bundling Node built-ins (causes white screen if @core pulls fs).
  optimizeDeps: {
    exclude: ["fs", "path", "child_process"],
  },
});
