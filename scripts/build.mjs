// Ingests upstream (awesome-copilot) + curation overlay -> dist/ (index.json, config.json, web UI).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as buildWeb } from "vite";
import { loadCuration, parseSource, acquire, buildIndex } from "../lib/ingest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const strict = args.includes("--strict");
const out = process.env.AGENTHUB_OUT ? path.resolve(process.env.AGENTHUB_OUT) : path.join(root, "dist");
const curDir = process.env.AGENTHUB_CURATION ? path.resolve(process.env.AGENTHUB_CURATION) : path.join(root, "curation");

const cur = loadCuration(curDir);
if (cur.errors.length) { console.error("Curation invalid:\n" + cur.errors.map((e) => "  - " + e).join("\n")); process.exit(1); }
const spec = opt("--source") || process.env.AGENTHUB_SOURCE;
const src = spec ? parseSource(spec) : { type: "github", repo: cur.upstream.source.repo, ref: cur.upstream.source.ref };
const up = await acquire(src);
try {
  const { index, warnings } = buildIndex(up.dir, up.meta, cur);
  warnings.forEach((w) => console.warn("warning: " + w));
  if (strict && warnings.length) { console.error(`${warnings.length} warning(s) in --strict mode`); process.exit(1); }
  fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, "index.json"), JSON.stringify(index));
  fs.writeFileSync(path.join(out, "config.json"), JSON.stringify({ schema: 1, paths: cur.paths }, null, 2));
  fs.writeFileSync(path.join(out, ".nojekyll"), "");
  await buildWeb({
    configFile: path.join(root, "web", "vite.config.js"),
    root: path.join(root, "web"),
    base: "./",
    build: { outDir: out, emptyOutDir: false },
  });
  const flagged = index.assets.filter((a) => a.tier === "flagged").length;
  console.log(`Built ${index.assets.length} assets (${JSON.stringify(index.stats)}), ${index.bundles.length} bundles, ${flagged} flagged`);
  console.log(`Source: ${up.meta.repo}@${up.meta.sha.slice(0, 10)} -> ${out}`);
} finally { up.cleanup(); }
