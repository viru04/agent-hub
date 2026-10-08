// Resolves specs (asset ids, id@rev, pack/x, plugin/x) into a flat asset list.
export function resolve(index, specs) {
  const byId = new Map(index.assets.map((a) => [a.id, a]));
  const chosen = new Map();
  const take = (id, rev, source) => {
    const a = byId.get(id);
    if (!a) throw new Error(`unknown asset '${id}'. Try: agenthub search <text>`);
    if (rev && rev !== a.rev) throw new Error(`${id}@${rev} is not available; this registry has ${a.rev}`);
    if (!chosen.has(id)) chosen.set(id, { asset: a, source });
  };
  for (const spec of specs) {
    const [id, rev] = spec.split("@");
    if (/^(pack|plugin)\//.test(id)) {
      const b = index.bundles.find((x) => x.id === id);
      if (!b) throw new Error(`unknown bundle '${id}'. Try: agenthub search --bundles`);
      b.assets.forEach((aid) => take(aid, null, id));
    } else take(id, rev, "direct");
  }
  return [...chosen.values()];
}
