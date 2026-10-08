// Heuristic static checks. They support, never replace, human review.
const TEXT_EXT = /\.(md|json|ya?ml|txt|sh|ps1|py|js|mjs|ts|toml)$/i;
const RULES = [
  ["hidden-unicode", /[\u202A-\u202E\u2066-\u2069\u2060]|[\u{E0000}-\u{E007F}]/u],
  ["injection-phrase", /ignore\s+(all\s+)?(the\s+)?(previous|prior|above)\s+(instructions|rules)|disregard\s+(your|all)\s+(previous\s+)?(instructions|rules)/i],
  ["pipe-to-shell", /(curl|wget)\b[^\n|]*\|\s*(sudo\s+)?(ba|z)?sh\b/i],
  ["base64-exec", /base64\s+(-d|--decode)[^\n]*\|\s*(ba|z)?sh\b/i]
];
export function scanText(name, buf) {
  if (!TEXT_EXT.test(name) || buf.length > 1_000_000) return [];
  const t = buf.toString("utf8");
  return RULES.filter(([, re]) => re.test(t)).map(([id]) => id);
}
// Capabilities inferred from an agent's declared tools. Heuristic.
const SHELL = /^(execute|runCommands|runInTerminal|runTasks|shell|bash|terminal\w*)$/i;
const NET = /^(web|fetch|webSearch|githubRepo|web\/.*)$/i;
const BUILTIN_PREFIX = /^(edit|search|web|read|execute|vscode|agent|todo)\//;
export function capsFromTools(tools, fm) {
  const caps = new Set();
  const list = Array.isArray(tools) ? tools.map(String) : [];
  for (const t of list) {
    if (SHELL.test(t)) caps.add("shell");
    if (NET.test(t)) caps.add("network");
    if ((t.includes("/") && !BUILTIN_PREFIX.test(t)) || t.endsWith("*") || /mcp/i.test(t)) caps.add("mcp");
  }
  if (fm && (fm["mcp-servers"] || fm.mcpServers)) caps.add("mcp");
  return [...caps].sort();
}
export const BLOCKING_FLAGS = new Set(RULES.map(([id]) => id));
