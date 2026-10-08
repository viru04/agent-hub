// Turns an upstream awesome-copilot checkout into agentHub's index.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import YAML from "yaml";
import * as tar from "tar";
import { Upstream, Pack, Roles, Paths } from "./schema.mjs";
import { frontmatter } from "./frontmatter.mjs";
import { scanText, capsFromTools } from "./scan.mjs";

const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const slash = (p) => p.split(path.sep).join("/");
const titleCase = (s) => s.replace(/[-_.]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const MAX_FILE = 5_000_000;

export function loadCuration(dir) {
  const errors = [], rd = (f) => YAML.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const out = { errors, packs: [], verified: new Set(), blocklist: new Set() };
  const parse = (schema, data, where) => { const r = schema.safeParse(data); if (!r.success) { r.error.issues.forEach((i) => errors.push(`${where}: ${i.path.join(".")} ${i.message}`)); return null; } return r.data; };
  out.upstream = parse(Upstream, rd("upstream.yaml"), "upstream.yaml");
  out.paths = parse(Paths, rd("paths.yaml"), "paths.yaml");
  out.roles = parse(Roles, rd("roles.yaml"), "roles.yaml") || {};
  const pdir = path.join(dir, "packs");
  if (fs.existsSync(pdir)) for (const f of fs.readdirSync(pdir).filter((x) => x.endsWith(".yaml"))) {
    const p = parse(Pack, rd(path.join("packs", f)), `packs/${f}`); if (p) out.packs.push(p);
  }
  const rj = (f) => (fs.existsSync(path.join(dir, f)) ? JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) : []);
  out.verified = new Set(rj("verified.json")); out.blocklist = new Set(rj("blocklist.json"));
  return out;
}

export function parseSource(s) {
  if (s.startsWith("github:")) { const [repo, ref = "main"] = s.slice(7).split("@"); return { type: "github", repo, ref }; }
  return { type: "dir", dir: path.resolve(s.replace(/^dir:/, "")) };
}

function resolveSha(repo, ref) {
  if (/^[0-9a-f]{40}$/.test(ref)) return ref;
  try {
    const out = execFileSync("git", ["ls-remote", `https://github.com/${repo}.git`, ref, `refs/heads/${ref}`, `refs/tags/${ref}`], { encoding: "utf8" });
    const line = out.split("\n").find((l) => l.trim());
    if (line) return line.split(/\s+/)[0];
  } catch { /* fall through to API */ }
  throw new Error(`cannot resolve ${repo}@${ref} to a commit SHA (is git installed and github.com reachable?)`);
}

export async function acquire(src) {
  if (src.type === "dir") return { dir: src.dir, meta: { type: "dir", repo: src.dir, ref: "local", sha: "local", rawBase: pathToFileURL(src.dir).href.replace(/\/?$/, "/") }, cleanup() {} };
  const sha = resolveSha(src.repo, src.ref);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agenthub-src-"));
  const res = await fetch(`https://codeload.github.com/${src.repo}/tar.gz/${sha}`);
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  const file = path.join(tmp, "src.tgz");
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(file));
  const dir = path.join(tmp, "src"); fs.mkdirSync(dir);
  await tar.x({ file, cwd: dir, strip: 1, filter: (p) => /^[^/]+\/(agents|instructions|skills|hooks|plugins)(\/|$)/.test(p) });
  return { dir, meta: { type: "github", repo: src.repo, ref: src.ref, sha, rawBase: `https://raw.githubusercontent.com/${src.repo}/${sha}/` }, cleanup() { fs.rmSync(tmp, { recursive: true, force: true }); } };
}

function walk(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, base)); else if (e.isFile()) out.push(slash(path.relative(base, p)));
  }
  return out.sort();
}
const ls = (d) => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }) : []);

