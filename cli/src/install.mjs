import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import readline from "node:readline";
import { resolve } from "./resolve.mjs";

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const fail = (msg, code = 1) => Object.assign(new Error(msg), { exitCode: code });

export const baseDir = (scope) => (scope === "global" ? process.env.AGENTHUB_HOME || os.homedir() : process.cwd());
export const lockPath = (scope) => (scope === "global" ? path.join(baseDir(scope), ".copilot", "agenthub.lock") : path.join(baseDir(scope), "agenthub.lock"));
export function readLock(scope) {
  const p = lockPath(scope);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : { lockVersion: 2, installed: [] };
}
export function writeLock(scope, lock) {
  const p = lockPath(scope); fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(lock, null, 2) + "\n");
}
const rel = (scope, abs) => path.relative(baseDir(scope), abs).split(path.sep).join("/");
const ask = (q) => new Promise((res) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); res(a); }); });
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]); } }));
  return out;
}
const destFor = (scope, dirForType, a, f) =>
  path.join(baseDir(scope), dirForType, ...(a.type === "agent" || a.type === "instruction" ? [path.basename(f.rel)] : [a.name, ...f.rel.split("/")]));

export async function install({ specs, scope, reg, index, config, opts }) {
  const resolved = resolve(index, specs);
  const lock = readLock(scope);
  for (const { asset: a } of resolved) {
    if (!config.paths[scope]?.[a.type]) throw fail(`${a.id}: '${a.type}' assets cannot be installed in ${scope} scope`);
    if (a.flags.length && !opts.allowFlagged) throw fail(`${a.id} was flagged by automated checks (${a.flags.join(", ")}). Review it, then re-run with --allow-flagged.`, 3);
  }
  // download + verify everything BEFORE touching the disk
  const jobs = resolved.flatMap(({ asset: a }) => a.files.map((f) => ({ a, f })));
  const bytes = await pool(jobs, 8, async ({ a, f }) => {
    const buf = await reg.fetchSource(index, f);
    if (sha(buf) !== f.sha256) throw fail(`Integrity check failed for ${a.id} (${f.rel}): hash mismatch. Nothing was written.`);
    return buf;
  });
  const plan = jobs.map(({ a, f }, i) => {
    const dest = destFor(scope, config.paths[scope][a.type], a, f);
    let state = "new";
    if (fs.existsSync(dest)) {
      const cur = sha(fs.readFileSync(dest));
      if (cur === f.sha256) state = "same";
      else {
        const prev = lock.installed.find((x) => x.id === a.id)?.files.find((x) => x.path === rel(scope, dest));
        state = prev && prev.sha256 === cur ? "update" : "conflict";
      }
    }
    return { id: a.id, dest, content: bytes[i], sha256: f.sha256, state };
  });

  const src = index.source;
  console.log(`\nScope: ${scope}   Source: ${src.repo}@${String(src.sha).slice(0, 10)}\n`);
  const sym = { new: "+", same: "=", update: "~", conflict: "!" };
  for (const { asset: a, source } of resolved) {
    const mine = plan.filter((p) => p.id === a.id), c = (s) => mine.filter((p) => p.state === s).length;
    console.log(`  ${a.id}  [${a.tier}]  ${mine.length} file(s): +${c("new")} ~${c("update")} =${c("same")} !${c("conflict")}${source !== "direct" ? "  via " + source : ""}`);
    if (a.capabilities.length) console.log(`      capabilities: ${a.capabilities.join(", ")}`);
    if (a.flags.length) console.log(`      FLAGGED: ${a.flags.join(", ")}`);
  }
  if (opts.dryRun || plan.length <= 12) { console.log("\nFiles:"); plan.forEach((p) => console.log(`  ${sym[p.state]} ${rel(scope, p.dest)}`)); }
  else plan.filter((p) => p.state === "conflict").forEach((p) => console.log(`  ! ${rel(scope, p.dest)}`));
  if (resolved.some((r) => r.asset.tier !== "verified")) console.log("\nNOTE: these assets come from third-party contributors. Review them before relying on them.");
  const conflicts = plan.filter((p) => p.state === "conflict");
  const todo = plan.filter((p) => p.state !== "same");
  if (conflicts.length && !opts.force) throw fail(`\n${conflicts.length} file(s) were modified locally. Re-run with --force to back them up (.bak) and overwrite.`, 2);
  if (opts.dryRun) { console.log("\nDry run: nothing written."); return; }
  if (todo.length) {
    if (!opts.yes) {
      if (!process.stdin.isTTY) throw fail("not an interactive terminal: pass --yes to confirm");
      if (!/^y/i.test(await ask("\nProceed? [y/N] "))) throw fail("aborted by user");
    }
    for (const p of todo) {
      fs.mkdirSync(path.dirname(p.dest), { recursive: true });
      if (p.state === "conflict") fs.renameSync(p.dest, p.dest + ".bak");
      const t = p.dest + ".agenthub-tmp";
      fs.writeFileSync(t, p.content); fs.renameSync(t, p.dest);
    }
  } else console.log("\nNothing to do: everything is already installed.");
  for (const { asset: a, source } of resolved) {
    lock.installed = lock.installed.filter((i) => i.id !== a.id);
    lock.installed.push({ id: a.id, type: a.type, rev: a.rev, scope, source, upstream: { repo: src.repo, sha: src.sha },
      files: plan.filter((p) => p.id === a.id).map((p) => ({ path: rel(scope, p.dest), sha256: p.sha256 })) });
  }
  writeLock(scope, lock);
  console.log(`\nInstalled ${resolved.length} asset(s), ${todo.length} file(s) written. Lockfile: ${lockPath(scope)}`);
}

export function uninstall({ ids, scope }) {
  const lock = readLock(scope);
  for (const id of ids) {
    const e = lock.installed.find((i) => i.id === id);
    if (!e) { console.log(`${id}: not installed in ${scope} scope`); continue; }
    for (const f of e.files) {
      const abs = path.join(baseDir(scope), f.path);
      if (!fs.existsSync(abs)) continue;
      if (sha(fs.readFileSync(abs)) === f.sha256) { fs.unlinkSync(abs); console.log(`removed ${f.path}`); }
      else console.log(`kept ${f.path} (modified locally)`);
    }
    lock.installed = lock.installed.filter((i) => i.id !== id);
  }
  writeLock(scope, lock);
}
