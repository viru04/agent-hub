import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// DEFAULT_REGISTRY: replace YOUR-USER after enabling GitHub Pages, or set AGENTHUB_REGISTRY.
export const DEFAULT_REGISTRY = "https://YOUR-USER.github.io/agenthub";

async function read(base, rel) {
  if (/^https?:\/\//i.test(base)) {
    const url = base.replace(/\/?$/, "/") + rel.split("/").map(encodeURIComponent).join("/");
    let res;
    try { res = await fetch(url); } catch (e) { throw new Error(`cannot reach ${url} (${e.message})`); }
    if (!res.ok) throw new Error(`${res.status} for ${url}`);
    return Buffer.from(await res.arrayBuffer());
  }
  const root = base.startsWith("file:") ? fileURLToPath(base) : path.resolve(base);
  return fs.readFileSync(path.join(root, ...rel.split("/")));
}

export function openRegistry(url) {
  const json = async (rel) => JSON.parse((await read(url, rel)).toString("utf8"));
  return { url, json, fetchSource: (index, file) => read(index.source.rawBase, file.path) };
}
