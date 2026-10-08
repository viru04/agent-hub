import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownWideNarrow, ArrowRight, Blocks, Bot, Check, ChevronDown, Command,
  FileText, Filter, Heart, Layers3, LoaderCircle, PackageCheck, Search,
  ShieldAlert, Sparkles, WandSparkles, Webhook, X,
} from "lucide-react";
import AssetCard from "./components/AssetCard.jsx";
import AssetDetails from "./components/AssetDetails.jsx";
import InstallCart from "./components/InstallCart.jsx";
import { encodeCart, restoreCart } from "./cart.js";
import "./styles.css";

const PAGE_SIZE = 12;
const PAGES = new Set(["home", "collections", "install"]);
const readPage = () => {
  const requestedPage = new URLSearchParams(window.location.search).get("page");
  if (PAGES.has(requestedPage)) return requestedPage;
  return window.location.hash.includes("cart=") ? "install" : "home";
};
const ASSET_TYPES = [
  { id: "agent", label: "Agents", icon: Bot },
  { id: "skill", label: "Skills", icon: Sparkles },
  { id: "instruction", label: "Instructions", icon: FileText },
  { id: "hook", label: "Hooks", icon: Webhook },
];
const readFavorites = () => {
  try { return new Set(JSON.parse(localStorage.getItem("agenthub:favorites") || "[]")); }
  catch { return new Set(); }
};
const array = (value) => Array.isArray(value) ? value : [];

