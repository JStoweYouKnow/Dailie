import { useState, useRef, useEffect } from "react";
import { X, Plus, Check, ChevronDown, Paperclip, Trash2, Upload, Film, Search } from "lucide-react";
import { initials, colorForName, dateInputValue, tsFromDateInput } from "../lib/format";
import { uploadFile, formatBytes, fileSrc } from "../lib/files";

export function Stat({ label, value, accent, onClick }) {
  return (
    <div onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
      <div className="md-mono" style={{ fontSize: 24, fontWeight: 700, color: accent || "var(--bone)" }}>{value}</div>
      <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".12em" }}>{label}</div>
    </div>
  );
}

export function LoadingState() {
  return (
    <div style={{ padding: "60px 0", textAlign: "center", color: "var(--dim)" }}>
      <Film size={22} className="md-spin" style={{ marginBottom: 10, color: "var(--accent)" }} />
      <div className="md-mono" style={{ fontSize: 12, letterSpacing: ".08em" }}>LOADING DAILIE BOARD…</div>
    </div>
  );
}

export function EmptyState({ title, subtitle, action }) {
  return (
    <div style={{ padding: "48px 20px", textAlign: "center", border: "1px dashed var(--rule-bright)", borderRadius: 12, background: "var(--panel)" }}>
      <div className="md-display" style={{ fontSize: 16, marginBottom: 6, color: "var(--bone)" }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--dim)" }}>{subtitle}</div>
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

export function ModalShell({ title, subtitle, onClose, children, wide }) {
  return (
    <div className="md-overlay" onClick={onClose}>
      <div className="md-modal" onClick={(e) => e.stopPropagation()} style={wide ? { maxWidth: 860 } : undefined}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px", borderBottom: "1px solid var(--rule)", position: "sticky", top: 0, background: "var(--panel)", zIndex: 2, borderRadius: "16px 16px 0 0" }}>
          <div style={{ minWidth: 0 }}>
            <div className="md-display" style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
            {subtitle && <div className="md-mono" style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>{subtitle}</div>}
          </div>
          <button className="md-btn md-btn-ghost" onClick={onClose} style={{ padding: 6 }}><X size={16} /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", marginBottom: 6 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 5 }}>{hint}</div>}
    </div>
  );
}

export function Section({ title, right, children, style }) {
  return (
    <div style={{ marginBottom: 26, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div className="md-mono" style={{ fontSize: 11, color: "var(--accent)", letterSpacing: ".14em", fontWeight: 600 }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

export function ViewHeader({ count, label, children }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
      <div className="md-mono" style={{ fontSize: 11, color: "var(--dim)", letterSpacing: ".12em" }}>
        {count != null ? `${count} ` : ""}{label}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>{children}</div>
    </div>
  );
}

export function Badge({ label, color, subtle, icon, style }) {
  return (
    <span className="md-mono" style={{
      display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700,
      padding: "3px 9px", borderRadius: 100, whiteSpace: "nowrap",
      background: subtle ? "var(--panel-raised)" : `${color || "#9a968e"}26`,
      color: subtle ? "var(--dim)" : (color || "var(--dim)"),
      border: `1px solid ${subtle ? "var(--rule)" : `${color || "#9a968e"}55`}`,
      ...style,
    }}>
      {icon}{label}
    </span>
  );
}

export function FilterChips({ options, value, onChange, allLabel }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      {allLabel && (
        <div className={"md-chip" + (value === "all" ? " active" : "")} role="button" tabIndex={0}
          onClick={() => onChange("all")} onKeyDown={(e) => { if (e.key === "Enter") onChange("all"); }}>{allLabel}</div>
      )}
      {options.map((o) => (
        <div key={o.key} className={"md-chip" + (value === o.key ? " active" : "")} role="button" tabIndex={0}
          onClick={() => onChange(o.key)} onKeyDown={(e) => { if (e.key === "Enter") onChange(o.key); }}
          style={value === o.key && o.color ? { background: o.color, borderColor: o.color, color: "var(--ink)" } : undefined}>
          {o.label}{o.count != null ? ` · ${o.count}` : ""}
        </div>
      ))}
    </div>
  );
}

export function Avatar({ name, size = 28, title }) {
  const color = colorForName(name);
  return (
    <div title={title || name} style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: `${color}2e`, border: `1px solid ${color}`, color,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: Math.max(9, size * 0.36), fontWeight: 800, fontFamily: "var(--font-mono)",
    }}>{initials(name)}</div>
  );
}

export function AvatarStack({ names, size = 24, max = 4 }) {
  const list = (names || []).filter(Boolean);
  if (!list.length) return <span style={{ fontSize: 12, color: "var(--dim)" }}>Unassigned</span>;
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      {list.slice(0, max).map((n, i) => (
        <div key={n + i} style={{ marginLeft: i === 0 ? 0 : -8 }}><Avatar name={n} size={size} /></div>
      ))}
      {list.length > max && (
        <span className="md-mono" style={{ fontSize: 10, color: "var(--dim)", marginLeft: 6 }}>+{list.length - max}</span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Inline editors — everything on a record is editable in place.
 * ------------------------------------------------------------------ */

export function InlineText({ value, onCommit, placeholder = "—", multiline, style, mono }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  useEffect(() => { setDraft(value || ""); }, [value]);

  const commit = () => {
    setEditing(false);
    if ((draft || "") !== (value || "")) onCommit(draft);
  };

  if (editing) {
    const Tag = multiline ? "textarea" : "input";
    return (
      <Tag
        className={multiline ? "md-textarea" : "md-input"}
        autoFocus
        rows={multiline ? 3 : undefined}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !multiline) commit();
          if (e.key === "Escape") { setDraft(value || ""); setEditing(false); }
        }}
        style={{ fontSize: 13, ...style }}
      />
    );
  }

  return (
    <div
      className={mono ? "md-mono" : undefined}
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => { if (e.key === "Enter") setEditing(true); }}
      title="Click to edit"
      style={{
        cursor: "text", borderRadius: 6, padding: "3px 6px", margin: "-3px -6px",
        minHeight: 22, color: value ? "var(--bone)" : "var(--dim-2)",
        whiteSpace: multiline ? "pre-wrap" : "nowrap",
        overflow: multiline ? "visible" : "hidden", textOverflow: "ellipsis",
        transition: "background .15s", fontSize: 13, ...style,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--panel-hover)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {value || placeholder}
    </div>
  );
}

export function InlineSelect({ value, options, onCommit, placeholder = "—", color }) {
  return (
    <select
      className="md-select"
      value={value == null ? "" : value}
      onChange={(e) => onCommit(e.target.value || null)}
      onClick={(e) => e.stopPropagation()}
      style={{
        padding: "4px 8px", fontSize: 12, width: "auto", minWidth: 90, cursor: "pointer",
        background: "transparent", borderColor: color || "var(--rule)", color: color || "var(--bone)", fontWeight: 600,
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
    </select>
  );
}

export function InlineDate({ value, onCommit }) {
  return (
    <input
      type="date"
      className="md-input"
      value={dateInputValue(value)}
      onChange={(e) => onCommit(tsFromDateInput(e.target.value))}
      onClick={(e) => e.stopPropagation()}
      style={{ padding: "4px 8px", fontSize: 12, width: "auto", background: "transparent" }}
    />
  );
}

/** Checkbox list of team members, used everywhere an assignment is made. */
export function MemberPicker({ team, selectedIds, onChange, label = "Assignees" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    // Escape closes the picker without closing the modal behind it.
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const toggle = (id) => {
    const next = selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
    onChange(next);
  };
  const names = team.filter((m) => selectedIds.includes(m.id)).map((m) => m.name);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="md-btn md-btn-ghost" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-label={names.length ? `${label}: ${names.join(", ")}` : label}
        title={names.length ? names.join(", ") : label}
        style={{ padding: "4px 8px", gap: 6, border: "1px solid var(--rule)", width: "100%", justifyContent: "space-between" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {names.length ? <AvatarStack names={names} size={20} max={3} /> : <span style={{ fontSize: 12, color: "var(--dim)" }}>{label}</span>}
        </span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div style={{
          position: "absolute", zIndex: 30, top: "calc(100% + 4px)", left: 0, minWidth: 210,
          background: "var(--panel-raised)", border: "1px solid var(--rule-bright)", borderRadius: 10,
          boxShadow: "var(--shadow-lg)", padding: 6, maxHeight: 260, overflowY: "auto",
        }}>
          {team.length === 0 && <div style={{ fontSize: 12, color: "var(--dim)", padding: 8 }}>Add team members in Settings.</div>}
          {team.map((m) => (
            <div key={m.id} role="button" tabIndex={0}
              onClick={(e) => { e.stopPropagation(); toggle(m.id); }}
              onKeyDown={(e) => { if (e.key === "Enter") toggle(m.id); }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--panel-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
              <Avatar name={m.name} size={22} />
              <span style={{ flex: 1, color: "var(--bone)" }}>{m.name}</span>
              {selectedIds.includes(m.id) && <Check size={14} color="var(--accent)" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Table
 * ------------------------------------------------------------------ */

export function DataTable({ columns, rows, onRowClick, empty, rowKey = (r) => r.id }) {
  if (!rows.length) return empty || <EmptyState title="Nothing here yet" subtitle="Records you add will show up in this table." />;
  return (
    <div className="md-scroll" style={{ overflowX: "auto", border: "1px solid var(--rule)", borderRadius: 12, background: "var(--panel)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "var(--panel-raised)", borderBottom: "1px solid var(--rule)" }}>
            {columns.map((c) => (
              <th key={c.key} className="md-mono" style={{ padding: "12px 16px", fontSize: 10, color: "var(--dim)", fontWeight: 700, letterSpacing: ".08em", whiteSpace: "nowrap", width: c.width }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              style={{ borderBottom: "1px solid var(--rule)", cursor: onRowClick ? "pointer" : "default" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--panel-raised)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
              {columns.map((c) => (
                <td key={c.key} style={{ padding: "11px 16px", verticalAlign: "middle", ...(c.cellStyle || {}) }}
                  onClick={c.stopClick ? (e) => e.stopPropagation() : undefined}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Kanban with drag and drop between columns
 * ------------------------------------------------------------------ */

export function KanbanBoard({ columns, items, columnOf, onMove, renderCard, onAddColumn, onRenameColumn, onRemoveColumn, emptyHint }) {
  const [dragId, setDragId] = useState(null);
  const [overColumn, setOverColumn] = useState(null);
  // The drag payload is the source of truth on drop; `dragId` state only dims the card,
  // and a ref backs it up for browsers that withhold dataTransfer outside a real drag.
  const dragIdRef = useRef(null);

  const startDrag = (e, id) => {
    dragIdRef.current = id;
    setDragId(id);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", id); } catch (err) { /* older Edge */ }
    }
  };

  const endDrag = (e, columnKey) => {
    e.preventDefault();
    setOverColumn(null);
    let id = dragIdRef.current;
    if (e.dataTransfer) {
      const payload = e.dataTransfer.getData("text/plain");
      if (payload) id = payload;
    }
    if (id) onMove(id, columnKey);
    dragIdRef.current = null;
    setDragId(null);
  };

  return (
    <div className="md-scroll" style={{ display: "flex", gap: 14, overflowX: "auto", paddingBottom: 14, alignItems: "flex-start" }}>
      {columns.map((col) => {
        const cards = items.filter((i) => columnOf(i) === col.key);
        const isOver = overColumn === col.key;
        return (
          <div key={col.key}
            data-kanban-column={col.key}
            onDragOver={(e) => { e.preventDefault(); setOverColumn(col.key); }}
            onDragLeave={() => setOverColumn((c) => (c === col.key ? null : c))}
            onDrop={(e) => endDrag(e, col.key)}
            style={{
              minWidth: 262, flex: "0 0 262px", borderRadius: 12, padding: 8,
              background: isOver ? "var(--panel-raised)" : "transparent",
              border: `1px dashed ${isOver ? col.color : "transparent"}`,
              transition: "background .15s, border-color .15s",
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, padding: "0 4px" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.color, flexShrink: 0 }} />
              {onRenameColumn ? (
                <div style={{ flex: 1, minWidth: 0 }}>
                  <InlineText value={col.label} mono onCommit={(v) => onRenameColumn(col.key, v)}
                    style={{ fontSize: 11, letterSpacing: ".1em", color: "var(--dim)", fontWeight: 600, textTransform: "uppercase" }} />
                </div>
              ) : (
                <span className="md-mono" style={{ flex: 1, fontSize: 11, letterSpacing: ".1em", color: "var(--dim)", fontWeight: 600 }}>{col.label.toUpperCase()}</span>
              )}
              <span className="md-mono" style={{ fontSize: 11, color: "var(--dim)" }}>{cards.length}</span>
              {onRemoveColumn && (
                <button className="md-btn md-btn-ghost" title="Remove column" style={{ padding: 2 }}
                  onClick={() => onRemoveColumn(col.key)}><X size={12} /></button>
              )}
            </div>
            {cards.map((item) => (
              <div key={item.id} draggable
                onDragStart={(e) => startDrag(e, item.id)}
                onDragEnd={() => { dragIdRef.current = null; setDragId(null); setOverColumn(null); }}
                style={{ opacity: dragId === item.id ? 0.4 : 1, cursor: "grab" }}>
                {renderCard(item)}
              </div>
            ))}
            {cards.length === 0 && (
              <div style={{ fontSize: 11, color: "var(--dim-2)", padding: "14px 6px", textAlign: "center", border: "1px dashed var(--rule)", borderRadius: 10 }}>
                {emptyHint || "Drop here"}
              </div>
            )}
          </div>
        );
      })}
      {onAddColumn && (
        <button className="md-btn md-btn-ghost" onClick={onAddColumn}
          style={{ flex: "0 0 auto", border: "1px dashed var(--rule-bright)", height: 40, marginTop: 2 }}>
          <Plus size={13} /> Add column
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Attachments
 * ------------------------------------------------------------------ */

export function FileAttachButton({ onUploaded, kind = "documents", label = "Attach file", accept, compact }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handle = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const meta = await uploadFile(file, kind);
      onUploaded(meta);
    } catch (err) {
      setError(err.message || "Upload failed.");
    }
    setBusy(false);
  };

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button className="md-btn md-btn-ghost" onClick={() => inputRef.current && inputRef.current.click()} disabled={busy}
        style={{ border: "1px solid var(--rule)", padding: compact ? "3px 8px" : undefined, fontSize: compact ? 11 : 13 }}>
        <Upload size={compact ? 11 : 13} /> {busy ? "Uploading…" : label}
      </button>
      <input ref={inputRef} type="file" accept={accept} onChange={handle} style={{ display: "none" }} />
      {error && <span style={{ fontSize: 11, color: "var(--red)", maxWidth: 260 }}>{error}</span>}
    </span>
  );
}

export function AttachmentRow({ record, onRemove }) {
  const src = fileSrc(record);
  if (!record || !record.fileName) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "6px 10px", background: "var(--panel-raised)", border: "1px solid var(--rule)", borderRadius: 8 }}>
      <Paperclip size={13} color="var(--accent)" />
      <a href={src} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "none", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {record.fileName}
      </a>
      {record.fileSize ? <span className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>{formatBytes(record.fileSize)}</span> : null}
      {onRemove && <button className="md-btn md-btn-ghost" style={{ padding: 3 }} onClick={onRemove}><Trash2 size={12} /></button>}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }) {
  return (
    <div style={{ position: "relative", minWidth: 180 }}>
      <Search size={14} color="var(--dim)" style={{ position: "absolute", left: 12, top: 11 }} />
      <input className="md-input" style={{ paddingLeft: 34, fontSize: 12 }} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function ConfirmButton({ label = "Delete", confirmLabel = "Confirm delete", onConfirm, icon }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button className="md-btn md-btn-ghost"
      onClick={(e) => { e.stopPropagation(); if (armed) onConfirm(); else setArmed(true); }}
      style={{ color: armed ? "var(--red)" : "var(--dim)", borderColor: armed ? "var(--red)" : "transparent", border: armed ? "1px solid var(--red)" : undefined, fontSize: 12 }}>
      {icon || <Trash2 size={13} />} {armed ? confirmLabel : label}
    </button>
  );
}