export function buildIndex(root, meta, cur) {
  const warnings = [], assets = [];
  const mkFiles = (assetDir, relFiles, prefix) => {
    const files = [], flags = new Set();
    for (const rel of relFiles) {
      const buf = fs.readFileSync(path.join(assetDir, rel));
      if (buf.length > MAX_FILE) { warnings.push(`${prefix}/${rel}: skipped (over ${MAX_FILE} bytes)`); continue; }
      scanText(rel, buf).forEach((f) => flags.add(f));
      files.push({ path: slash(path.join(prefix, rel)), rel, sha256: sha256(buf), size: buf.length });
    }
    return { files, flags: [...flags].sort() };
  };
  const add = (type, name, fm, ok, extra) => {
    const id = `${type}/${name}`;
    if (cur.blocklist.has(id)) { warnings.push(`${id}: blocklisted, excluded`); return; }
    if (!ok) warnings.push(`${id}: frontmatter is not valid YAML (metadata may be incomplete)`);
    const { files, flags } = extra.built;
    if (!files.length) { warnings.push(`${id}: no files, skipped`); return; }
    const description = String(fm.description || "No description available").replace(/\s+/g, " ").trim();
    const title = String(fm.name || titleCase(name)).trim();
    const rev = sha256(files.map((f) => `${f.rel}:${f.sha256}`).join("\n")).slice(0, 10);
    const caps = new Set(extra.caps || []);
    assets.push({ id, type, name, title, description, rev, roles: [], tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
      capabilities: [...caps].sort(), flags, tier: flags.length ? "flagged" : cur.verified.has(id) ? "verified" : "community",
      applyTo: fm.applyTo ? String(fm.applyTo) : undefined, files });
  };
  for (const e of ls(path.join(root, "agents")).filter((e) => e.isFile() && e.name.endsWith(".agent.md"))) {
    const name = e.name.replace(/\.agent\.md$/, ""), built = mkFiles(path.join(root, "agents"), [e.name], "agents");
    built.files.forEach((f) => (f.rel = e.name));
    const { data, ok } = frontmatter(fs.readFileSync(path.join(root, "agents", e.name), "utf8"));
    add("agent", name, data, ok, { built, caps: capsFromTools(data.tools, data) });
  }
  for (const e of ls(path.join(root, "instructions")).filter((e) => e.isFile() && e.name.endsWith(".instructions.md"))) {
    const name = e.name.replace(/\.instructions\.md$/, ""), built = mkFiles(path.join(root, "instructions"), [e.name], "instructions");
    const { data, ok } = frontmatter(fs.readFileSync(path.join(root, "instructions", e.name), "utf8"));
    add("instruction", name, data, ok, { built });
  }
  for (const e of ls(path.join(root, "skills")).filter((e) => e.isDirectory())) {
    const dir = path.join(root, "skills", e.name);
    if (!fs.existsSync(path.join(dir, "SKILL.md"))) { warnings.push(`skill/${e.name}: no SKILL.md, skipped`); continue; }
    const rels = walk(dir), built = mkFiles(dir, rels, `skills/${e.name}`);
    const { data, ok } = frontmatter(fs.readFileSync(path.join(dir, "SKILL.md"), "utf8"));
    const caps = rels.some((r) => /^scripts\//.test(r) || /\.(sh|ps1|py)$/.test(r)) ? ["shell"] : [];
    add("skill", e.name, data, ok, { built, caps });
  }
  for (const e of ls(path.join(root, "hooks")).filter((e) => e.isDirectory())) {
    const dir = path.join(root, "hooks", e.name);
    if (!fs.existsSync(path.join(dir, "hooks.json"))) { warnings.push(`hook/${e.name}: no hooks.json, skipped`); continue; }
    const built = mkFiles(dir, walk(dir), `hooks/${e.name}`);
    const readme = path.join(dir, "README.md");
    const { data, ok } = fs.existsSync(readme) ? frontmatter(fs.readFileSync(readme, "utf8")) : { data: {}, ok: true };
    add("hook", e.name, data, ok, { built, caps: ["shell"] });
  }
  // roles: keyword rules, then default
  const byId = new Map(assets.map((a) => [a.id, a]));
  for (const a of assets) {
    const hay = `${a.name} ${a.title} ${a.description}`.toLowerCase();
    for (const [role, kws] of Object.entries(cur.roles)) if (kws.some((k) => hay.includes(k.toLowerCase()))) a.roles.push(role);
    if (!a.roles.length) a.roles.push("developer");
  }
  // bundles: curated packs + upstream plugins
  const bundles = [];
  for (const p of cur.packs) {
    const ids = p.assets.filter((id) => { if (byId.has(id)) return true; warnings.push(`${p.id}: upstream no longer has ${id} (dropped)`); return false; });
    if (!ids.length) { warnings.push(`${p.id}: no resolvable assets, skipped`); continue; }
    ids.forEach((id) => { const a = byId.get(id); p.roles.forEach((r) => { if (!a.roles.includes(r)) a.roles.push(r); }); });
    bundles.push({ id: p.id, title: p.title, description: p.description, roles: p.roles, origin: "curated", assets: ids });
  }
  for (const e of ls(path.join(root, "plugins")).filter((e) => e.isDirectory())) {
    const pj = ["plugin.json", ".github/plugin/plugin.json"].map((f) => path.join(root, "plugins", e.name, f)).find((f) => fs.existsSync(f));
    if (!pj) continue;
    let j; try { j = JSON.parse(fs.readFileSync(pj, "utf8")); } catch { warnings.push(`plugin/${e.name}: invalid plugin.json`); continue; }
    const ext = j.extensions?.["com.github.awesome-copilot"] || {};
    const ids = [];
    const nm = (p) => path.posix.basename(String(p).replace(/\/+$/, "")).replace(/\.md$/, "").replace(/\.(agent|instructions)$/, "");
    for (const [key, type] of [["agents", "agent"], ["skills", "skill"], ["instructions", "instruction"], ["hooks", "hook"]])
      for (const p of ext[key] || []) { const id = `${type}/${nm(p)}`; if (byId.has(id)) ids.push(id); }
    if (!ids.length) continue;
    bundles.push({ id: `plugin/${e.name}`, title: titleCase(j.name || e.name), description: String(j.description || "Upstream plugin").replace(/\s+/g, " "),
      roles: [...new Set(ids.flatMap((id) => byId.get(id).roles))], origin: "upstream-plugin", assets: ids });
  }
  assets.sort((a, b) => a.id.localeCompare(b.id));
  const stats = assets.reduce((s, a) => ((s[a.type] = (s[a.type] || 0) + 1), s), {});
  return { index: { schema: 2, generatedAt: new Date().toISOString(), source: meta, stats, assets, bundles }, warnings };
}
