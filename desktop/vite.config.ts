import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron";
import { esmShim } from "vite-plugin-electron/plugin";
import renderer from "vite-plugin-electron-renderer";
import path from "path";
import { copyFileSync, mkdirSync } from "fs";

function copyElectronAssets(): void {
  const outDir = path.resolve(__dirname, "dist-electron");
  mkdirSync(outDir, { recursive: true });
  for (const file of ["preload.cjs", "steam-sub.cjs"]) {
    copyFileSync(
      path.resolve(__dirname, `electron/${file}`),
      path.join(outDir, file),
    );
  }
  const steamDll = path.resolve(__dirname, "steamworks/dist/win64/steam_api64.dll");
  try {
    copyFileSync(steamDll, path.join(outDir, "steam_api64.dll"));
  } catch {
    // optional in dev if steamworks not present
  }
}

const electronBuild = {
  outDir: "dist-electron",
  rolldownOptions: { external: ["electron"] },
};

export default defineConfig({
  plugins: [
    react(),
    {
      name: "copy-electron-assets",
      buildStart() {
        copyElectronAssets();
      },
      closeBundle() {
        copyElectronAssets();
      },
    },
    electron([
      {
        entry: "electron/main.ts",
        vite: { plugins: [esmShim()], build: electronBuild },
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
