import { useState } from "react";
import { Check, Clipboard, Copy, Link2, PackageOpen, ShieldCheck, Trash2, X } from "lucide-react";
import { createCartCommand, createInstallCommand } from "../cart.js";

export default function InstallCart({ items, scope, onScopeChange, onRemove, onClear, onCopy }) {
  const [showShareCommand, setShowShareCommand] = useState(false);
  const [copied, setCopied] = useState(false);
  const command = items.length ? createInstallCommand(items, scope, window.location.href) : "Add an asset to generate your install command.";
  const shareCommand = items.length ? createCartCommand(items, scope, window.location.href) : "";

  const copy = async (value, kind) => {
    await onCopy(value, kind);
    setCopied(kind === "command");
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <aside className="cart-panel" id="install-cart">
      <div className="cart-panel-heading">
        <div className="cart-heading-icon"><PackageOpen size={19} /></div>
        <div className="cart-heading-copy"><span className="eyebrow-small">YOUR WORKSPACE</span><h2>Install cart</h2></div>
        <span className="cart-count">{items.length}</span>
      </div>
      <div className="cart-content">
        {items.length ? (
          <ul className="cart-items" aria-label="Selected items">
            {items.map((item) => <li className="cart-item" key={item}><span className="cart-item-dot" /><span className="cart-item-name" title={item}>{item}</span><button type="button" aria-label={`Remove ${item}`} onClick={() => onRemove(item)}><X size={14} /></button></li>)}
          </ul>
        ) : (
          <div className="cart-empty"><div className="cart-empty-icon"><PackageOpen size={19} /></div><strong>Your toolkit starts here</strong><span>Add a few community picks and they’ll be ready to install together.</span></div>
        )}

        <div className="scope-label">INSTALL SCOPE</div>
        <div className="scope-switch" role="group" aria-label="Install location">
          <button type="button" className={scope === "local" ? "selected" : ""} aria-pressed={scope === "local"} onClick={() => onScopeChange("local")}><span>Local</span><small>This repository</small></button>
          <button type="button" className={scope === "global" ? "selected" : ""} aria-pressed={scope === "global"} onClick={() => onScopeChange("global")}><span>Global</span><small>Copilot home</small></button>
        </div>

        <div className="command-heading"><span>One-command install</span>{items.length > 0 && <button className="text-button" type="button" onClick={onClear}><Trash2 size={12} /> Clear</button>}</div>
        <pre className={`command-preview${items.length ? "" : " is-placeholder"}`}>{command}</pre>
        <button className="copy-command-button" type="button" disabled={!items.length} onClick={() => copy(command, "command")}>
          {copied ? <Check size={16} /> : <Clipboard size={16} />}{copied ? "Copied to clipboard" : "Copy install command"}
        </button>
        <div className="cart-secondary-actions">
          <button type="button" disabled={!items.length} onClick={() => copy(window.location.href, "link")}><Link2 size={14} /> Copy share link</button>
          <button type="button" disabled={!items.length} onClick={() => setShowShareCommand((visible) => !visible)}><Copy size={14} /> {showShareCommand ? "Hide cart command" : "Cart command"}</button>
        </div>
        {showShareCommand && <pre className="share-command">{shareCommand}</pre>}
        <div className="cart-safety"><ShieldCheck size={16} /><span>Flagged content is blocked by the installer unless explicitly allowed. Review before installing.</span></div>
      </div>
    </aside>
  );
}
