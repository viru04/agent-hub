import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { openRegistry, DEFAULT_REGISTRY } from "./registry.mjs";
import { install, uninstall, readLock } from "./install.mjs";

const HELP = `agentHub - install community Copilot agents, instructions, skills and hooks

Usage:
  agenthub install <id|pack/name|plugin/name>... [--local|--global] [--dry-run] [--yes] [--force]
  agenthub install --cart <code>
  agenthub search [text] [--type agent|instruction|skill|hook] [--role tester] [--bundles]
  agenthub info <id>
  agenthub list
  agenthub update [--local|--global]        re-install installed assets at the registry's current revision
  agenthub sync                             install what .agenthub.json requires
  agenthub uninstall <id>... [--local|--global]

Ids look like agent/playwright-tester, instruction/a11y, skill/git-commit, hook/session-logger.
Bundles: pack/tester (curated role packs) and plugin/<name> (upstream plugins).

Options:
  --registry <url|path>  registry location (or env AGENTHUB_REGISTRY)
  --local / --global     repo (default) or Copilot home (~/.copilot, or AGENTHUB_HOME)
  --dry-run              show what would be written, write nothing
  --yes, -y              skip the confirmation prompt
  --force                back up locally modified files (.bak) and overwrite
  --allow-flagged        install assets that automated checks flagged (review them first)
`;

export async function main(argv) {
  const { values: v, positionals } = parseArgs({ args: argv, allowPositionals: true, options: {
    registry: { type: "string" }, local: { type: "boolean" }, global: { type: "boolean" }, "dry-run": { type: "boolean" },
    yes: { type: "boolean", short: "y" }, force: { type: "boolean" }, "allow-flagged": { type: "boolean" }, cart: { type: "string" },
    type: { type: "string" }, role: { type: "string" }, bundles: { type: "boolean" }, help: { type: "boolean", short: "h" } } });
  const [cmd, ...rest] = positionals;
  if (v.help || !cmd) return console.log(HELP);
  if (v.local && v.global) throw new Error("choose either --local or --global");
  let cart = null;
  if (v.cart) { try { cart = JSON.parse(Buffer.from(v.cart, "base64url").toString("utf8")); } catch { throw new Error("invalid --cart code"); } }
  let team = null;
  if (cmd === "sync") {
    const f = path.join(process.cwd(), ".agenthub.json");
    if (!fs.existsSync(f)) throw new Error("no .agenthub.json in this directory");
    team = JSON.parse(fs.readFileSync(f, "utf8"));
  }
  const scope = v.global ? "global" : v.local ? "local" : cart?.scope || team?.scope || "local";
  const url = v.registry || process.env.AGENTHUB_REGISTRY || team?.registry || DEFAULT_REGISTRY;
  const opts = { dryRun: v["dry-run"], yes: v.yes, force: v.force, allowFlagged: v["allow-flagged"] };

  if (cmd === "list") {
    for (const s of ["local", "global"]) {
      const l = readLock(s); console.log(`\n${s} scope (${l.installed.length})`);
      l.installed.forEach((i) => console.log(`  ${i.id}  rev ${i.rev}  via ${i.source}`));
    }
    return;
  }
  if (cmd === "uninstall") return uninstall({ ids: rest, scope });

  const reg = openRegistry(url);
  const index = await reg.json("index.json");
  if (cmd === "search") {
    const q = rest.join(" ").toLowerCase();
    if (v.bundles) { index.bundles.forEach((b) => console.log(`${b.id}  (${b.assets.length})  ${b.title}`)); return; }
    const hits = index.assets.filter((a) => (!v.type || a.type === v.type) && (!v.role || a.roles.includes(v.role)) &&
      (!q || `${a.id} ${a.title} ${a.description}`.toLowerCase().includes(q)));
    hits.slice(0, 50).forEach((a) => console.log(`${a.id}  [${a.tier}]  ${a.title}`));
    console.log(`\n${hits.length} result(s)${hits.length > 50 ? " (showing 50)" : ""}. Bundles: agenthub search --bundles`);
    return;
  }
  if (cmd === "info") {
    const a = index.assets.find((x) => x.id === rest[0]) || index.bundles.find((x) => x.id === rest[0]);
    if (!a) throw new Error(`unknown id '${rest[0]}'`);
    return console.log(JSON.stringify(a, null, 2));
  }
  const config = await reg.json("config.json");
  const run = (specs) => install({ specs, scope, reg, index, config, opts });
  if (cmd === "install") {
    const specs = cart ? cart.items : rest;
    if (!specs?.length) throw new Error("nothing to install. Try: agenthub install pack/tester");
    return run(specs);
  }
  if (cmd === "update") {
    const ids = readLock(scope).installed.map((i) => i.id);
    if (!ids.length) return console.log(`nothing installed in ${scope} scope`);
    return run(ids);
  }
  if (cmd === "sync") {
    const specs = [...(team.packs || []), ...(team.assets || [])];
    if (!specs.length) throw new Error(".agenthub.json lists no packs or assets");
    return run(specs);
  }
  throw new Error(`unknown command '${cmd}'. Run agenthub --help`);
}
