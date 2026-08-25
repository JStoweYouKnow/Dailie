import { useState, useRef, useEffect } from "react";
import { X, Plus, Check, ChevronDown, Paperclip, Trash2, Upload, Film, Search, GripVertical, RotateCcw, Download } from "lucide-react";
import { initials, colorForName, dateInputValue, tsFromDateInput } from "../lib/format";
import { looksLikeMarkdown } from "../lib/textFormats";
import { useStore } from "../lib/store";
import { useAccount } from "../lib/auth";
import { canExportBoard, downloadTableCsv, downloadTablePdf, exportEmailFromSession } from "../lib/tableExport";
import Markdown from "./Markdown";
import {
  uploadFile, deleteFile, formatBytes, fileSrc, kindForFile, asAttachment,
  listAttachments, trashedAttachments, PRESS_FILE_ACCEPT,
} from "../lib/files";

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
    <div style={{ padding: "48px 20px", textAlign: "center", border: "1px solid var(--bone)", background: "var(--panel)" }}>
      <div className="md-display" style={{ fontSize: 16, marginBottom: 6, color: "var(--bone)" }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--dim)" }}>{subtitle}</div>
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

export function ModalShell({ title, subtitle, status, onClose, children, wide }) {
  return (
    <div className="md-overlay" onClick={onClose}>
      <div className="md-modal" onClick={(e) => e.stopPropagation()} style={wide ? { maxWidth: 860 } : undefined}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px", borderBottom: "1px solid var(--rule)", position: "sticky", top: 0, background: "var(--panel)", zIndex: 2 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
              <div className="md-display" style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
              {status}
            </div>
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
        <div className="md-mono" style={{ fontSize: 10, color: "var(--dim-2)", letterSpacing: ".14em", fontWeight: 600 }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}

export function ViewHeader({ count, label, children }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
      <div className="md-mono" style={{ fontSize: 10.5, color: "var(--dim-2)", letterSpacing: ".1em" }}>
        {count != null ? `${count} ` : ""}{label}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>{children}</div>
    </div>
  );
}

/** CSV and PDF of the rows currently on screen — filtered lists included. */
export function ExportMenu({ title, columns, rows }) {
  const { data, companyName, projectName, memberName, currentUser } = useStore();
  const { enabled: authEnabled, account } = useAccount();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const exportEmail = exportEmailFromSession({ authEnabled, account, currentUser });

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!rows || !rows.length) return null;
  if (!canExportBoard(exportEmail)) return null;

  const ctx = { data, companyName, projectName, memberName, exportEmail };
  const run = (kind) => {
    if (kind === "csv") downloadTableCsv(title, columns, rows, ctx);
    else downloadTablePdf(title, columns, rows, ctx);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="md-btn md-btn-ghost" style={{ border: "1px solid var(--rule)" }} onClick={() => setOpen((v) => !v)}>
        <Download size={13} /> Export
        <ChevronDown size={11} />
      </button>
      {open && (
        <div style={{
          position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 20, minWidth: 180,
          background: "var(--panel)", border: "1px solid var(--bone)",
          boxShadow: "var(--shadow-lg)", padding: 6,
        }}>
          <button className="md-btn md-btn-ghost" style={{ width: "100%", justifyContent: "flex-start", fontSize: 12 }} onClick={() => run("csv")}>
            CSV spreadsheet
          </button>
          <button className="md-btn md-btn-ghost" style={{ width: "100%", justifyContent: "flex-start", fontSize: 12 }} onClick={() => run("pdf")}>
            PDF for printing
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Quiet by default: a dot of colour and plain text, rather than a filled pill. A
 * table full of filled pills reads as noise, and then nothing stands out when it
 * matters. Pass `solid` for the few states that genuinely need to be loud.
 */
export function Badge({ label, color, subtle, icon, style, solid }) {
  const hue = color || "var(--dim)";
  return (
    <span className="md-mono" title={typeof label === "string" ? label : undefined} style={{
      display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 600,
      padding: solid ? "3px 9px" : "2px 0", borderRadius: 0, whiteSpace: "nowrap",
      maxWidth: "100%", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
      background: solid ? `${hue}22` : "transparent",
      color: subtle ? "var(--dim)" : hue,
      border: solid ? `1px solid ${hue}55` : "none",
      ...style,
    }}>
      {icon}
      {!icon && !subtle && color && (
        <span style={{ width: 6, height: 6, background: hue, flexShrink: 0 }} />
      )}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
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
      width: size, height: size, flexShrink: 0,
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

export function InlineText({ value, onCommit, placeholder = "—", multiline, style, mono, markdown }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  // Take the incoming value only while idle. On a shared board someone else's edit
  // can land mid-sentence, and resyncing then would wipe what you are typing.
  useEffect(() => { if (!editing) setDraft(value || ""); }, [value, editing]);

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

  // Imported documents can keep their formatting, so a note that carries Markdown is
  // rendered rather than shown as raw syntax — until you click into it to edit.
  const showRendered = markdown && multiline && value && looksLikeMarkdown(value);

  return (
    <div
      className={mono ? "md-mono" : undefined}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        // A link inside rendered Markdown should open, not drop you into an editor.
        if (e.target.closest && e.target.closest("a")) return;
        setEditing(true);
      }}
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
      {showRendered ? <Markdown source={value} compact /> : (value || placeholder)}
    </div>
  );
}

export function InlineSelect({ value, options, onCommit, placeholder = "—", color }) {
  const selected = options.find((o) => o.key === value || String(o.key) === String(value));
  const label = selected ? selected.label : placeholder;
  return (
    <select
      className="md-select"
      value={value == null ? "" : value}
      onChange={(e) => onCommit(e.target.value || null)}
      onClick={(e) => e.stopPropagation()}
      title={typeof label === "string" ? label : undefined}
      // Stay inside the cell: native selects size to the selected option, which is
      // how long project names used to spill into the next field.
      style={{
        padding: "4px 22px 4px 7px", fontSize: 12, display: "block",
        width: "100%", maxWidth: "100%", minWidth: 0, cursor: "pointer",
        background: "transparent", border: "1px solid transparent", borderRadius: 6,
        color: color || "var(--bone)", fontWeight: 500,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--rule)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; }}
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
      style={{ padding: "4px 7px", fontSize: 12, width: "auto", background: "transparent", border: "1px solid transparent", borderRadius: 6, color: "var(--dim)" }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--rule)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; }}
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

/** Multi-select chips with type-to-add, used for roster disciplines and similar lists. */
export function TagPicker({ values = [], options = [], onChange, placeholder = "Add", allowCreate = true }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const selected = values.map((v) => String(v || "").trim()).filter(Boolean);
  const typed = query.trim();
  const typedKey = typed.toLowerCase();
  const matches = options.filter((o) => !typedKey || o.toLowerCase().includes(typedKey));
  const alreadyHasTyped = typed && selected.some((s) => s.toLowerCase() === typedKey);
  const presetHasTyped = typed && options.some((o) => o.toLowerCase() === typedKey);
  const canCreate = allowCreate && typed && !alreadyHasTyped && !presetHasTyped;

  const add = (label) => {
    const clean = String(label || "").trim();
    if (!clean || selected.some((s) => s.toLowerCase() === clean.toLowerCase())) return;
    onChange([...selected, clean]);
    setQuery("");
  };
  const remove = (label) => onChange(selected.filter((s) => s !== label));
  const toggle = (label) => {
    if (selected.some((s) => s.toLowerCase() === label.toLowerCase())) remove(label);
    else add(label);
  };

  return (
    <div ref={ref} style={{ position: "relative", minWidth: 160 }} onClick={(e) => e.stopPropagation()}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => { setOpen(true); requestAnimationFrame(() => inputRef.current && inputRef.current.focus()); }}
        onKeyDown={(e) => { if (e.key === "Enter") { setOpen(true); requestAnimationFrame(() => inputRef.current && inputRef.current.focus()); } }}
        style={{
          display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", minHeight: 34,
          padding: "4px 8px", border: "1px solid var(--rule)", borderRadius: 8,
          background: "var(--panel-raised)", cursor: "text",
        }}
      >
        {selected.map((label) => (
          <span key={label} className="md-mono" style={{
            display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600,
            padding: "2px 7px", borderRadius: 100, background: "var(--panel-hover)", color: "var(--bone)",
            border: "1px solid var(--rule)",
          }}>
            {label}
            <button
              type="button"
              className="md-btn md-btn-ghost"
              aria-label={`Remove ${label}`}
              style={{ padding: 0, width: 14, height: 14, minWidth: 14, border: "none" }}
              onClick={(e) => { e.stopPropagation(); remove(label); }}
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          className="md-input"
          value={query}
          placeholder={selected.length ? "" : placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (canCreate) add(typed);
              else if (matches[0] && !selected.some((s) => s.toLowerCase() === matches[0].toLowerCase())) add(matches[0]);
              else if (presetHasTyped) add(typed);
            } else if (e.key === "Backspace" && !query && selected.length) {
              remove(selected[selected.length - 1]);
            }
          }}
          style={{
            flex: 1, minWidth: 80, border: "none", background: "transparent", padding: "2px 0",
            fontSize: 12, boxShadow: "none",
          }}
        />
      </div>
      {open && (matches.length > 0 || canCreate) && (
        <div style={{
          position: "absolute", zIndex: 40, top: "calc(100% + 4px)", left: 0, right: 0, minWidth: 210,
          background: "var(--panel-raised)", border: "1px solid var(--rule-bright)", borderRadius: 10,
          boxShadow: "var(--shadow-lg)", padding: 6, maxHeight: 260, overflowY: "auto",
        }}>
          {matches.map((label) => {
            const on = selected.some((s) => s.toLowerCase() === label.toLowerCase());
            return (
              <div key={label} role="button" tabIndex={0}
                onClick={(e) => { e.stopPropagation(); toggle(label); }}
                onKeyDown={(e) => { if (e.key === "Enter") toggle(label); }}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, cursor: "pointer", fontSize: 13 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--panel-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
                <span style={{ flex: 1, color: "var(--bone)" }}>{label}</span>
                {on && <Check size={14} color="var(--accent)" />}
              </div>
            );
          })}
          {canCreate && (
            <div role="button" tabIndex={0}
              onClick={(e) => { e.stopPropagation(); add(typed); }}
              onKeyDown={(e) => { if (e.key === "Enter") add(typed); }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, cursor: "pointer", fontSize: 13, color: "var(--accent)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--panel-hover)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
              <Plus size={13} /> Add “{typed}”
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Table
 * ------------------------------------------------------------------ */

export function DataTable({ columns, rows, onRowClick, empty, rowKey = (r) => r.id, onReorderColumns, exportTitle, hideExport }) {
  const [dragKey, setDragKey] = useState(null);
  const [overKey, setOverKey] = useState(null);

  if (!rows.length) return empty || <EmptyState title="Nothing here yet" subtitle="Records you add will show up in this table." />;

  const headerDragProps = (c) => (onReorderColumns && c.label ? {
    draggable: true,
    onDragStart: (e) => {
      setDragKey(c.key);
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", c.key); } catch (err) { /* older Edge */ }
      }
    },
    onDragOver: (e) => { e.preventDefault(); setOverKey(c.key); },
    onDragLeave: () => setOverKey((k) => (k === c.key ? null : k)),
    onDrop: (e) => {
      e.preventDefault();
      const from = (e.dataTransfer && e.dataTransfer.getData("text/plain")) || dragKey;
      if (from && from !== c.key) onReorderColumns(from, c.key);
      setDragKey(null);
      setOverKey(null);
    },
    onDragEnd: () => { setDragKey(null); setOverKey(null); },
    title: `Drag to reorder “${c.label}”`,
  } : {});

  return (
    <div>
      {!hideExport && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
          <ExportMenu title={exportTitle || "Table"} columns={columns} rows={rows} />
        </div>
      )}
      <div className="md-scroll" style={{ overflowX: "auto", border: "1px solid var(--bone)", background: "var(--panel)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "var(--panel-raised)", borderBottom: "1px solid var(--rule)" }}>
            {columns.map((c) => (
              <th key={c.key} className="md-mono" data-column={c.key} {...headerDragProps(c)}
                style={{
                  padding: "10px 14px", fontSize: 9.5, color: "var(--dim-2)", fontWeight: 600,
                  letterSpacing: ".1em", whiteSpace: "nowrap", width: c.width,
                  cursor: onReorderColumns && c.label ? "grab" : undefined,
                  opacity: dragKey === c.key ? 0.4 : 1,
                  boxShadow: overKey === c.key && dragKey && dragKey !== c.key ? "inset 2px 0 0 var(--accent)" : undefined,
                }}>
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
                <td key={c.key} style={{ padding: "10px 14px", verticalAlign: "middle", ...(c.cellStyle || {}) }}
                  onClick={c.stopClick ? (e) => e.stopPropagation() : undefined}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Kanban with drag and drop between columns
 * ------------------------------------------------------------------ */

// Cards and columns are dropped on the same targets, so the payload says which is moving.
const COLUMN_DRAG = "column:";

export function KanbanBoard({ columns, items, columnOf, onMove, renderCard, onAddColumn, onRenameColumn, onRemoveColumn, onReorderColumns, emptyHint }) {
  const [dragId, setDragId] = useState(null);
  const [dragColumn, setDragColumn] = useState(null);
  const [overColumn, setOverColumn] = useState(null);
  // The drag payload is the source of truth on drop; the state above only drives the
  // visuals, and a ref backs it up for browsers that withhold dataTransfer mid-drag.
  const payloadRef = useRef(null);

  const setPayload = (e, value) => {
    payloadRef.current = value;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", value); } catch (err) { /* older Edge */ }
    }
  };

  const startDrag = (e, id) => {
    setDragId(id);
    setPayload(e, id);
  };

  const startColumnDrag = (e, key) => {
    e.stopPropagation();
    setDragColumn(key);
    setPayload(e, COLUMN_DRAG + key);
  };

  const clearDrag = () => {
    payloadRef.current = null;
    setDragId(null);
    setDragColumn(null);
    setOverColumn(null);
  };

  const endDrag = (e, columnKey) => {
    e.preventDefault();
    let payload = payloadRef.current;
    if (e.dataTransfer) {
      const fromEvent = e.dataTransfer.getData("text/plain");
      if (fromEvent) payload = fromEvent;
    }
    if (payload && payload.startsWith(COLUMN_DRAG)) {
      const fromKey = payload.slice(COLUMN_DRAG.length);
      if (onReorderColumns && fromKey !== columnKey) onReorderColumns(fromKey, columnKey);
    } else if (payload) {
      onMove(payload, columnKey);
    }
    clearDrag();
  };

  return (
    // Columns stretch to a common height: with flex-start each one ended where its
    // last card did, so the empty space below was not a drop target and a card had
    // to be released precisely on the stack.
    <div className="md-scroll" style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 14, alignItems: "stretch", minHeight: 340 }}>
      {columns.map((col) => {
        const cards = items.filter((i) => columnOf(i) === col.key);
        const isOver = overColumn === col.key;
        return (
          <div key={col.key}
            data-kanban-column={col.key}
            onDragOver={(e) => {
              e.preventDefault();
              // Without this the cursor shows "no drop" over most of the column.
              if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
              if (overColumn !== col.key) setOverColumn(col.key);
            }}
            onDragLeave={(e) => {
              // dragleave also fires when the pointer crosses onto a card inside this
              // column, which used to clear the target and make the drop miss.
              if (e.currentTarget.contains(e.relatedTarget)) return;
              setOverColumn((c) => (c === col.key ? null : c));
            }}
            onDrop={(e) => endDrag(e, col.key)}
            style={{
              minWidth: 262, flex: "0 0 262px", borderRadius: 12, padding: 8,
              display: "flex", flexDirection: "column",
              background: isOver ? "var(--panel-raised)" : "transparent",
              border: `1px dashed ${isOver && !dragColumn ? col.color : "transparent"}`,
              opacity: dragColumn === col.key ? 0.4 : 1,
              // While a column is in flight, show where it would land rather than a drop zone.
              borderLeft: isOver && dragColumn && dragColumn !== col.key ? `3px solid ${col.color}` : undefined,
              transition: "background .15s, border-color .15s, opacity .15s",
            }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, padding: "0 4px" }}>
              {onReorderColumns ? (
                <span draggable
                  onDragStart={(e) => startColumnDrag(e, col.key)}
                  onDragEnd={clearDrag}
                  title={`Drag to reorder “${col.label}”`}
                  aria-label={`Reorder column ${col.label}`}
                  style={{ display: "flex", alignItems: "center", cursor: "grab", color: "var(--dim-2)", flexShrink: 0, marginRight: -2 }}>
                  <GripVertical size={13} />
                </span>
              ) : null}
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
            {/* flex:1 makes everything below the last card part of the drop target. */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 60 }}>
              {cards.map((item) => (
                <div key={item.id} draggable
                  onDragStart={(e) => startDrag(e, item.id)}
                  onDragEnd={clearDrag}
                  style={{ opacity: dragId === item.id ? 0.4 : 1, cursor: "grab", minWidth: 0, overflow: "hidden" }}>
                  {renderCard(item)}
                </div>
              ))}

              {cards.length === 0 && !dragId && (
                <div style={{ fontSize: 11, color: "var(--dim-2)", padding: "14px 6px", textAlign: "center", border: "1px dashed var(--rule)", borderRadius: 10 }}>
                  {emptyHint || "Drop here"}
                </div>
              )}

              {/* A landing strip while a card is in flight, so the target is somewhere
                  to aim at rather than a guess. It fills the rest of the column. */}
              {dragId && !dragColumn && (
                <div style={{
                  flex: 1, minHeight: 56, marginTop: cards.length ? 2 : 0,
                  border: `1px dashed ${isOver ? col.color : "var(--rule)"}`,
                  background: isOver ? `${col.color}1f` : "transparent",
                  borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 600,
                  color: isOver ? col.color : "var(--dim-2)",
                  transition: "background .12s, border-color .12s, color .12s",
                }}>
                  {isOver ? `Move to ${col.label}` : ""}
                </div>
              )}
            </div>
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

export function FileAttachButton({ onUploaded, kind = "documents", label = "Attach file", accept, compact, multiple }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handle = async (e) => {
    const files = Array.from((e.target.files) || []);
    e.target.value = "";
    if (!files.length) return;
    setBusy(true);
    setError("");
    const errors = [];
    for (const file of files) {
      try {
        const meta = await uploadFile(file, kindForFile(file, kind));
        onUploaded(meta);
      } catch (err) {
        errors.push(files.length > 1 ? `${file.name}: ${err.message || "Upload failed."}` : (err.message || "Upload failed."));
      }
    }
    if (errors.length) setError(errors.join(" "));
    setBusy(false);
  };

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button className="md-btn md-btn-ghost" onClick={() => inputRef.current && inputRef.current.click()} disabled={busy}
        style={{ border: "1px solid var(--rule)", padding: compact ? "3px 8px" : undefined, fontSize: compact ? 11 : 13 }}>
        <Upload size={compact ? 11 : 13} /> {busy ? "Uploading…" : label}
      </button>
      <input ref={inputRef} type="file" accept={accept} multiple={multiple} onChange={handle} style={{ display: "none" }} />
      {error && <span style={{ fontSize: 11, color: "var(--red)", maxWidth: 280 }}>{error}</span>}
    </span>
  );
}

/**
 * `trashed` shows the row as removed-but-recoverable: the name stops being a live link,
 * and the actions become restore and permanent delete. Removing never destroys a blob —
 * only `onPurge` does, which is why it asks for confirmation.
 */
export function AttachmentRow({ record, onRemove, onRestore, onPurge, trashed }) {
  const src = fileSrc(record);
  if (!record || !record.fileName) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, fontSize: 12, padding: "6px 10px",
      background: "var(--panel-raised)", border: "1px solid var(--rule)", borderRadius: 8, minWidth: 0,
      opacity: trashed ? 0.62 : 1,
    }}>
      <Paperclip size={13} color={trashed ? "var(--dim)" : "var(--accent)"} style={{ flexShrink: 0 }} />
      {trashed ? (
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--dim)", textDecoration: "line-through" }}>
          {record.fileName}
        </span>
      ) : (
        <a href={src} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", textDecoration: "none", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {record.fileName}
        </a>
      )}
      {record.fileSize ? <span className="md-mono" style={{ fontSize: 10, color: "var(--dim)", flexShrink: 0 }}>{formatBytes(record.fileSize)}</span> : null}
      {onRestore && (
        <button className="md-btn md-btn-ghost" style={{ padding: "3px 7px", fontSize: 11, flexShrink: 0 }}
          onClick={onRestore} title="Put this back">
          <RotateCcw size={11} /> Restore
        </button>
      )}
      {onPurge && <ConfirmButton label="" confirmLabel="Delete for good?" onConfirm={onPurge} />}
      {onRemove && !trashed && (
        <button className="md-btn md-btn-ghost" style={{ padding: 3, flexShrink: 0 }} onClick={onRemove} title="Remove">
          <Trash2 size={12} />
        </button>
      )}
    </div>
  );
}

/**
 * `onRestore`/`onPurge` turn removal into a trash: without them the list behaves as it
 * always did and `onRemove` is final, which is what the unsaved modals want.
 */
export function AttachmentList({
  record, items, onAdd, onRemove, onRestore, onPurge,
  kind = "documents", accept = PRESS_FILE_ACCEPT, label = "Attach files", compact,
}) {
  const list = items || listAttachments(record);
  const trashed = onRestore || onPurge ? (record ? trashedAttachments(record) : []) : [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
      {list.map((item) => (
        <AttachmentRow key={item.id || item.filePath || item.fileName} record={item} onRemove={onRemove ? () => onRemove(item) : undefined} />
      ))}
      <FileAttachButton compact={compact} multiple kind={kind} label={label} accept={accept}
        onUploaded={(meta) => onAdd(asAttachment(meta))} />
      {trashed.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 2 }}>
          <div className="md-mono" style={{ fontSize: 9.5, color: "var(--dim-2)", letterSpacing: ".12em" }}>
            REMOVED — RESTORE OR DELETE FOR GOOD
          </div>
          {trashed.map((item) => (
            <AttachmentRow key={item.id} record={item} trashed
              onRestore={onRestore ? () => onRestore(item) : undefined}
              onPurge={onPurge ? () => onPurge(item) : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Contracts and invoices hold a single document directly on the record rather than in an
 * `attachments` array. `fileDeletedAt` trashes it in place: the record keeps pointing at
 * the blob, so the removal is reversible and nothing is orphaned until it is purged.
 */
export function SingleAttachmentCell({ record, onChange, accept, kind = "documents", label = "Upload" }) {
  const attach = (replacing) => (
    <FileAttachButton compact kind={kind} label={label} accept={accept}
      onUploaded={(meta) => {
        // Taking the slot from a trashed document is what finally discards it.
        if (replacing) deleteFile(record).catch(() => {});
        onChange({ ...meta, fileDeletedAt: null });
      }} />
  );
  if (!record.fileName) return attach(false);

  const trashed = !!record.fileDeletedAt;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <AttachmentRow
        record={record}
        trashed={trashed}
        onRemove={trashed ? undefined : () => onChange({ fileDeletedAt: Date.now() })}
        onRestore={trashed ? () => onChange({ fileDeletedAt: null }) : undefined}
        onPurge={trashed ? async () => {
          try {
            await deleteFile(record);
            onChange({ fileName: "", filePath: "", fileUrl: "", fileSize: 0, fileType: "", fileDeletedAt: null });
          } catch (err) { /* stay trashed so the delete can be retried */ }
        } : undefined}
      />
      {/* Attaching over a trashed document takes the slot, so that blob goes with it. */}
      {trashed && attach(true)}
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
