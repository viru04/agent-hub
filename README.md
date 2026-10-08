# agentHub

A role-based marketplace and one-command installer on top of
[github/awesome-copilot](https://github.com/github/awesome-copilot).

**awesome-copilot stays the data source.** agentHub never copies its content. It indexes it at a pinned commit,
adds roles, curated packs, safety checks, a cart and a per-file installer with a lockfile.

```
upstream (github/awesome-copilot) --pinned commit--> ingest --> index.json (+ web UI) --> GitHub Pages
                                                                     |
user: agenthub install pack/tester  --reads index--> fetches each file from raw.githubusercontent.com/<sha>/...
                                    --verifies SHA-256--> writes to .github/ (local) or ~/.copilot (global) + agenthub.lock
```

## Where it fits next to native plugins

awesome-copilot already ships a plugin marketplace (`copilot plugin install <name>@awesome-copilot`).
agentHub complements it: install **single** agents/instructions/skills/hooks, **role** packs, a cart, local vs global
placement per file, hash-verified installs, lockfile, `update`, `sync`, and automated flags for risky content.
Upstream plugins appear in agentHub as `plugin/<name>` bundles.

## Layout

```
curation/   YOUR data: upstream.yaml, paths.yaml, roles.yaml, packs/, verified.json, blocklist.json
lib/        ingest (parse upstream), scan (safety heuristics), schema (Zod)
scripts/    validate (curation), build (ingest -> dist/), serve (local test server)
cli/        the `agenthub` command
web/        React + Vite marketplace UI (bundled into dist/)
test/       offline end-to-end tests with a fixture upstream
.github/    CI (3 OS) and a daily publish workflow (GitHub Pages)
```

## Try it (live upstream)

```bash
npm install
npm run build                       # downloads awesome-copilot, writes dist/ (about 850 assets)
npm run serve                       # web UI at http://127.0.0.1:8080
npm run dev                         # React/Vite hot reload (run build once first)
```

In any test repository:

```bash
A="node /path/to/agenthub/cli/bin/agenthub.mjs --registry /path/to/agenthub/dist"
node /path/to/agenthub/cli/bin/agenthub.mjs install pack/tester --registry /path/to/agenthub/dist --dry-run
node /path/to/agenthub/cli/bin/agenthub.mjs install pack/tester --registry /path/to/agenthub/dist
node /path/to/agenthub/cli/bin/agenthub.mjs install skill/git-commit --global --registry /path/to/agenthub/dist
```

## Publish on GitHub

1. Push this folder to a new repo `main`. Settings > Pages > Source: **GitHub Actions**.
2. *Publish registry* runs on every push and **daily**, re-indexing awesome-copilot and deploying to
   `https://<user>.github.io/<repo>`.
3. Set `DEFAULT_REGISTRY` in `cli/src/registry.mjs` to that URL.
4. The website's copied commands run the CLI from `github:viru04/agent-hub`, so they work before an npm release. After publishing the package, they can use `npx agenthub ...` instead.

## Commands

```
agenthub install <id|pack/x|plugin/x>... [--local|--global] [--dry-run] [--yes] [--force] [--allow-flagged]
agenthub install --cart <code>      cart code from the web UI
agenthub search [text] [--type agent|instruction|skill|hook] [--role tester] [--bundles]
agenthub info <id>      agenthub list      agenthub update      agenthub uninstall <id>...
agenthub sync           installs what .agenthub.json requires: {"packs":["pack/tester"],"assets":[],"scope":"local"}
```

Ids: `agent/playwright-tester`, `instruction/a11y`, `skill/git-commit`, `hook/session-logger`.

## Safety model

- Every file is fetched from the upstream commit the index was built from and checked against its SHA-256 **before** anything is written.
- Install is blocked for assets flagged by heuristic scans (hidden unicode, prompt-injection phrases, pipe-to-shell, base64-exec) unless `--allow-flagged`. These are heuristics with false positives (docs that merely *mention* `curl | sh`); they support human review, never replace it.
- Capabilities (shell, network, mcp) are inferred from an agent's `tools`, or from scripts in skills, and shown before install. Hooks are always `shell`.
- Everything upstream is third-party. Only assets you reviewed belong in `curation/verified.json`.
- Locally edited files are never overwritten without `--force` (a `.bak` is kept). `uninstall` leaves edited files alone.

## Verify these

`curation/paths.yaml` maps types to folders (`.github/agents`, `.github/instructions`, `.github/skills`, `.github/hooks`,
and `~/.copilot/...` for global). Confirm them against current GitHub Copilot docs. Fixing them is a data-only change.

## Known limits (next steps)

- index is a snapshot per build; `rev` is a content hash, so `id@rev` pins work only for the current snapshot (keep dated indexes to support older pins)
- upstream deletion or force-push of a pinned commit would break installs: add an optional mirror
- no signing yet (add Sigstore attestations of `index.json` in the publish workflow)
- role tagging is keyword based; refine `curation/roles.yaml` and packs as you review content
- `doctor` and ranges/dependencies are not built (upstream assets declare no dependencies; bundles cover grouping)
