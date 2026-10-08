import { Bot, Blocks, FileText, Heart, Plus, Sparkles, Webhook, Check, ChevronRight, ShieldAlert } from "lucide-react";

const typeIcons = {
  agent: Bot,
  instruction: FileText,
  skill: Sparkles,
  hook: Webhook,
  plugin: Blocks,
};

const label = (value) => String(value || "community").replaceAll("-", " ");

export default function AssetCard({ asset, added, favorite, onAdd, onFavorite, onDetails }) {
  const Icon = typeIcons[asset.type] || Sparkles;
  const flags = Array.isArray(asset.flags) ? asset.flags : [];
  const roles = Array.isArray(asset.roles) ? asset.roles : [];
  const capabilities = Array.isArray(asset.capabilities) ? asset.capabilities : [];

  return (
    <article className="asset-card">
      <div className="asset-card-top">
        <span className={`asset-icon asset-icon-${asset.type}`}><Icon size={19} strokeWidth={1.8} /></span>
        <button
          className={`favorite-button${favorite ? " is-favorite" : ""}`}
          type="button"
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
          aria-pressed={favorite}
          onClick={() => onFavorite(asset.id)}
        >
          <Heart size={17} fill={favorite ? "currentColor" : "none"} />
        </button>
      </div>
      <button className="asset-title-button" type="button" onClick={() => onDetails(asset)}>
        <span className="asset-title">{asset.title || asset.id}</span>
        <span className="asset-id">{asset.id}</span>
      </button>
      <p className="asset-description">{asset.description || "A community contribution for your Copilot workflow."}</p>
      <div className="badge-list">
        <span className={`badge badge-${asset.tier === "verified" ? "verified" : asset.tier === "flagged" ? "flagged" : "type"}`}>
          {asset.tier === "verified" && <Check size={11} />}{label(asset.tier || asset.type)}
        </span>
        {roles.slice(0, 2).map((role) => <span className="badge badge-role" key={role}>{label(role)}</span>)}
        {capabilities.slice(0, 2).map((capability) => <span className="badge badge-capability" key={capability}>{label(capability)}</span>)}
        {flags.length > 0 && <span className="badge badge-flag"><ShieldAlert size={11} />{flags.length} flag{flags.length === 1 ? "" : "s"}</span>}
      </div>
      <div className="asset-card-footer">
        <button className="details-link" type="button" onClick={() => onDetails(asset)}>Explore details <ChevronRight size={14} /></button>
        <button className={`add-button${added ? " is-added" : ""}`} type="button" onClick={() => onAdd(asset.id)}>
          {added ? <Check size={15} /> : <Plus size={15} />}{added ? "In cart" : "Add to cart"}
        </button>
      </div>
    </article>
  );
}
