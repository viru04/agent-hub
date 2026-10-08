import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createCartCommand, createInstallCommand } from "../web/src/cart.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, args, opts) => new Promise((res) =>
  execFile(cmd, args, { ...opts, env: { ...process.env, ...(opts?.env || {}) } }, (err, stdout, stderr) =>
    res({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, stdout, stderr })));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "ah-test-"));
const upstream = tmp(), dist = tmp();
fs.cpSync(path.join(root, "test/fixture-upstream"), upstream, { recursive: true });
const build = () => run("node", ["scripts/build.mjs", "--source", upstream], { cwd: root, env: { AGENTHUB_OUT: dist, AGENTHUB_CURATION: path.join(root, "test/fixture-curation") } });
const cli = (args, cwd, env = {}) => run("node", [path.join(root, "cli/bin/agenthub.mjs"), ...args, "--registry", dist],
  { cwd, env: { AGENTHUB_HOME: path.join(cwd, "fakehome"), ...env } });
const readIndex = () => JSON.parse(fs.readFileSync(path.join(dist, "index.json"), "utf8"));

test.before(async () => { const b = await build(); assert.equal(b.code, 0, b.stderr); });

test("website install commands invoke the GitHub CLI before npm publication", () => {
  const pageUrl = "https://agenthub.vercel.app/";
  assert.equal(
    createInstallCommand(["agent/playwright-tester"], "local", pageUrl),
    "npx github:viru04/agent-hub install agent/playwright-tester --local --registry https://agenthub.vercel.app",
  );
  assert.match(
    createCartCommand(["agent/playwright-tester"], "global", pageUrl),
    /^npx github:viru04\/agent-hub install --cart [A-Za-z0-9_-]+ --registry https:\/\/agenthub\.vercel\.app$/,
  );
});

test("curation overlay validates", async () => {
  assert.equal((await run("node", ["scripts/validate.mjs"], { cwd: root })).code, 0);
});

test("index: types, capabilities, flags, tiers, bundles", () => {
  const i = readIndex(), by = (id) => i.assets.find((a) => a.id === id);
  assert.deepEqual(i.stats, { agent: 3, hook: 1, instruction: 1, skill: 1 });
  assert.deepEqual(by("agent/qa-bot").capabilities, ["network", "shell"]);
  assert.equal(by("agent/evil").tier, "flagged");
  assert.equal(by("agent/plain").tier, "verified");
  assert.ok(by("skill/demo-skill").capabilities.includes("shell"));
  assert.equal(by("skill/demo-skill").files.length, 3);
  assert.ok(by("agent/qa-bot").roles.includes("tester"));
  assert.deepEqual(i.bundles.find((b) => b.id === "plugin/demo").assets.sort(), ["agent/plain", "skill/demo-skill"]);
  assert.equal(i.bundles.find((b) => b.id === "pack/qa").origin, "curated");
});

test("build emits the React marketplace with relative asset paths", () => {
  const html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /src="\.\/assets\/index-[^"]+\.js"/);
  assert.match(html, /href="\.\/assets\/index-[^"]+\.css"/);
  assert.ok(fs.existsSync(path.join(dist, "index.json")));
  assert.ok(fs.existsSync(path.join(dist, "config.json")));
});

test("dry run writes nothing", async () => {
  const cwd = tmp();
  const r = await cli(["install", "pack/qa", "--dry-run"], cwd);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Dry run/);
  assert.equal(fs.existsSync(path.join(cwd, ".github")), false);
});

test("local install of a pack: agent, instruction and multi-file skill; rerun is idempotent", async () => {
  const cwd = tmp();
  const r = await cli(["install", "pack/qa", "--yes"], cwd);
  assert.equal(r.code, 0, r.stderr + r.stdout);
  for (const f of [".github/agents/qa-bot.agent.md", ".github/instructions/ts-style.instructions.md",
    ".github/skills/demo-skill/SKILL.md", ".github/skills/demo-skill/references/guide.md", ".github/skills/demo-skill/scripts/run.sh"])
    assert.ok(fs.existsSync(path.join(cwd, f)), f);
  const lock = JSON.parse(fs.readFileSync(path.join(cwd, "agenthub.lock"), "utf8"));
  assert.equal(lock.installed.length, 3);
  assert.match((await cli(["install", "pack/qa", "--yes"], cwd)).stdout, /Nothing to do/);
});

