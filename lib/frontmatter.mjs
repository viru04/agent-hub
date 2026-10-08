import YAML from "yaml";
export function frontmatter(text) {
  const m = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return { data: {}, ok: true };
  try { const d = YAML.parse(m[1]); return { data: d && typeof d === "object" ? d : {}, ok: true }; }
  catch { return { data: {}, ok: false }; }
}
