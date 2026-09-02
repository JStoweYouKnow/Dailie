import { useMemo, useState } from "react";
import { Plus, Presentation, ExternalLink, Radio, Send, ChevronDown, ChevronUp } from "lucide-react";
import { useStore } from "../lib/store";
import {
  SLATE_STATUSES, MANDATE_KINDS, PITCH_SOURCES, PITCH_STATUSES,
  lookupColor, lookupLabel, makeSlatePackage, makeMandate, makePitch,
  mandateLabel, pitchLabel, mandateFitReason, suggestMandateFits, resolvedSlateStatus,
  stageInfo, summarizeMandate, HUE,
} from "../lib/model";
import {
  listAttachments, allAttachments, trashAttachment, restoreAttachment, purgeAttachment,
  SLATE_FILE_ACCEPT,
} from "../lib/files";
import { useDraftUploads } from "../lib/draftUploads";
import { safeHref } from "../lib/safeUrl";
import { formatShort } from "../lib/format";
import {
  ViewHeader, FilterChips, EmptyState, Badge, Stat,
  InlineText, InlineSelect, ModalShell, Field, ConfirmButton,
  AttachmentList,
} from "../ui/kit";
import { CompanySelect } from "../ui/CompanySelect";

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

function BucketHeading({ children, right }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
      <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".12em" }}>{children}</div>
      {right}
    </div>
  );
}