export default function App() {
  const [page, setPage] = useState(readPage);
  const [index, setIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [role, setRole] = useState("");
  const [sort, setSort] = useState("featured");
  const [hideFlagged, setHideFlagged] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState(readFavorites);
  const [cart, setCart] = useState([]);
  const [scope, setScope] = useState("local");
  const [ready, setReady] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [toast, setToast] = useState("");

  const notify = useCallback((message) => {
    setToast(message);
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => setToast(""), 2400);
  }, []);

  const navigate = useCallback((nextPage) => {
    const url = new URL(window.location.href);
    if (nextPage === "home") url.searchParams.delete("page");
    else url.searchParams.set("page", nextPage);
    window.history.pushState(null, "", `${url.pathname}${url.search}${url.hash}`);
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const loadRegistry = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(new URL("./index.json", window.location.href));
      if (!response.ok) throw new Error(`Registry request failed (${response.status})`);
      const data = await response.json();
      if (!Array.isArray(data.assets) || !Array.isArray(data.bundles)) throw new Error("Registry data has an unexpected format.");
      setIndex(data);
      try {
        const restored = restoreCart(window.location.hash);
        if (restored) {
          setCart(restored.items);
          setScope(restored.scope);
        }
      } catch {
        notify("This shared cart link is invalid or out of date.");
      }
      setReady(true);
    } catch (loadError) {
      setError(loadError.message || "Could not load the community registry.");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => { loadRegistry(); }, [loadRegistry]);

  useEffect(() => {
    const syncPage = () => setPage(readPage());
    window.addEventListener("popstate", syncPage);
    return () => window.removeEventListener("popstate", syncPage);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const url = new URL(window.location.href);
    url.hash = cart.length ? `cart=${encodeCart(scope, cart)}` : "";
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [cart, scope, ready]);

  useEffect(() => {
    try { localStorage.setItem("agenthub:favorites", JSON.stringify([...favorites])); } catch { /* Storage can be disabled. */ }
  }, [favorites]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const isTyping = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
      if ((event.key === "/" && !isTyping) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
        event.preventDefault();
        document.getElementById("market-search")?.focus();
      }
      if (event.key === "Escape" && !isTyping) setQuery("");
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const roles = useMemo(() => [...new Set(array(index?.assets).flatMap((asset) => array(asset.roles)))].sort((a, b) => a.localeCompare(b)), [index]);
  const filteredAssets = useMemo(() => {
    if (!index) return [];
    const needle = query.trim().toLowerCase();
    const results = index.assets.filter((asset) => {
      const text = [asset.id, asset.title, asset.description, ...array(asset.roles), ...array(asset.capabilities)].join(" ").toLowerCase();
      return (!needle || text.includes(needle))
        && (!type || asset.type === type)
        && (!role || array(asset.roles).includes(role))
        && (!hideFlagged || !array(asset.flags).length)
        && (!favoritesOnly || favorites.has(asset.id));
    });
    const nameOrder = (a, b) => String(a.title || a.id).localeCompare(String(b.title || b.id));
    if (sort === "name") results.sort(nameOrder);
    else if (sort === "type") results.sort((a, b) => String(a.type).localeCompare(String(b.type)) || nameOrder(a, b));
    else if (sort === "verified") results.sort((a, b) => Number(b.tier === "verified") - Number(a.tier === "verified") || nameOrder(a, b));
    else results.sort((a, b) => Number(b.tier === "verified") - Number(a.tier === "verified") || nameOrder(a, b));
    return results;
  }, [index, query, type, role, hideFlagged, favoritesOnly, favorites, sort]);

  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [query, type, role, sort, hideFlagged, favoritesOnly]);

  const addToCart = useCallback((id) => {
    setCart((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }, []);
  const toggleFavorite = useCallback((id) => {
    setFavorites((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);
  const copyToClipboard = useCallback(async (value, kind) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const input = document.createElement("textarea");
      input.value = value;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.append(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
    notify(kind === "link" ? "Share link copied" : "Install command copied");
  }, [notify]);

  const source = index?.source || {};
  const clearFilters = () => { setQuery(""); setType(""); setRole(""); setHideFlagged(false); setFavoritesOnly(false); };
  const featuredAssets = index
    ? [...index.assets.filter((asset) => asset.tier === "verified" && !array(asset.flags).length), ...index.assets.filter((asset) => asset.tier !== "verified" && !array(asset.flags).length)].slice(0, 3)
    : [];

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => navigate("home")} aria-label="AgentHub home"><span className="brand-mark"><WandSparkles size={20} /></span><span>agent<span>hub</span></span><span className="brand-beta">COMMUNITY</span></button>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={`nav-link${page === "home" ? " active" : ""}`} type="button" aria-current={page === "home" ? "page" : undefined} onClick={() => navigate("home")}>Home</button>
          <button className={`nav-link${page === "collections" ? " active" : ""}`} type="button" aria-current={page === "collections" ? "page" : undefined} onClick={() => navigate("collections")}>Collections</button>
          <button className={`nav-link${page === "install" ? " active" : ""}`} type="button" aria-current={page === "install" ? "page" : undefined} onClick={() => navigate("install")}>Install guide <span className="nav-cart-count">{cart.length}</span></button>
        </nav>
        <a className="status-pill" href={source.repo ? `https://github.com/${source.repo}` : "#discover"} target={source.repo ? "_blank" : undefined} rel={source.repo ? "noreferrer" : undefined}><span className="status-indicator" />{index ? "Registry live" : "Connecting"}<ArrowRight size={13} /></a>
      </header>

      <main>
        {page === "home" && <>
          <section className="hero" id="discover">
            <div className="hero-glow hero-glow-one" /><div className="hero-glow hero-glow-two" />
            <div className="hero-content">
              <div className="hero-kicker"><span className="kicker-line" />THE OPEN TOOLKIT FOR GITHUB COPILOT</div>
              <h1>Make your AI<br /><span>unstoppable.</span></h1>
              <p className="hero-description">A carefully indexed community library of agents, skills, and instructions. Find your edge, make it yours, ship it in one command.</p>
              <label className="search-box"><Search size={19} /><input id="market-search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && navigate("collections")} placeholder="Search agents, skills, workflows…" autoComplete="off" /><kbd><Command size={11} /> K</kbd></label>
              <button className="hero-cta" type="button" onClick={() => navigate("collections")}>Explore the collection <ArrowRight size={16} /></button>
              <div className="hero-proof"><div className="proof-avatars"><span>A</span><span>✳</span><span>⌘</span><span>+</span></div><span>Built by the community, for the community</span><span className="proof-divider" /><span className="proof-live"><i /> Open registry</span></div>
            </div>
            <div className="hero-orbit" aria-hidden="true"><div className="orbit-ring orbit-ring-one" /><div className="orbit-ring orbit-ring-two" /><div className="orbit-core"><WandSparkles size={33} /></div><div className="orbit-node orbit-node-a"><Bot size={17} /></div><div className="orbit-node orbit-node-b"><Sparkles size={17} /></div><div className="orbit-node orbit-node-c"><Blocks size={17} /></div><div className="orbit-node orbit-node-d"><FileText size={16} /></div><div className="orbit-caption">YOUR AI, UPGRADED</div></div>
            <div className="hero-bottom"><span><Layers3 size={14} />{index ? `${index.assets.length.toLocaleString()} assets indexed` : "Community-curated assets"}</span><span className="hero-bottom-separator" /><span><ShieldAlert size={14} />Safety-aware by design</span><span className="hero-scroll">SCROLL TO EXPLORE <span>↓</span></span></div>
          </section>
          <section className="stats-strip" aria-label="Registry overview">
            <div className="stat-block"><span className="stat-icon stat-violet"><Layers3 size={16} /></span><div><strong>{index ? index.assets.length.toLocaleString() : "—"}</strong><span>CURATED ASSETS</span></div></div>
            <div className="stat-block"><span className="stat-icon stat-blue"><Blocks size={16} /></span><div><strong>{index ? index.bundles.length.toLocaleString() : "—"}</strong><span>READY-MADE BUNDLES</span></div></div>
            <div className="stat-block"><span className="stat-icon stat-green"><Check size={16} /></span><div><strong>{index ? index.assets.filter((asset) => asset.tier === "verified").length.toLocaleString() : "—"}</strong><span>VERIFIED BY CURATORS</span></div></div>
            <div className="stat-source"><span className="source-pulse" /><div><strong>{source.repo || "Community registry"}</strong><span>{source.sha ? `SYNCED · ${String(source.sha).slice(0, 8)}` : "Always open, always growing"}</span></div></div>
          </section>
          <section className="home-featured">
            <div className="home-section-heading"><div><div className="section-overline">A GOOD PLACE TO START</div><h2>Community <span>standouts.</span></h2><p>Hand-picked tools to get your workflow moving.</p></div><button className="text-link-button" type="button" onClick={() => navigate("collections")}>Browse everything <ArrowRight size={15} /></button></div>
            {loading && <div className="asset-grid">{Array.from({ length: 3 }, (_, i) => <div className="skeleton-card" key={i}><div className="skeleton-top"><i /><b /></div><div className="skeleton-line" /><div className="skeleton-line short" /><div className="skeleton-bottom"><i /><i /></div></div>)}</div>}
            {!loading && error && <div className="empty-panel error-panel"><span className="empty-symbol"><ShieldAlert size={20} /></span><h3>Registry temporarily unavailable</h3><p>{error}</p><button className="load-more-button" type="button" onClick={loadRegistry}>Try again <ArrowRight size={15} /></button></div>}
            {!loading && !error && <div className="asset-grid">{featuredAssets.map((asset) => <AssetCard key={asset.id} asset={asset} added={cart.includes(asset.id)} favorite={favorites.has(asset.id)} onAdd={addToCart} onFavorite={toggleFavorite} onDetails={setSelectedAsset} />)}</div>}
          </section>
        </>}

        {page === "collections" && <section className="collections-page" aria-labelledby="catalog-title">
          <div className="page-intro"><div><div className="section-overline">THE MARKETPLACE</div><h1 id="catalog-title">Find your next <span>unfair advantage.</span></h1><p>Explore community-built agents, skills, and workflows. Add only what fits.</p></div><div className="catalog-result">{loading ? <><LoaderCircle className="spin" size={14} /> Syncing catalog</> : <><span className="result-dot" />{filteredAssets.length.toLocaleString()} matches</>}</div></div>
          <label className="collection-search"><Search size={17} /><input id="market-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search agents, skills, workflows…" autoComplete="off" /><kbd><Command size={11} /> K</kbd></label>
          <div className="category-rail" aria-label="Filter by category">
            <button className={`category-chip${!type ? " selected" : ""}`} type="button" onClick={() => setType("")}><span className="chip-icon chip-all"><Layers3 size={15} /></span>All tools<span className="chip-count">{index?.assets.length ?? "—"}</span></button>
            {ASSET_TYPES.map(({ id, label, icon: Icon }) => <button className={`category-chip${type === id ? " selected" : ""}`} type="button" key={id} onClick={() => setType(type === id ? "" : id)}><span className={`chip-icon chip-${id}`}><Icon size={15} /></span>{label}<span className="chip-count">{index?.stats?.[id] ?? 0}</span></button>)}
            <button className="category-chip bundle-category" type="button" onClick={() => document.getElementById("bundle-picker")?.focus()}><span className="chip-icon chip-bundle"><PackageCheck size={15} /></span>Bundles</button>
          </div>
          <div className="filter-bar">
            <div className="filter-context"><Filter size={14} /><span>Refine</span>{(type || role || hideFlagged || favoritesOnly) && <button className="clear-filters" type="button" onClick={clearFilters}>Clear filters <X size={12} /></button>}</div>
            <div className="filter-controls">
              <label className="select-wrap"><span className="sr-only">Filter by role</span><select value={role} onChange={(event) => setRole(event.target.value)}><option value="">All roles</option>{roles.map((item) => <option key={item} value={item}>{item}</option>)}</select><ChevronDown size={13} /></label>
              <label className="select-wrap sort-select"><ArrowDownWideNarrow size={13} /><span className="sr-only">Sort assets</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="featured">Featured</option><option value="verified">Verified first</option><option value="name">Name A–Z</option><option value="type">By type</option></select><ChevronDown size={13} /></label>
              <label className={`toggle-control${hideFlagged ? " checked" : ""}`}><input type="checkbox" checked={hideFlagged} onChange={(event) => setHideFlagged(event.target.checked)} /><span className="toggle-track" /><span>Hide flagged</span></label>
              <button className={`favorites-toggle${favoritesOnly ? " selected" : ""}`} type="button" aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly((value) => !value)}><Heart size={14} fill={favoritesOnly ? "currentColor" : "none"} />Saved<span>{favorites.size}</span></button>
            </div>
          </div>
          <div className="bundle-bar"><div className="bundle-mark"><Blocks size={17} /></div><div className="bundle-description"><strong>Jump-start with a bundle</strong><span>Curated packs for a complete workflow</span></div><label className="bundle-select"><span className="sr-only">Select a pack or plugin bundle</span><select id="bundle-picker" defaultValue="" onChange={(event) => { if (event.target.value) { addToCart(event.target.value); notify("Bundle added to your cart"); event.target.value = ""; } }}><option value="">Choose a role pack or plugin</option>{array(index?.bundles).slice().sort((a, b) => a.id.localeCompare(b.id)).map((bundle) => <option value={bundle.id} key={bundle.id}>{bundle.title || bundle.id} · {array(bundle.assets).length} items</option>)}</select><ChevronDown size={15} /></label></div>
          {loading && <div className="asset-grid" aria-label="Loading catalog">{Array.from({ length: 6 }, (_, i) => <div className="skeleton-card" key={i}><div className="skeleton-top"><i /><b /></div><div className="skeleton-line" /><div className="skeleton-line short" /><div className="skeleton-bottom"><i /><i /></div></div>)}</div>}
          {!loading && error && <div className="empty-panel error-panel"><span className="empty-symbol"><ShieldAlert size={20} /></span><h3>Registry temporarily unavailable</h3><p>{error}</p><button className="load-more-button" type="button" onClick={loadRegistry}>Try again <ArrowRight size={15} /></button></div>}
          {!loading && !error && filteredAssets.length > 0 && <div className="asset-grid">{filteredAssets.slice(0, visibleCount).map((asset) => <AssetCard key={asset.id} asset={asset} added={cart.includes(asset.id)} favorite={favorites.has(asset.id)} onAdd={addToCart} onFavorite={toggleFavorite} onDetails={setSelectedAsset} />)}</div>}
          {!loading && !error && filteredAssets.length === 0 && <div className="empty-panel"><span className="empty-symbol"><Search size={20} /></span><h3>{favoritesOnly && !favorites.size ? "Your saved shelf is waiting" : "No tools match that search"}</h3><p>{favoritesOnly && !favorites.size ? "Tap the heart on anything you like to save it here." : "Try another phrase or clear a couple of filters."}</p><button className="load-more-button" type="button" onClick={clearFilters}>Reset discovery <ArrowRight size={15} /></button></div>}
          {!loading && !error && filteredAssets.length > visibleCount && <div className="load-more-row"><span>Showing {Math.min(visibleCount, filteredAssets.length)} of {filteredAssets.length.toLocaleString()} tools</span><button className="load-more-button" type="button" onClick={() => setVisibleCount((value) => value + PAGE_SIZE)}>Load 12 more <ArrowRight size={15} /></button></div>}
          <div className="catalog-footnote"><span className="footnote-mark">✳</span><span>Third-party tools, thoughtfully indexed. Always review an asset before installing it.</span></div>
        </section>}

        {page === "install" && <section className="install-page" aria-labelledby="install-title">
          <div className="page-intro install-intro"><div><div className="section-overline">FROM PICKED TO INSTALLED</div><h1 id="install-title">Your tools, <span>your workflow.</span></h1><p>Build a toolkit, choose where it belongs, then install it with one command.</p></div><span className="install-hero-icon"><PackageCheck size={25} /></span></div>
          <div className="install-layout">
            <div className="install-guide">
              <div className="guide-heading"><span className="section-overline">THREE QUICK STEPS</span><h2>Make it yours.</h2></div>
              <article className="guide-step"><span className="step-number">01</span><div><h3>Choose your tools</h3><p>Explore the collection and add individual assets or a complete role pack to your cart.</p><button className="text-link-button" type="button" onClick={() => navigate("collections")}>Browse collections <ArrowRight size={14} /></button></div></article>
              <article className="guide-step"><span className="step-number">02</span><div><h3>Pick an install scope</h3><p><strong>Local</strong> places tools in this repository. <strong>Global</strong> makes eligible assets available in your Copilot home.</p></div></article>
              <article className="guide-step"><span className="step-number">03</span><div><h3>Run the command</h3><p>Copy the generated command and run it from your project directory. AgentHub verifies upstream content before writing files.</p><div className="guide-command"><Command size={14} /><span>npx agenthub install …</span></div></div></article>
              <div className="guide-note"><ShieldAlert size={17} /><div><strong>Review before you install</strong><p>Flagged assets are blocked by default. Review an asset’s safety details before opting in with the CLI.</p></div></div>
            </div>
            <InstallCart items={cart} scope={scope} onScopeChange={setScope} onRemove={(id) => setCart((items) => items.filter((item) => item !== id))} onClear={() => setCart([])} onCopy={copyToClipboard} />
          </div>
        </section>}
      </main>
      <footer className="site-footer"><a className="footer-brand" href="./"><span className="brand-mark small"><WandSparkles size={15} /></span>agenthub</a><span>Made for people who build with AI.</span><span>{source.repo ? `Upstream · ${source.repo}` : "Community-powered"}</span></footer>
      {selectedAsset && <AssetDetails asset={selectedAsset} added={cart.includes(selectedAsset.id)} onAdd={addToCart} onClose={() => setSelectedAsset(null)} />}
      <div className={`toast${toast ? " toast-visible" : ""}`} role="status" aria-live="polite"><Check size={15} />{toast}</div>
    </div>
  );
}
