/**
 * Compiles src/lib engine sources against the in-memory Firebase stub,
 * then runs a test file from this directory.
 *
 *   node test/sim/run.mjs rules.mjs
 *   node test/sim/run.mjs sim.cjs 300
 */

import * as esbuild from "esbuild";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Module from "node:module";
import { existsSync, mkdirSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");
const outdir = join(__dirname, "lib");
const stubFs = join(__dirname, "stubs/firestore.cjs");
const stubApp = join(__dirname, "stubs/firebase-local.cjs");

mkdirSync(outdir, { recursive: true });

const target = process.argv[2] || "rules.mjs";
const extraArgs = process.argv.slice(3);

await esbuild.build({
  entryPoints: [
    join(root, "src/lib/rules.ts"),
    join(root, "src/lib/arabic.ts"),
    join(root, "src/lib/words.ts"),
  ],
  outdir,
  outExtension: { ".js": ".cjs" },
  format: "cjs",
  platform: "node",
  target: "node18",
  logLevel: "silent",
});

await esbuild.build({
  entryPoints: [join(root, "src/lib/engine.ts")],
  outfile: join(outdir, "engine.cjs"),
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node18",
  logLevel: "silent",
  plugins: [
    {
      name: "firebase-stubs",
      setup(build) {
        build.onResolve({ filter: /^firebase\/firestore$/ }, () => ({
          path: stubFs,
          external: true,
        }));
        build.onResolve({ filter: /^\.\/firebase$/ }, () => ({
          path: stubApp,
          external: true,
        }));
      },
    },
  ],
});

// Point bare `firebase/firestore` imports from the test files at the stub.
const require = createRequire(import.meta.url);
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === "firebase/firestore") return stubFs;
  // Node 24 + absolute paths under our resolve hook can fail; short-circuit.
  if (typeof request === "string" && existsSync(request)) return request;
  return origResolve.call(this, request, parent, isMain, options);
};

process.argv = [process.argv[0], join(__dirname, target), ...extraArgs];

const file = join(__dirname, target);
if (target.endsWith(".mjs")) {
  await import(pathToFileURL(file).href);
} else {
  require(file);
}