function LinkField({ label, value, onCommit, placeholder }) {
  const href = safeHref(value);
  return (
    <div>
      <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <InlineText value={value} wrap mono style={{ color: "var(--accent)", fontSize: 12 }} placeholder={placeholder}
            onCommit={onCommit} />
        </div>
        {href && (
          <a href={href} target="_blank" rel="noreferrer" className="md-btn md-btn-ghost" style={{ padding: 6, textDecoration: "none" }}>
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  );
}

function NewMandateModal({ onClose }) {
  const { data, add, currentUser } = useStore();
  const drafts = useDraftUploads();
  const [form, setForm] = useState({ kind: "streamer", name: "", companyId: "", mandate: "", notes: "" });
  const [files, setFiles] = useState([]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    const name = form.name.trim();
    const company = data.companies.find((c) => c.id === form.companyId);
    if (!name && !company) return;
    add("mandates", makeMandate({
      kind: form.kind,
      name,
      companyId: form.companyId || null,
      mandate: form.mandate.trim(),
      notes: form.notes.trim(),
      ownerId: (currentUser && currentUser.id) || null,
      attachments: files,
    }));
    drafts.markSaved();
    onClose();
  };

  return (
    <ModalShell title="New mandate" subtitle="A streamer, studio or platform and what they are looking for." onClose={onClose}>
      <Field label="KIND">
        <select className="md-select" value={form.kind} onChange={set("kind")}>
          {MANDATE_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
      </Field>
      <Field label="COMPANY ON THE BOARD" hint="Optional — pick one if they are already in Companies, or add them here.">
        <CompanySelect native value={form.companyId} placeholder="Not on the board yet"
          onCommit={(id, company) => setForm((f) => ({
            ...f,
            companyId: id || "",
            name: f.name || (company && company.name) || "",
          }))} />
      </Field>
      <Field label="NAME" hint="e.g. Roku, OpenArt — used when they are not a company on the board.">
        <input className="md-input" autoFocus value={form.name} onChange={set("name")} placeholder="Streamer / studio name" />
      </Field>
      <Field label="MANDATE">
        <textarea className="md-textarea" rows={5} value={form.mandate} onChange={set("mandate")}
          placeholder="What they want: family animation, female-led sci-fi, shorts that can go to series…" />
      </Field>
      <Field label="NOTES">
        <textarea className="md-textarea" rows={3} value={form.notes} onChange={set("notes")} placeholder="Who we heard it from, expiry, anything else." />
      </Field>
      <Field label="FILES" hint="PDF of the brief, a deck they sent, an email export.">
        <AttachmentList
          items={files}
          accept={SLATE_FILE_ACCEPT}
          label="Add files"
          onAdd={(file) => { if (drafts.keep(file)) setFiles((list) => [...list, file]); }}
          onRemove={(item) => { drafts.drop(item); setFiles((list) => list.filter((f) => f.id !== item.id)); }}
        />
      </Field>
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>Save mandate</button>
    </ModalShell>
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
    driveUrl: "",
    notes: "",
    status: defaultProjectId ? "draft" : "package",
  });
  const [files, setFiles] = useState([]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    const project = data.projects.find((p) => p.id === form.projectId);
    const title = form.title.trim() || (project && project.title) || "";
    if (!title) return;
    const projectId = form.projectId || null;
    add("slate", makeSlatePackage({
      ...form,
      title,
      logline: form.logline.trim(),
      synopsis: form.synopsis.trim(),
      notes: form.notes.trim(),
      trailerUrl: form.trailerUrl.trim(),
      deckUrl: form.deckUrl.trim(),
      driveUrl: form.driveUrl.trim(),
      projectId,
      status: resolvedSlateStatus({
        projectId,
        status: form.status,
        attachments: files,
      }),
      ownerId: (currentUser && currentUser.id) || null,
      attachments: files,
    }));
    drafts.markSaved();
    onClose();
  };

  return (
    <ModalShell wide title="Create New Pitch" subtitle="Title, log line, synopsis, deck, trailer, Drive folder, and rights notes — so anyone can send it." onClose={onClose}>
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
      <Field label="GOOGLE DRIVE LINK">
        <input className="md-input" value={form.driveUrl} onChange={set("driveUrl")} placeholder="https://drive.google.com/…" />
      </Field>
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

function NewPitchModal({ onClose, defaultProjectId }) {
  const { data, add, currentUser } = useStore();
  const [form, setForm] = useState({
    projectId: defaultProjectId || "",
    companyId: "",
    mandateId: "",
    name: "",
    status: "suggested",
    source: "mandate",
    reason: "",
    packageId: "",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const project = data.projects.find((p) => p.id === form.projectId);
  const pkg = (data.slate || []).find((s) => s.id === form.packageId)
    || (data.slate || []).find((s) => s.projectId === form.projectId);
  const mandate = (data.mandates || []).find((m) => m.id === form.mandateId);
  const fits = project ? suggestMandateFits(data.mandates, project, pkg) : [];

  const applyMandate = (nextMandateId) => {
    const next = (data.mandates || []).find((m) => m.id === nextMandateId);
    const reason = next ? (mandateFitReason(next, project, pkg) || form.reason) : form.reason;
    const companyId = next && next.companyId ? next.companyId : form.companyId;
    const name = next && !next.companyId ? (next.name || form.name) : form.name;
    setForm((f) => ({
      ...f,
      mandateId: nextMandateId,
      companyId: companyId || "",
      name,
      reason,
      source: f.source === "ai" || f.source === "both" ? "both" : "mandate",
    }));
  };

  const submit = () => {
    if (!form.projectId) return;
    const company = data.companies.find((c) => c.id === form.companyId);
    const name = form.name.trim();
    if (!company && !name && !mandate) return;
    add("pitches", makePitch({
      projectId: form.projectId,
      packageId: form.packageId || (pkg && pkg.id) || null,
      companyId: form.companyId || null,
      mandateId: form.mandateId || null,
      name,
      status: form.status,
      source: form.source,
      reason: form.reason.trim(),
      pitchedAt: form.status === "pitched" ? Date.now() : null,
      ownerId: (currentUser && currentUser.id) || null,
    }));
    onClose();
  };

  return (
    <ModalShell title="Who we pitched" subtitle="A buyer, their mandate, and why this IP is a fit — from the mandate, an AI assessment, or both." onClose={onClose}>
      <Field label="PROJECT">
        <select className="md-select" value={form.projectId} onChange={set("projectId")}>
          <option value="">Choose a project</option>
          {data.projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </Field>
      {fits.length > 0 && (
        <Field label="SUGGESTED FROM MANDATES" hint="Keyword overlap between this IP and what they asked for.">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {fits.map(({ mandate: m, reason }) => (
              <button key={m.id} type="button" className="md-btn md-btn-ghost" style={{ fontSize: 12 }}
                onClick={() => applyMandate(m.id)}>
                {mandateLabel(m, data.companies)}
                <span className="md-mono" style={{ fontSize: 10, color: "var(--dim)", marginLeft: 6 }}>{reason}</span>
              </button>
            ))}
          </div>
        </Field>
      )}
      <Field label="MANDATE">
        <select className="md-select" value={form.mandateId} onChange={(e) => applyMandate(e.target.value)}>
          <option value="">None</option>
          {(data.mandates || []).map((m) => (
            <option key={m.id} value={m.id}>{mandateLabel(m, data.companies)} · {lookupLabel(MANDATE_KINDS, m.kind)}</option>
          ))}
        </select>
      </Field>
      <Field label="COMPANY ON THE BOARD">
        <CompanySelect native value={form.companyId} placeholder="Not on the board"
          onCommit={(id, company) => setForm((f) => ({
            ...f,
            companyId: id || "",
            name: f.name || (company && company.name) || "",
          }))} />
      </Field>
      <Field label="NAME" hint="e.g. Roku, OpenArt — when they are not a company on the board.">
        <input className="md-input" value={form.name} onChange={set("name")} placeholder="Who we pitched" />
      </Field>
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="WHY THIS FIT">
          <select className="md-select" value={form.source} onChange={set("source")}>
            {PITCH_SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="STATUS">
          <select className="md-select" value={form.status} onChange={set("status")}>
            {PITCH_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="REASON">
        <textarea className="md-textarea" rows={4} value={form.reason} onChange={set("reason")}
          placeholder="Fits their family-animation mandate; AI flagged the character as toyetic…" />
      </Field>
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>Save</button>
    </ModalShell>
  );
}

function MandateCard({ mandate }) {
  const { data, update, remove } = useStore();
  const [briefOpen, setBriefOpen] = useState(false);
  const label = mandateLabel(mandate, data.companies);
  const files = listAttachments(mandate);
  const summary = summarizeMandate(mandate.mandate);
  const name = (mandate.name || "").trim() || label;
  const headlineBits = (summary.headline || "").split("|").map((bit) => bit.trim()).filter(Boolean);
  const subtitle = headlineBits.length > 1
    ? headlineBits.filter((bit) => bit.toLowerCase() !== name.toLowerCase()).join(" · ")
    : "";

  return (
    <div className="md-card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
        <Radio size={14} color="var(--accent)" style={{ marginTop: 4, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <InlineText value={mandate.name} style={{ fontSize: 16, fontWeight: 700 }} placeholder={label || "Add a name"}
            onCommit={(v) => update("mandates", mandate.id, { name: v })} />
          {subtitle ? (
            <div className="md-mono" style={{ fontSize: 11, color: "var(--dim)", marginTop: 4, letterSpacing: ".02em" }}>{subtitle}</div>
          ) : mandate.companyId ? (
            <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", marginTop: 3 }}>
              {((data.companies.find((c) => c.id === mandate.companyId) || {}).name) || "Company"}
            </div>
          ) : null}
        </div>
        <InlineSelect fit value={mandate.kind} options={MANDATE_KINDS} color={lookupColor(MANDATE_KINDS, mandate.kind)}
          onCommit={(v) => update("mandates", mandate.id, { kind: v })} />
        <ConfirmButton label="" confirmLabel="Remove?" onConfirm={() => remove("mandates", mandate.id)} />
      </div>

      {summary.objective ? (
        <div style={{ marginBottom: 14 }}>
          <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", marginBottom: 6 }}>WHAT THEY WANT</div>
          {summary.long ? (
            <div style={{ fontSize: 13, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {summary.objective}
            </div>
          ) : (
            <InlineText value={mandate.mandate} multiline placeholder="What they are looking for…"
              onCommit={(v) => update("mandates", mandate.id, { mandate: v })} />
          )}
        </div>
      ) : null}

      {(summary.audience || summary.genres.length > 0) ? (
        <div style={{ display: "grid", gridTemplateColumns: summary.audience && summary.genres.length ? "minmax(0, 1fr) minmax(0, 1.4fr)" : "1fr", gap: 14, marginBottom: 14 }}>
          {summary.audience ? (
            <div>
              <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", marginBottom: 6 }}>AUDIENCE</div>
              <div style={{ fontSize: 13, lineHeight: 1.4 }}>{summary.audience}</div>
            </div>
          ) : null}
          {summary.genres.length > 0 ? (
            <div>
              <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", marginBottom: 6 }}>GENRES</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {summary.genres.map((genre) => (
                  <Badge key={genre} label={genre} color={HUE.sand} solid />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {summary.formats ? (
        <div style={{ marginBottom: 14 }}>
          <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", marginBottom: 6 }}>FORMATS</div>
          <div style={{ fontSize: 13, lineHeight: 1.45, color: "var(--dim-2)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {summary.formats}
          </div>
        </div>
      ) : null}

      {summary.long && mandate.mandate ? (
        <button className="md-btn md-btn-ghost" style={{ fontSize: 12, marginBottom: briefOpen ? 10 : 14 }}
          onClick={() => setBriefOpen((open) => !open)}>
          {briefOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          {briefOpen ? "Hide brief" : "View brief"}
        </button>
      ) : null}
      {(briefOpen || !mandate.mandate) && (
        <div style={{ marginBottom: 14 }}>
          {!mandate.mandate && (
            <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", marginBottom: 6 }}>MANDATE</div>
          )}
          <InlineText boxed multiline value={mandate.mandate} placeholder="What they are looking for…"
            onCommit={(v) => update("mandates", mandate.id, { mandate: v })} />
        </div>
      )}

      <Field label="COMPANY ON THE BOARD">
        <CompanySelect native value={mandate.companyId || ""} placeholder="Not on the board"
          onCommit={(id) => update("mandates", mandate.id, { companyId: id || null })} />
      </Field>
      <Field label="NOTES">
        <InlineText value={mandate.notes} multiline placeholder="Who we heard it from…"
          onCommit={(v) => update("mandates", mandate.id, { notes: v })} />
      </Field>
      <Field label="FILES" hint={files.length ? undefined : "PDF of the brief, a deck they sent, an email export."} style={{ marginBottom: 0 }}>
        <AttachmentList
          record={mandate}
          accept={SLATE_FILE_ACCEPT}
          label="Add file"
          onAdd={(file) => update("mandates", mandate.id, (row) => addAttachment(row, file))}
          onRemove={(item) => update("mandates", mandate.id, (row) => removeAttachment(row, item))}
          onRestore={(item) => update("mandates", mandate.id, (row) => undoRemove(row, item))}
          onPurge={async (item) => {
            const next = await purge(mandate, item);
            update("mandates", mandate.id, next);
          }}
        />
      </Field>
    </div>
  );
}

function projectStage(project, pipelines) {
  if (!project) return null;
  const cols = (pipelines && pipelines[project.recordType]) || [];
  const col = cols.find((c) => c.key === project.pipelineStage);
  if (col) return col;
  return stageInfo(project.stage);
}

function PitchCard({ pitch }) {
  const { data, update, remove } = useStore();
  const project = (data.projects || []).find((p) => p.id === pitch.projectId);
  const who = pitchLabel(pitch, data.companies, data.mandates);
  const mandate = (data.mandates || []).find((m) => m.id === pitch.mandateId);
  const stage = projectStage(project, data.pipelines);

  return (
    <div className="md-card" style={{ padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
        <Send size={14} color="var(--accent)" style={{ marginTop: 4, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.3 }}>
            {project ? project.title : "No project linked"}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, marginTop: 10 }}>
            <div>
              <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", marginBottom: 4 }}>STAGE</div>
              {stage ? <Badge label={stage.label} color={stage.color} /> : (
                <span style={{ fontSize: 13, color: "var(--dim)" }}>No stage</span>
              )}
            </div>
            <div>
              <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", marginBottom: 4 }}>PITCHED TO</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{who || "Add who we pitched"}</div>
            </div>
            {pitch.pitchedAt ? (
              <div>
                <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", marginBottom: 4 }}>SENT</div>
                <div className="md-mono" style={{ fontSize: 12, color: "var(--dim)" }}>{formatShort(pitch.pitchedAt)}</div>
              </div>
            ) : null}
          </div>
        </div>
        <InlineSelect fit value={pitch.status} options={PITCH_STATUSES} color={lookupColor(PITCH_STATUSES, pitch.status)}
          onCommit={(v) => update("pitches", pitch.id, {
            status: v,
            pitchedAt: v === "pitched" && !pitch.pitchedAt ? Date.now() : pitch.pitchedAt,
          })} />
        <ConfirmButton label="" confirmLabel="Remove?" onConfirm={() => remove("pitches", pitch.id)} />
      </div>

      <Field label="PROJECT">
        <select className="md-select" value={pitch.projectId || ""}
          onChange={(e) => update("pitches", pitch.id, { projectId: e.target.value || null })}>
          <option value="">No project</option>
          {(data.projects || []).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </Field>
      <Field label="PITCHED TO">
        <InlineText value={pitch.name} style={{ fontSize: 14, fontWeight: 600 }} placeholder={who || "Who we pitched"}
          onCommit={(v) => update("pitches", pitch.id, { name: v })} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        <CompanySelect native value={pitch.companyId || ""} placeholder="Not on the board"
          onCommit={(id) => update("pitches", pitch.id, { companyId: id || null })} />
        <select className="md-select" value={pitch.mandateId || ""} onChange={(e) => update("pitches", pitch.id, { mandateId: e.target.value || null })}>
          <option value="">No mandate</option>
          {(data.mandates || []).map((m) => <option key={m.id} value={m.id}>{mandateLabel(m, data.companies)}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
        <Badge label={lookupLabel(PITCH_SOURCES, pitch.source)} color={lookupColor(PITCH_SOURCES, pitch.source)} />
        {mandate && (
          <Badge label={mandateLabel(mandate, data.companies)} color={lookupColor(MANDATE_KINDS, mandate.kind)} />
        )}
      </div>
      <InlineSelect value={pitch.source} options={PITCH_SOURCES} color={lookupColor(PITCH_SOURCES, pitch.source)}
        onCommit={(v) => update("pitches", pitch.id, { source: v })} />
      <div style={{ marginTop: 8 }}>
        <InlineText value={pitch.reason} multiline placeholder="Why this is a fit — from their mandate, an AI assessment, or both."
          onCommit={(v) => update("pitches", pitch.id, { reason: v })} />
      </div>
    </div>
  );
}

function PackageCard({ pkg, projectTitle }) {
  const { update, remove } = useStore();
  const files = listAttachments(pkg);
  const status = resolvedSlateStatus(pkg);

  return (
    <div style={{ padding: "16px 16px 24px", border: "1px solid var(--rule)", borderRadius: 12, background: "var(--panel)", marginBottom: 12, overflow: "visible" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <InlineText value={pkg.title} style={{ fontSize: 16, fontWeight: 700 }} placeholder="Add a title"
            onCommit={(v) => update("slate", pkg.id, { title: v })} />
          {projectTitle && (
            <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", marginTop: 3 }}>{projectTitle}</div>
          )}
        </div>
        <InlineSelect fit value={status} options={SLATE_STATUSES} color={lookupColor(SLATE_STATUSES, status)}
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
      <div style={{ marginBottom: 8 }}>
        <LinkField label="GOOGLE DRIVE LINK" value={pkg.driveUrl} placeholder="https://drive.google.com/…"
          onCommit={(v) => update("slate", pkg.id, { driveUrl: v.trim() })} />
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

      <Field label="RIGHTS & NOTES" style={{ marginBottom: 0 }}>
        <InlineText boxed multiline
          value={pkg.notes}
          placeholder="Option, life rights, underlying IP — e.g. still need to option the book…"
          onCommit={(v) => update("slate", pkg.id, { notes: v })} />
      </Field>
    </div>
  );
}

export default function SlateView({ searchQuery }) {
  const { data } = useStore();
  const [projectFilter, setProjectFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);
  const [showMandate, setShowMandate] = useState(false);
  const [showPitch, setShowPitch] = useState(false);

  const all = data.slate || [];
  const projects = data.projects || [];
  const mandates = data.mandates || [];
  const pitches = data.pitches || [];
  const q = (searchQuery || "").toLowerCase();

  const visibleMandates = useMemo(() => {
    let list = [...mandates];
    if (q) {
      list = list.filter((m) =>
        (m.name || "").toLowerCase().includes(q) ||
        (m.mandate || "").toLowerCase().includes(q) ||
        (m.notes || "").toLowerCase().includes(q) ||
        mandateLabel(m, data.companies).toLowerCase().includes(q) ||
        listAttachments(m).some((a) => (a.fileName || "").toLowerCase().includes(q)));
    }
    return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [mandates, q, data.companies]);

  const rows = useMemo(() => {
    let list = [...all];
    if (projectFilter !== "all") list = list.filter((s) => s.projectId === projectFilter);
    if (q) {
      list = list.filter((s) =>
        (s.title || "").toLowerCase().includes(q) ||
        (s.logline || "").toLowerCase().includes(q) ||
        (s.synopsis || "").toLowerCase().includes(q) ||
        (s.notes || "").toLowerCase().includes(q));
    }
    return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [all, projectFilter, q]);

  const visiblePitches = useMemo(() => {
    let list = [...pitches];
    if (projectFilter !== "all") list = list.filter((p) => p.projectId === projectFilter);
    if (q) {
      list = list.filter((p) => {
        const projectTitle = ((projects.find((x) => x.id === p.projectId) || {}).title || "");
        return pitchLabel(p, data.companies, mandates).toLowerCase().includes(q) ||
          (p.reason || "").toLowerCase().includes(q) ||
          (p.name || "").toLowerCase().includes(q) ||
          projectTitle.toLowerCase().includes(q);
      });
    }
    return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [pitches, projectFilter, q, data.companies, mandates, projects]);

  const projectName = (id) => ((projects.find((p) => p.id === id) || {}).title) || "";
  const withPackage = new Set(all.map((s) => s.projectId).filter(Boolean));
  const withPitch = new Set(pitches.map((p) => p.projectId).filter(Boolean));
  const missing = projects.filter((p) => !withPackage.has(p.id) && !withPitch.has(p.id));
  const ready = all.filter((s) => resolvedSlateStatus(s) === "ready").length;

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
      .map((p) => ({
        project: p,
        packages: byProject.get(p.id) || [],
      }));
    const leftover = [...byProject.keys()].filter((id) => !projects.some((p) => p.id === id));
    leftover.forEach((id) => ordered.push({
      project: { id, title: "Unknown project" },
      packages: byProject.get(id) || [],
    }));
    return { ordered, unlinked };
  }, [rows, projects]);

  const filterOptions = projects
    .filter((p) => withPackage.has(p.id) || withPitch.has(p.id))
    .map((p) => ({
      key: p.id,
      label: p.title,
      count: all.filter((s) => s.projectId === p.id).length + pitches.filter((x) => x.projectId === p.id).length,
    }));

  const empty = !visibleMandates.length && !rows.length && !visiblePitches.length;

  return (
    <div>
      <ViewHeader count={all.length + mandates.length + pitches.length} label="SLATE">
        <button className="md-btn" onClick={() => setShowMandate(true)}><Radio size={14} /> New mandate</button>
        <button className="md-btn" onClick={() => setShowPitch(true)}><Send size={14} /> Who we pitched</button>
        <button className="md-btn md-btn-primary" onClick={() => setShowNew(true)}><Plus size={14} /> Create New Pitch</button>
      </ViewHeader>

      <div style={{ display: "flex", gap: 34, flexWrap: "wrap", padding: "13px 18px", border: "1px solid var(--rule)", borderRadius: 12, background: "var(--panel)", marginBottom: 20 }}>
        <Stat label="MANDATES" value={mandates.length} />
        <Stat label="PACKAGES" value={all.length} />
        <Stat label="PITCHED TO" value={pitches.length} />
        <Stat label="READY TO SEND" value={ready} accent={ready ? "var(--sage)" : undefined} />
        <Stat label="PROJECTS MISSING A PACKAGE" value={missing.length} accent={missing.length ? "var(--warn)" : undefined} />
      </div>

      {filterOptions.length > 1 && (
        <div style={{ marginBottom: 18 }}>
          <FilterChips options={filterOptions} value={projectFilter} onChange={setProjectFilter} allLabel="Every project" />
        </div>
      )}

      {empty ? (
        <EmptyState
          title="Nothing on the slate yet"
          subtitle="Add streamer mandates, pitch packages, and who each IP has been pitched to."
          action={(
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="md-btn" onClick={() => setShowMandate(true)}><Radio size={14} /> New mandate</button>
              <button className="md-btn" onClick={() => setShowPitch(true)}><Send size={14} /> Who we pitched</button>
              <button className="md-btn md-btn-primary" onClick={() => setShowNew(true)}><Presentation size={14} /> Create New Pitch</button>
            </div>
          )}
        />
      ) : (
        <>
          <div style={{ marginBottom: 28 }}>
            <BucketHeading right={
              <button className="md-btn md-btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowMandate(true)}>
                <Plus size={12} /> Mandate
              </button>
            }>MANDATES</BucketHeading>
            {visibleMandates.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--dim)", padding: "8px 0 4px" }}>
                No streamer or studio mandates yet. Add who is looking, and what they want.
              </div>
            ) : visibleMandates.map((m) => <MandateCard key={m.id} mandate={m} />)}
          </div>

          <div style={{ marginBottom: 28 }}>
            <BucketHeading>Create New Pitch Package</BucketHeading>
            {groups.unlinked.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--dim)", padding: "8px 0 4px" }}>
                Uploaded packages that are not linked to a project land here — labelled Create New Pitch Package, not Sent.
              </div>
            ) : groups.unlinked.map((pkg) => <PackageCard key={pkg.id} pkg={pkg} />)}
          </div>

          <div style={{ marginBottom: 28 }}>
            <BucketHeading right={
              <button className="md-btn md-btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowPitch(true)}>
                <Plus size={12} /> Who we pitched
              </button>
            }>PITCHES</BucketHeading>
            {visiblePitches.length === 0 ? (
              <div style={{ fontSize: 13, color: "var(--dim)", padding: "8px 0 4px" }}>
                Each pitch is a card: the project, its stage, and who it was sent to.
              </div>
            ) : visiblePitches.map((pitch) => <PitchCard key={pitch.id} pitch={pitch} />)}
          </div>

          {groups.ordered.length > 0 && (
            <div style={{ marginBottom: 22 }}>
              <BucketHeading>PROJECTS</BucketHeading>
              {groups.ordered.map(({ project, packages }) => (
                <div key={project.id} style={{ marginBottom: 22 }}>
                  <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".12em", marginBottom: 8 }}>
                    {project.title.toUpperCase()}
                  </div>
                  {packages.map((pkg) => (
                    <PackageCard key={pkg.id} pkg={pkg} projectTitle={packages.length > 1 ? projectName(pkg.projectId) : ""} />
                  ))}
                  <button className="md-btn md-btn-ghost" style={{ fontSize: 12, marginTop: 4 }} onClick={() => setShowPitch(project.id)}>
                    <Plus size={12} /> Who we pitched
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showMandate && <NewMandateModal onClose={() => setShowMandate(false)} />}
      {showNew && (
        <NewPackageModal
          onClose={() => setShowNew(false)}
          defaultProjectId={typeof showNew === "string" ? showNew : (projectFilter !== "all" ? projectFilter : "")}
        />
      )}
      {showPitch && (
        <NewPitchModal
          onClose={() => setShowPitch(false)}
          defaultProjectId={typeof showPitch === "string" ? showPitch : (projectFilter !== "all" ? projectFilter : "")}
        />
      )}
    </div>
  );
}
