# Contributing to agentHub

agentHub does **not** host assets. Agents, instructions, skills and hooks live in
github/awesome-copilot. To add or change one, contribute there.

Here you can change:

| What | Where |
|---|---|
| Role packs (Tester, Developer, ...) | `curation/packs/*.yaml` |
| Role keyword rules | `curation/roles.yaml` |
| Verified tier (after a real review) | `curation/verified.json` |
| Block a harmful or broken upstream asset | `curation/blocklist.json` |
| Where asset types are installed | `curation/paths.yaml` |
| Upstream repo / ref | `curation/upstream.yaml` |
| CLI, ingest, web UI | `cli/`, `lib/`, `web/` |

Run `npm run validate && npm test`, then `npm run build -- --strict` to confirm every pack id still exists upstream.
Adding to `verified.json` means you reviewed every file of that asset, including scripts, for prompt injection,
hidden text, shell, network and MCP behaviour.
