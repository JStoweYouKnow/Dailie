import { useMemo, useState } from "react";
import { Plus, Presentation, ExternalLink } from "lucide-react";
import { useStore } from "../lib/store";
import { SLATE_STATUSES, lookupColor, makeSlatePackage } from "../lib/model";
import {
  listAttachments, allAttachments, trashAttachment, restoreAttachment, purgeAttachment,
  SLATE_FILE_ACCEPT,
} from "../lib/files";
import { useDraftUploads } from "../lib/draftUploads";
import { safeHref } from "../lib/safeUrl";
import {
  ViewHeader, FilterChips, EmptyState, Badge, Stat,
  InlineText, InlineSelect, ModalShell, Field, ConfirmButton,
  AttachmentList,
} from "../ui/kit";

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

function LinkField({ label, value, onCommit, placeholder }) {
  const href = safeHref(value);
  return (
    <div>
      <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <InlineText value={value} mono style={{ color: "var(--accent)", fontSize: 12, flex: 1 }} placeholder={placeholder}
          onCommit={onCommit} />
        {href && (
          <a href={href} target="_blank" rel="noreferrer" className="md-btn md-btn-ghost" style={{ padding: 6, textDecoration: "none" }}>
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  );
}

function NewPackageModal({ onClose, defaultProjectId }) {
  const { data, add, currentUser } = useStore();
  const drafts = useDraftUploads();
  const [form, setForm] = useState({
    projectId: defaultProjectId || "",
    title: "",
    logline: "",
    synopsis: "",
    trailerUrl: "",
    deckUrl: "",
    notes: "",
    status: "draft",
  });
  const [files, setFiles] = useState([]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    const project = data.projects.find((p) => p.id === form.projectId);
    const title = form.title.trim() || (project && project.title) || "";
    if (!title) return;
    add("slate", makeSlatePackage({
      ...form,
      title,
      logline: form.logline.trim(),
      synopsis: form.synopsis.trim(),
      notes: form.notes.trim(),
      projectId: form.projectId || null,
      ownerId: (currentUser && currentUser.id) || null,
      attachments: files,
    }));
    drafts.markSaved();
    onClose();
  };

  return (
    <ModalShell wide title="New pitch package" subtitle="Title, log line, synopsis, deck, trailer, and rights notes — so anyone can send it." onClose={onClose}>
      <Field label="PROJECT">
        <select className="md-select" value={form.projectId} onChange={set("projectId")}>
          <option value="">No project yet</option>
          {data.projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </Field>
      <Field label="TITLE"><input className="md-input" autoFocus value={form.title} onChange={set("title")} placeholder="Usually the project title" /></Field>
      <Field label="LOG LINE" hint="One or two sentences anyone can paste into an email.">
        <textarea className="md-textarea" rows={3} value={form.logline} onChange={set("logline")}
          placeholder="A deep-sea acoustician hears something in the trench that should not be there…" />
      </Field>
      <Field label="SYNOPSIS">
        <textarea className="md-textarea" rows={6} value={form.synopsis} onChange={set("synopsis")}
          placeholder="The full pitch paragraph — tone, world, what happens." />
      </Field>
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="TRAILER"><input className="md-input" value={form.trailerUrl} onChange={set("trailerUrl")} placeholder="https://vimeo.com/…" /></Field>
        <Field label="PITCH DECK LINK"><input className="md-input" value={form.deckUrl} onChange={set("deckUrl")} placeholder="https://…" /></Field>
      </div>
      <Field label="RIGHTS & NOTES" hint="Option on the book, life rights, underlying IP, anything a colleague must know before they send this.">
        <textarea className="md-textarea" rows={4} value={form.notes} onChange={set("notes")}
          placeholder="e.g. We still need to option the Panthers life rights before this goes out." />
      </Field>
      <Field label="FILES" hint="Pitch deck, one-sheet, trailer file. PDF, PowerPoint, ZIP, stills, MP4.">
        <AttachmentList
          items={files}
          accept={SLATE_FILE_ACCEPT}
          label="Add files"
          onAdd={(file) => { if (drafts.keep(file)) setFiles((list) => [...list, file]); }}
          onRemove={(item) => { drafts.drop(item); setFiles((list) => list.filter((f) => f.id !== item.id)); }}
        />
      </Field>
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>Save package</button>
    </ModalShell>
  );
}

function PackageCard({ pkg, projectTitle }) {
  const { update, remove } = useStore();
  const files = listAttachments(pkg);

  return (
    <div style={{ padding: 16, border: "1px solid var(--rule)", borderRadius: 12, background: "var(--panel)", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <InlineText value={pkg.title} style={{ fontSize: 16, fontWeight: 700 }} placeholder="Add a title"
            onCommit={(v) => update("slate", pkg.id, { title: v })} />
          {projectTitle && (
            <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", marginTop: 3 }}>{projectTitle}</div>
          )}
        </div>
        <InlineSelect value={pkg.status} options={SLATE_STATUSES} color={lookupColor(SLATE_STATUSES, pkg.status)}
          onCommit={(v) => update("slate", pkg.id, { status: v })} />
        <ConfirmButton label="" confirmLabel="Remove?" onConfirm={() => remove("slate", pkg.id)} />
      </div>

      <Field label="LOG LINE">
        <InlineText value={pkg.logline} multiline placeholder="Add a log line"
          onCommit={(v) => update("slate", pkg.id, { logline: v })} />
      </Field>
      <Field label="SYNOPSIS">
        <InlineText value={pkg.synopsis} multiline markdown placeholder="Add a synopsis"
          onCommit={(v) => update("slate", pkg.id, { synopsis: v })} />
      </Field>

      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 8 }}>
        <LinkField label="TRAILER" value={pkg.trailerUrl} placeholder="Add a Vimeo or YouTube link"
          onCommit={(v) => update("slate", pkg.id, { trailerUrl: v.trim() })} />
        <LinkField label="PITCH DECK LINK" value={pkg.deckUrl} placeholder="Add a hosted deck link"
          onCommit={(v) => update("slate", pkg.id, { deckUrl: v.trim() })} />
      </div>

      <Field label="FILES" hint={files.length ? undefined : "Pitch deck, one-sheet, trailer file."}>
        <AttachmentList
          record={pkg}
          accept={SLATE_FILE_ACCEPT}
          label="Add file"
          onAdd={(file) => update("slate", pkg.id, (row) => addAttachment(row, file))}
          onRemove={(item) => update("slate", pkg.id, (row) => removeAttachment(row, item))}
          onRestore={(item) => update("slate", pkg.id, (row) => undoRemove(row, item))}
          onPurge={async (item) => {
            const next = await purge(pkg, item);
            update("slate", pkg.id, next);
          }}
        />
      </Field>

      <Field label="RIGHTS & NOTES" hint="Option, life rights, underlying IP — whatever someone sending this needs to know.">
        <InlineText value={pkg.notes} multiline placeholder="e.g. Still need to option the book / life rights…"
          onCommit={(v) => update("slate", pkg.id, { notes: v })} />
      </Field>
    </div>
  );
}

export default function SlateView({ searchQuery }) {
  const { data } = useStore();
  const [projectFilter, setProjectFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);

  const all = data.slate || [];
  const projects = data.projects || [];

  const rows = useMemo(() => {
    let list = [...all];
    if (projectFilter !== "all") list = list.filter((s) => s.projectId === projectFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((s) =>
        (s.title || "").toLowerCase().includes(q) ||
        (s.logline || "").toLowerCase().includes(q) ||
        (s.synopsis || "").toLowerCase().includes(q) ||
        (s.notes || "").toLowerCase().includes(q));
    }
    return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [all, projectFilter, searchQuery]);

  const projectName = (id) => ((projects.find((p) => p.id === id) || {}).title) || "";
  const withPackage = new Set(all.map((s) => s.projectId).filter(Boolean));
  const missing = projects.filter((p) => !withPackage.has(p.id));
  const ready = all.filter((s) => s.status === "ready").length;

  const groups = useMemo(() => {
    const byProject = new Map();
    const unlinked = [];
    rows.forEach((pkg) => {
      if (!pkg.projectId) {
        unlinked.push(pkg);
        return;
      }
      if (!byProject.has(pkg.projectId)) byProject.set(pkg.projectId, []);
      byProject.get(pkg.projectId).push(pkg);
    });
    const ordered = projects
      .filter((p) => byProject.has(p.id))
      .map((p) => ({ project: p, packages: byProject.get(p.id) }));
    const leftover = [...byProject.keys()].filter((id) => !projects.some((p) => p.id === id));
    leftover.forEach((id) => ordered.push({ project: { id, title: "Unknown project" }, packages: byProject.get(id) }));
    return { ordered, unlinked };
  }, [rows, projects]);

  const filterOptions = projects
    .filter((p) => withPackage.has(p.id))
    .map((p) => ({ key: p.id, label: p.title, count: all.filter((s) => s.projectId === p.id).length }));

  return (
    <div>
      <ViewHeader count={rows.length} label="SLATE">
        <button className="md-btn md-btn-primary" onClick={() => setShowNew(true)}><Plus size={14} /> New pitch package</button>
      </ViewHeader>

      <div style={{ display: "flex", gap: 34, flexWrap: "wrap", padding: "13px 18px", border: "1px solid var(--rule)", borderRadius: 12, background: "var(--panel)", marginBottom: 20 }}>
        <Stat label="PACKAGES" value={all.length} />
        <Stat label="READY TO SEND" value={ready} accent={ready ? "var(--sage)" : undefined} />
        <Stat label="PROJECTS MISSING A PACKAGE" value={missing.length} accent={missing.length ? "var(--warn)" : undefined} />
      </div>

      {filterOptions.length > 1 && (
        <div style={{ marginBottom: 18 }}>
          <FilterChips options={filterOptions} value={projectFilter} onChange={setProjectFilter} allLabel="Every project" />
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="No pitch packages yet"
          subtitle="Keep the title, log line, synopsis, deck, trailer and rights notes in one place so anyone on the team can send a project out."
          action={<button className="md-btn md-btn-primary" onClick={() => setShowNew(true)}><Presentation size={14} /> New pitch package</button>}
        />
      ) : (
        <>
          {groups.ordered.map(({ project, packages }) => (
            <div key={project.id} style={{ marginBottom: 22 }}>
              <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".12em", marginBottom: 8 }}>
                {project.title.toUpperCase()}
              </div>
              {packages.map((pkg) => (
                <PackageCard key={pkg.id} pkg={pkg} projectTitle={packages.length > 1 ? projectName(pkg.projectId) : ""} />
              ))}
            </div>
          ))}
          {groups.unlinked.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".12em", marginBottom: 8 }}>UNLINKED</div>
              {groups.unlinked.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} />)}
            </div>
          )}
        </>
      )}

      {missing.length > 0 && rows.length > 0 && projectFilter === "all" && !searchQuery && (
        <div style={{ marginTop: 8, padding: 14, border: "1px dashed var(--rule)", borderRadius: 12 }}>
          <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", marginBottom: 8 }}>NO PACKAGE YET</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {missing.map((p) => (
              <button key={p.id} className="md-btn md-btn-ghost" style={{ fontSize: 12 }}
                onClick={() => { setProjectFilter("all"); setShowNew(p.id); }}>
                {p.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {showNew && (
        <NewPackageModal
          onClose={() => setShowNew(false)}
          defaultProjectId={typeof showNew === "string" ? showNew : (projectFilter !== "all" ? projectFilter : "")}
        />
      )}
    </div>
  );
}
