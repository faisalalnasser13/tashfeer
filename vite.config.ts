import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import pkg from "./package.json";

/** Unique per build so stale tabs can detect a new deploy. */
const BUILD_ID = `${pkg.version}+${Date.now().toString(36)}`;

function versionPlugin(): Plugin {
  return {
    name: "tashfeer-version",
    config() {
      return {
        define: {
          __APP_VERSION__: JSON.stringify(BUILD_ID),
        },
      };
    },
    writeBundle(output) {
      const dir = output.dir ?? resolve("dist");
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        resolve(dir, "version.json"),
        JSON.stringify({ version: BUILD_ID })
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), versionPlugin()],
  server: { host: true },
});
