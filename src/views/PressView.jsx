import { useMemo, useState } from "react";
import { Plus, Megaphone, ExternalLink, Paperclip } from "lucide-react";
import { useStore } from "../lib/store";
import { PRESS_KINDS, PRESS_STATUSES, lookupColor } from "../lib/model";
import {
  listAttachments, allAttachments, trashAttachment, restoreAttachment, purgeAttachment,
  PRESS_FILE_ACCEPT,
} from "../lib/files";
import { useDraftUploads } from "../lib/draftUploads";

import {
  ViewHeader, FilterChips, DataTable, EmptyState, Badge, Stat, Section,
  InlineText, InlineSelect, InlineDate, ModalShell, Field, ConfirmButton,
  AttachmentList,
} from "../ui/kit";

// These rewrite the whole array, so they work from `allAttachments` — using the visible
// list would quietly drop anything sitting in the trash.
function addAttachment(row, file) {
  return { attachments: [...allAttachments(row), file] };
}

function removeAttachment(row, item) {
  return { attachments: trashAttachment(row, item) };
}

function undoRemove(row, item) {
  return { attachments: restoreAttachment(row, item) };
}

function purge(row, item) {
  return purgeAttachment(row, item).then((attachments) => ({ attachments }));
}

function NewPressModal({ onClose, defaultKind }) {
  const { data, add, currentUser } = useStore();
  const drafts = useDraftUploads();
  const [form, setForm] = useState({
    kind: defaultKind && defaultKind !== "all" ? defaultKind : "outlet",
    title: "", outlet: "", journalist: "", email: "", url: "", status: "pitching",
    projectId: "", notes: "",
  });
  const [files, setFiles] = useState([]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.title.trim() && !form.outlet.trim()) return;
    add("press", {
      ...form,
      title: form.title.trim() || form.outlet.trim(),
      notes: form.notes.trim(),
      projectId: form.projectId || null,
      ownerId: (currentUser && currentUser.id) || null,
      publishedAt: null,
      scheduledFor: null,
      attachments: files,
    });
    drafts.markSaved();
    onClose();
  };

  return (
    <ModalShell title="New Press Record" onClose={onClose}>
      <Field label="TYPE">
        <select className="md-select" value={form.kind} onChange={set("kind")}>
          {PRESS_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
      </Field>
      <Field label="TITLE"><input className="md-input" autoFocus value={form.title} onChange={set("title")} placeholder="Headline, or what this is" /></Field>
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="OUTLET"><input className="md-input" value={form.outlet} onChange={set("outlet")} placeholder="e.g. Variety" /></Field>
        <Field label="JOURNALIST"><input className="md-input" value={form.journalist} onChange={set("journalist")} placeholder="Who we deal with" /></Field>
      </div>
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="EMAIL"><input className="md-input" value={form.email} onChange={set("email")} placeholder="name@outlet.com" /></Field>
        <Field label="STATUS">
          <select className="md-select" value={form.status} onChange={set("status")}>
            {PRESS_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="LINK"><input className="md-input" value={form.url} onChange={set("url")} placeholder="https://" /></Field>
      <Field label="PROJECT">
        <select className="md-select" value={form.projectId} onChange={set("projectId")}>
          <option value="">No project</option>
          {data.projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </Field>
      <Field label="NOTES" hint="Pitch angle, embargo, who still needs to approve.">
        <textarea className="md-textarea" rows={4} value={form.notes} onChange={set("notes")}
          placeholder="What was said, what is next, embargo, talking points…" />
      </Field>
      <Field label="ATTACHMENTS" hint="Press kit, release copy, approved stills. PNG, JPG, PDF, Word, ZIP — more than one is fine.">
        <AttachmentList
          items={files}
          accept={PRESS_FILE_ACCEPT}
          label="Add files"
          onAdd={(file) => { if (drafts.keep(file)) setFiles((list) => [...list, file]); }}
          onRemove={(item) => { drafts.drop(item); setFiles((list) => list.filter((f) => f.id !== item.id)); }}
        />
      </Field>
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>Save</button>
    </ModalShell>
  );
}

export default function PressView({ searchQuery }) {
  const { data, update, remove } = useStore();
  const [kindFilter, setKindFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);

  const rows = useMemo(() => {
    let list = [...(data.press || [])];
    if (kindFilter !== "all") list = list.filter((r) => r.kind === kindFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((r) =>
        (r.title || "").toLowerCase().includes(q) ||
        (r.outlet || "").toLowerCase().includes(q) ||
        (r.journalist || "").toLowerCase().includes(q) ||
        (r.notes || "").toLowerCase().includes(q));
    }
    return list.sort((a, b) => (b.publishedAt || b.scheduledFor || b.createdAt || 0) - (a.publishedAt || a.scheduledFor || a.createdAt || 0));
  }, [data.press, kindFilter, searchQuery]);

  const all = data.press || [];
  const kits = all.filter((r) => r.kind === "kit");
  const published = all.filter((r) => r.status === "published");
  const scheduled = all.filter((r) => r.status === "scheduled");
  const talking = all.filter((r) => r.status === "pitching" || r.status === "in-talks");

  const columns = [
    { key: "title", label: "TITLE", cellStyle: { minWidth: 230 }, stopClick: true, render: (r) => (
      <div>
        <InlineText value={r.title} style={{ fontWeight: 700 }} onCommit={(v) => update("press", r.id, { title: v })} />
        {r.url && (
          <a href={r.url} target="_blank" rel="noreferrer" className="md-mono"
            style={{ fontSize: 10, color: "var(--accent)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
            read <ExternalLink size={9} />
          </a>
        )}
      </div>
    ) },
    { key: "kind", label: "TYPE", stopClick: true, render: (r) => (
      <InlineSelect value={r.kind} options={PRESS_KINDS} color={lookupColor(PRESS_KINDS, r.kind)}
        onCommit={(v) => update("press", r.id, { kind: v })} />
    ) },
    { key: "outlet", label: "OUTLET", stopClick: true, render: (r) => (
      <InlineText value={r.outlet} placeholder="Add outlet" onCommit={(v) => update("press", r.id, { outlet: v })} />
    ) },
    { key: "journalist", label: "JOURNALIST", stopClick: true, render: (r) => (
      <InlineText value={r.journalist} placeholder="—" onCommit={(v) => update("press", r.id, { journalist: v })} />
    ) },
    { key: "email", label: "EMAIL", stopClick: true, render: (r) => (
      <InlineText value={r.email} mono style={{ color: "var(--accent)", fontSize: 12 }} placeholder="—"
        onCommit={(v) => update("press", r.id, { email: v })} />
    ) },
    { key: "status", label: "STATUS", stopClick: true, render: (r) => (
      <InlineSelect value={r.status} options={PRESS_STATUSES} color={lookupColor(PRESS_STATUSES, r.status)}
        onCommit={(v) => update("press", r.id, { status: v })} />
    ) },
    { key: "scheduled", label: "SCHEDULED", stopClick: true, render: (r) => (
      <InlineDate value={r.scheduledFor} onCommit={(v) => update("press", r.id, { scheduledFor: v })} />
    ) },
    { key: "published", label: "PUBLISHED", stopClick: true, render: (r) => (
      <InlineDate value={r.publishedAt} onCommit={(v) => update("press", r.id, { publishedAt: v, status: v ? "published" : r.status })} />
    ) },
    { key: "project", label: "PROJECT", stopClick: true, render: (r) => (
      <InlineSelect value={r.projectId} options={data.projects.map((p) => ({ key: p.id, label: p.title }))} placeholder="—"
        onCommit={(v) => update("press", r.id, { projectId: v })} />
    ) },
    { key: "notes", label: "NOTES", cellStyle: { minWidth: 220, maxWidth: 360 }, stopClick: true, render: (r) => (
      <InlineText value={r.notes} placeholder="Add note" onCommit={(v) => update("press", r.id, { notes: v })} />
    ) },
    { key: "file", label: "ATTACHMENTS", stopClick: true, cellStyle: { minWidth: 220, maxWidth: 320 }, render: (r) => (
      <AttachmentList
        record={r}
        compact
        accept={PRESS_FILE_ACCEPT}
        label="Add file"
        onAdd={(file) => update("press", r.id, (row) => addAttachment(row, file))}
        onRemove={(item) => update("press", r.id, (row) => removeAttachment(row, item))}
        onRestore={(item) => update("press", r.id, (row) => undoRemove(row, item))}
        onPurge={async (item) => {
          const next = await purge(r, item);
          update("press", r.id, next);
        }}
      />
    ) },
    { key: "del", label: "", stopClick: true, render: (r) => <ConfirmButton label="" confirmLabel="Sure?" onConfirm={() => remove("press", r.id)} /> },
  ];

  return (
    <div>
      <ViewHeader count={rows.length} label="PRESS & COVERAGE">
        <button className="md-btn md-btn-primary" onClick={() => setShowNew(true)}><Plus size={14} /> New Press Record</button>
      </ViewHeader>

      <div style={{ display: "flex", gap: 34, flexWrap: "wrap", padding: "13px 18px", border: "1px solid var(--rule)", borderRadius: 12, background: "var(--panel)", marginBottom: 20 }}>
        <Stat label="PUBLISHED" value={published.length} accent="var(--sage)" />
        <Stat label="SCHEDULED" value={scheduled.length} accent="var(--accent)" />
        <Stat label="IN CONVERSATION" value={talking.length} accent={talking.length ? "var(--warn)" : undefined} />
        <Stat label="PRESS KITS" value={kits.length} />
      </div>

      {kits.length > 0 && (
        <Section title="PRESS KIT">
          {kits.map((k) => (
            <div key={k.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "9px 12px", border: "1px solid var(--rule)", borderRadius: 10, marginBottom: 8 }}>
              <Paperclip size={14} color="var(--accent)" style={{ marginTop: 4, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{k.title}</span>
                {k.notes ? <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 4 }}>{k.notes}</div> : null}
                <div style={{ marginTop: 8 }}>
                  <AttachmentList
                    record={k}
                    compact
                    accept={PRESS_FILE_ACCEPT}
                    label="Add to kit"
                    onAdd={(file) => update("press", k.id, (row) => addAttachment(row, file))}
                    onRemove={(item) => update("press", k.id, (row) => removeAttachment(row, item))}
                    onRestore={(item) => update("press", k.id, (row) => undoRemove(row, item))}
                    onPurge={async (item) => {
                      const next = await purge(k, item);
                      update("press", k.id, next);
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </Section>
      )}

      <div style={{ marginBottom: 18 }}>
        <FilterChips options={PRESS_KINDS.map((k) => ({ ...k, count: all.filter((r) => r.kind === k.key).length }))}
          value={kindFilter} onChange={setKindFilter} allLabel="Everything" />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No press tracked yet"
          subtitle="Keep the press kit, the outlets you are talking to, and the coverage that came out — or is scheduled to — in one place."
          action={<button className="md-btn md-btn-primary" onClick={() => setShowNew(true)}><Megaphone size={14} /> New Press Record</button>}
        />
      ) : (
        <DataTable columns={columns} rows={rows} />
      )}

      {showNew && <NewPressModal onClose={() => setShowNew(false)} defaultKind={kindFilter} />}
    </div>
  );
}
