import { useEffect } from "react";
import { Check, ExternalLink, ShieldAlert, X } from "lucide-react";

const asArray = (value) => Array.isArray(value) ? value : [];

export default function AssetDetails({ asset, added, onAdd, onClose }) {
  useEffect(() => {
    if (!asset) return undefined;
    const closeOnEscape = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", closeOnEscape);
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.classList.remove("modal-open");
    };
  }, [asset, onClose]);

  if (!asset) return null;
  const flags = asArray(asset.flags);
  const roles = asArray(asset.roles);
  const capabilities = asArray(asset.capabilities);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="asset-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <header className="modal-header"><div><span className="eyebrow-small">ASSET OVERVIEW</span><h2 id="detail-title">{asset.title || asset.id}</h2><code>{asset.id}</code></div><button className="modal-close" type="button" onClick={onClose} aria-label="Close details"><X size={18} /></button></header>
        <div className="modal-body">
          <p className="modal-description">{asset.description || "No description has been provided for this community asset."}</p>
          <div className="detail-facts"><div><span>TYPE</span><strong>{asset.type || "Asset"}</strong></div><div><span>REVIEW TIER</span><strong className={asset.tier === "verified" ? "text-verified" : asset.tier === "flagged" ? "text-flagged" : ""}>{asset.tier || "Community"}</strong></div></div>
          {roles.length > 0 && <div className="detail-group"><h3>Best for</h3><div className="badge-list">{roles.map((role) => <span className="badge badge-role" key={role}>{role}</span>)}</div></div>}
          {capabilities.length > 0 && <div className="detail-group"><h3>Capabilities</h3><div className="badge-list">{capabilities.map((capability) => <span className="badge badge-capability" key={capability}>{capability}</span>)}</div></div>}
          {flags.length > 0 && <div className="detail-warning"><ShieldAlert size={17} /><div><strong>Review safety flags</strong><ul>{flags.map((flag) => <li key={flag}>{flag}</li>)}</ul><p>This asset is flagged. The installer blocks flagged content by default.</p></div></div>}
          {asset.url && <a className="upstream-link" href={asset.url} target="_blank" rel="noreferrer">View upstream source <ExternalLink size={14} /></a>}
        </div>
        <footer className="modal-footer"><button className={`add-button modal-add${added ? " is-added" : ""}`} type="button" onClick={() => onAdd(asset.id)}>{added ? <Check size={15} /> : "+"}{added ? "In install cart" : "Add to install cart"}</button></footer>
      </section>
    </div>
  );
}
