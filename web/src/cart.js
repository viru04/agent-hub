const CLI_PACKAGE = "github:viru04/agent-hub";

const toBase64Url = (value) =>
  btoa(Array.from(new TextEncoder().encode(value), (byte) => String.fromCharCode(byte)).join(""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const fromBase64Url = (value) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

export function encodeCart(scope, items) {
  return toBase64Url(JSON.stringify({ v: 1, scope, items }));
}

export function restoreCart(hash) {
  const code = new URLSearchParams(hash.replace(/^#/, "")).get("cart");
  if (!code) return null;

  const payload = JSON.parse(fromBase64Url(code));
  if (payload.v !== 1 || !Array.isArray(payload.items)) {
    throw new Error("Unsupported shared cart format");
  }

  return {
    items: payload.items.filter((item) => typeof item === "string"),
    scope: payload.scope === "global" ? "global" : "local",
  };
}

export function createInstallCommand(items, scope, pageUrl) {
  const registry = new URL("./", pageUrl).href.replace(/\/$/, "");
  return `npx ${CLI_PACKAGE} install ${items.join(" ")} --${scope} --registry ${registry}`;
}

export function createCartCommand(items, scope, pageUrl) {
  const registry = new URL("./", pageUrl).href.replace(/\/$/, "");
  return `npx ${CLI_PACKAGE} install --cart ${encodeCart(scope, items)} --registry ${registry}`;
}
