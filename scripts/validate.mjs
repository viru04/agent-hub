// Validates the curation overlay only (fast, offline).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCuration } from "../lib/ingest.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = process.env.AGENTHUB_CURATION ? path.resolve(process.env.AGENTHUB_CURATION) : path.join(root, "curation");
const cur = loadCuration(dir);
if (cur.errors.length) { console.error("Curation invalid:\n" + cur.errors.map((e) => "  - " + e).join("\n")); process.exit(1); }
console.log(`OK: ${cur.packs.length} packs, ${Object.keys(cur.roles).length} role rules, ${cur.verified.size} verified, ${cur.blocklist.size} blocklisted`);
