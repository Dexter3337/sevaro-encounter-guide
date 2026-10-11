#!/usr/bin/env node
// Bundle each serverless function in functions-src/ into one self-contained
// file in netlify/functions/. Netlify's own packager does not follow pnpm's
// linked node_modules, so dependencies are inlined here instead.
//
//   pnpm build:functions
import { build } from "esbuild";
import { readdirSync } from "node:fs";

const entryPoints = readdirSync("functions-src")
  .filter((f) => /\.m?ts$/.test(f))
  .map((f) => `functions-src/${f}`);

await build({
  entryPoints,
  outdir: "netlify/functions",
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // Some inlined dependencies are CommonJS and call require().
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: "info",
});