test("locally edited file is protected unless --force", async () => {
  const cwd = tmp();
  await cli(["install", "agent/plain", "--yes"], cwd);
  const f = path.join(cwd, ".github/agents/plain.agent.md");
  fs.writeFileSync(f, "my edits");
  assert.equal((await cli(["install", "agent/plain", "--yes"], cwd)).code, 2);
  assert.equal(fs.readFileSync(f, "utf8"), "my edits");
  assert.equal((await cli(["install", "agent/plain", "--yes", "--force"], cwd)).code, 0);
  assert.equal(fs.readFileSync(f + ".bak", "utf8"), "my edits");
});

test("global scope works for agents and skills; hooks are repo-only", async () => {
  const cwd = tmp();
  assert.equal((await cli(["install", "agent/plain", "skill/demo-skill", "--global", "--yes"], cwd)).code, 0);
  assert.ok(fs.existsSync(path.join(cwd, "fakehome/.copilot/agents/plain.agent.md")));
  assert.ok(fs.existsSync(path.join(cwd, "fakehome/.copilot/skills/demo-skill/SKILL.md")));
  const h = await cli(["install", "hook/audit", "--global", "--yes"], cwd);
  assert.notEqual(h.code, 0);
  assert.match(h.stderr, /cannot be installed in global scope/);
  assert.equal((await cli(["install", "hook/audit", "--yes"], cwd)).code, 0);
  assert.ok(fs.existsSync(path.join(cwd, ".github/hooks/audit/check.sh")));
});

test("flagged assets are blocked unless --allow-flagged", async () => {
  const cwd = tmp();
  const r = await cli(["install", "agent/evil", "--yes"], cwd);
  assert.equal(r.code, 3);
  assert.equal(fs.existsSync(path.join(cwd, ".github")), false);
  assert.equal((await cli(["install", "agent/evil", "--yes", "--allow-flagged"], cwd)).code, 0);
});

test("cart code and sync file install the same way", async () => {
  const cwd = tmp();
  const code = Buffer.from(JSON.stringify({ v: 1, scope: "local", items: ["agent/plain"] })).toString("base64url");
  assert.equal((await cli(["install", "--cart", code, "--yes"], cwd)).code, 0);
  const cwd2 = tmp();
  fs.writeFileSync(path.join(cwd2, ".agenthub.json"), JSON.stringify({ packs: ["pack/qa"], scope: "local" }));
  assert.equal((await cli(["sync", "--yes"], cwd2)).code, 0);
  assert.ok(fs.existsSync(path.join(cwd2, ".github/skills/demo-skill/SKILL.md")));
});

test("update moves unmodified files to the new upstream revision; uninstall removes them", async () => {
  const cwd = tmp();
  await cli(["install", "agent/plain", "--yes"], cwd);
  fs.appendFileSync(path.join(upstream, "agents/plain.agent.md"), "\nNew upstream line.\n");
  assert.equal((await build()).code, 0);
  const u = await cli(["update", "--yes"], cwd);
  assert.equal(u.code, 0, u.stderr);
  assert.match(fs.readFileSync(path.join(cwd, ".github/agents/plain.agent.md"), "utf8"), /New upstream line/);
  assert.equal((await cli(["uninstall", "agent/plain"], cwd)).code, 0);
  assert.equal(fs.existsSync(path.join(cwd, ".github/agents/plain.agent.md")), false);
});

test("upstream content that no longer matches the index is rejected, nothing written", async () => {
  const cwd = tmp();
  assert.equal((await build()).code, 0);
  fs.appendFileSync(path.join(upstream, "agents/plain.agent.md"), "tampered after indexing\n");
  const r = await cli(["install", "agent/plain", "--yes"], cwd);
  assert.notEqual(r.code, 0);
  assert.match(r.stderr, /Integrity check failed/);
  assert.equal(fs.existsSync(path.join(cwd, ".github")), false);
});
