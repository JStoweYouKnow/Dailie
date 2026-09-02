import { useState, useRef, useEffect } from "react";
import { Plus, Trash2, Image as ImageIcon, CheckSquare, Square, FileText, Receipt, X, CheckCircle2, Clapperboard, ExternalLink, RotateCcw, Presentation, Share2, Mic2, Send, Sparkles } from "lucide-react";
import { useStore } from "../lib/store";
import {
  RECORD_TYPES, recordTypeInfo, STAGES, stageInfo, PRIORITIES, PAYMENT_STATUSES,
  CONTRACT_STATUSES, INVOICE_STATUSES, SLATE_STATUSES, SOCIAL_STATUSES, EVENT_KINDS, EVENT_STATUSES,
  PITCH_SOURCES, PITCH_STATUSES, MANDATE_KINDS, lookupLabel, lookupColor, makeTask, makePitch,
  makeProjectDate, PROJECT_DATE_SUGGESTIONS, projectOwnerIds, withProjectOwners, normalizeProjectDates,
  pitchLabel, mandateLabel, projectPitchSuggestions, resolvedSlateStatus, summarizeMandate,
} from "../lib/model";
import { formatShort, formatFull, formatMoney, uid, dateInputValue, tsFromDateInput } from "../lib/format";
import { imageSrc, uploadFile, deleteFile, listAttachments, allAttachments, trashAttachment, restoreAttachment, purgeAttachment, SLATE_FILE_ACCEPT } from "../lib/files";
import { storedInlineUrl } from "../lib/blobUrls.js";
import {
  ModalShell, Field, Section, Badge, InlineText, InlineSelect, MemberPicker, ConfirmButton, Avatar,
  AttachmentList,
} from "../ui/kit";
import { CompanySelect } from "../ui/CompanySelect";
import { visibleMeetings } from "../lib/calendarExclusions";
import { safeHref } from "../lib/safeUrl";

function ImageHeader({ project, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const src = imageSrc(project);

  const pick = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const meta = await uploadFile(file, "images");
      onChange({ imagePath: meta.filePath || "", imageUrl: storedInlineUrl(meta.fileUrl), ...intoTrash() });
    } catch (err) {
      setError(err.message || "Upload failed.");
    }
    setBusy(false);
  };

  /**
   * One undo slot, used by both clearing and replacing. The outgoing image moves into it
   * rather than being destroyed; whatever was already sitting there is what finally gets
   * dropped, which keeps the slot from growing without bound.
   */
  const intoTrash = () => {
    if (!project.imagePath && !project.imageUrl) return {};
    if (project.imageTrashPath) deleteFile({ filePath: project.imageTrashPath }).catch(() => {});
    return { imageTrashPath: project.imagePath || "", imageTrashUrl: project.imageUrl || "" };
  };

  // Restoring is a swap, so it stays valid whether or not something is currently set.
  const restore = () => onChange({
    imagePath: project.imageTrashPath || "",
    imageUrl: project.imageTrashUrl || "",
    imageTrashPath: project.imagePath || "",
    imageTrashUrl: project.imageUrl || "",
  });

  const purge = async () => {
    try {
      await deleteFile({ filePath: project.imageTrashPath });
      onChange({ imageTrashPath: "", imageTrashUrl: "" });
    } catch (err) { /* stay in trash so the delete can be retried */ }
  };

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        height: 150, borderRadius: 12, border: "1px solid var(--rule)", position: "relative", overflow: "hidden",
        background: src ? `var(--panel-raised) url(${src}) center/cover no-repeat` : "var(--panel-raised)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {!src && <ImageIcon size={26} color="var(--dim-2)" />}
        <div style={{ position: "absolute", right: 10, bottom: 10, display: "flex", gap: 6 }}>
          <label className="md-btn md-btn-ghost" style={{ background: "rgba(10,10,11,.7)", border: "1px solid var(--rule-bright)", cursor: "pointer", fontSize: 12, color: "var(--bone)" }}>
            {busy ? "Uploading…" : src ? "Replace image" : "Add project image"}
            <input type="file" accept="image/*" onChange={pick} style={{ display: "none" }} />
          </label>
          {src && (
            <button className="md-btn md-btn-ghost" style={{ background: "rgba(10,10,11,.7)", border: "1px solid var(--rule-bright)", padding: 6 }}
              onClick={() => onChange({ imagePath: "", imageUrl: "", ...intoTrash() })}><X size={13} /></button>
          )}
        </div>
      </div>
      {error && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 6 }}>{error}</div>}
      {(project.imageTrashPath || project.imageTrashUrl) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, fontSize: 11, color: "var(--dim)" }}>
          <span>Previous image kept.</span>
          <button className="md-btn md-btn-ghost" style={{ padding: "3px 7px", fontSize: 11 }} onClick={restore}>
            <RotateCcw size={11} /> {project.imagePath || project.imageUrl ? "Swap back" : "Restore"}
          </button>
          <ConfirmButton label="" confirmLabel="Delete for good?" onConfirm={purge} />
        </div>
      )}
    </div>
  );
}

function addAttachment(row, file) {
  return { attachments: [...allAttachments(row), file] };
}

function removeAttachment(row, item) {
  return { attachments: trashAttachment(row, item) };
}

function undoRemove(row, item) {
  return { attachments: restoreAttachment(row, item) };
}

function purgeProjectFile(row, item) {
  return purgeAttachment(row, item).then((attachments) => ({ attachments }));
}


function codeFromTitle(title) {
  const words = String(title || "")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0 && !/^(the|a|an)$/i.test(w));
  if (!words.length) return "PROJ";
  if (words.length === 1) {
    const cleaned = words[0].replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase();
    return cleaned || "PROJ";
  }
  return words.slice(0, 4).map((w) => w[0]).join("").toUpperCase();
}

function sendToProductionHref(project) {
  const params = new URLSearchParams({
    from: "dailie",
    dailieProjectId: String(project.id),
    name: project.title || "",
    description: project.description || "",
    code: codeFromTitle(project.title || ""),
    return: "1",
  });
  return `/production/projects?${params.toString()}`;
}

function Row({ label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--rule)" }}>
      <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", width: 148, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function LinkRow({ label, value, placeholder, onCommit }) {
  const href = safeHref(value);
  return (
    <Row label={label}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <InlineText value={value} wrap mono placeholder={placeholder} style={{ color: "var(--accent)", fontSize: 12 }}
            onCommit={(v) => onCommit(v.trim())} />
        </div>
        {href && (
          <a href={href} target="_blank" rel="noreferrer" className="md-btn md-btn-ghost" style={{ padding: 4, flexShrink: 0 }} title="Open link">
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    </Row>
  );
}

export default function ProjectDetail({ project, onClose, onOpenRecord }) {
  const { data, update, updateProject, remove, add, currentUser, memberName } = useStore();
  const [newTask, setNewTask] = useState("");
  const [note, setNote] = useState("");
  const [newFieldName, setNewFieldName] = useState("");
  const [newDateLabel, setNewDateLabel] = useState("");
  const [saveStatus, setSaveStatus] = useState(null);
  const saveTimer = useRef(null);

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  const flashSave = (kind) => {
    setSaveStatus(kind);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => setSaveStatus(null), 2200);
  };

  const patchProject = (changes, note, kind = "edited") => {
    updateProject(project.id, changes, note);
    flashSave(kind);
  };
  const type = recordTypeInfo(project.recordType);
  const pipeline = data.pipelines[project.recordType] || [];

  const tasks = data.tasks.filter((t) => t.projectId === project.id);
  const notes = data.notes.filter((n) => n.projectId === project.id);
  const contracts = data.contracts.filter((c) => c.projectId === project.id);
  const invoices = data.invoices.filter((i) => i.projectId === project.id);
  const packages = (data.slate || []).filter((s) => s.projectId === project.id);
  const pitches = (data.pitches || []).filter((p) => p.projectId === project.id);
  const pitchIdeas = projectPitchSuggestions(data.mandates, project, packages, data.pitches);
  const social = (data.social || []).filter((s) => s.projectId === project.id);
  const meetings = visibleMeetings(data.meetings, data.settings).filter((m) => m.projectId === project.id);
  const history = [...(project.history || [])].sort((a, b) => b.date - a.date);
  const booked = (data.talent || [])
    .map((t) => ({ talent: t, assignment: (t.assignments || []).find((a) => a.projectId === project.id) }))
    .filter((x) => x.assignment);
  const customFields = project.customFields || {};
  const extraDates = normalizeProjectDates(project.dates);
  const linkedEvents = (data.events || []).filter((e) => e.projectId === project.id)
    .sort((a, b) => (a.date || Infinity) - (b.date || Infinity));

  const addTask = () => {
    if (!newTask.trim()) return;
    add("tasks", makeTask({
      title: newTask.trim(),
      projectId: project.id,
      assigneeIds: projectOwnerIds(project),
    }, currentUser && currentUser.id));
    setNewTask("");
    flashSave("saved");
  };

  // A suggestion is only an idea until someone acts on it: taking one writes a real
  // pitch on the project, carrying the mandate and the reason it was flagged.
  const addSuggestedPitch = ({ mandate, reason, packageId }) => {
    add("pitches", makePitch({
      projectId: project.id,
      packageId: packageId || (packages[0] && packages[0].id) || null,
      companyId: mandate.companyId || null,
      mandateId: mandate.id,
      name: mandate.companyId ? "" : (mandate.name || ""),
      status: "suggested",
      source: "both",
      reason,
      ownerId: (currentUser && currentUser.id) || null,
    }));
    flashSave("saved");
  };

  const addNote = () => {
    if (!note.trim()) return;
    add("notes", {
      title: note.trim().slice(0, 60),
      body: note.trim(),
      authorId: currentUser && currentUser.id,
      projectId: project.id,
      collaboratorIds: [],
      comments: [],
      updatedAt: Date.now(),
    });
    setNote("");
    flashSave("saved");
  };

  const addCustomField = () => {
    const name = newFieldName.trim();
    if (!name) return;
    patchProject({ customFields: { ...customFields, [name]: "" } }, undefined, "saved");
    setNewFieldName("");
  };

  const addExtraDate = (label) => {
    const name = (label || newDateLabel).trim();
    if (!name) return;
    patchProject({ dates: [...extraDates, makeProjectDate({ label: name })] }, `Added date: ${name}`, "saved");
    setNewDateLabel("");
  };

  const patchExtraDate = (id, changes) => {
    patchProject({
      dates: extraDates.map((d) => (d.id === id ? { ...d, ...changes } : d)),
    });
  };

  const removeExtraDate = (id) => {
    const gone = extraDates.find((d) => d.id === id);
    patchProject(
      { dates: extraDates.filter((d) => d.id !== id) },
      gone && gone.label ? `Removed date: ${gone.label}` : undefined
    );
  };

  /** Changing the record type re-homes the project on the new type's pipeline. */
  const changeType = (nextType) => {
    const nextPipeline = data.pipelines[nextType] || [];
    const keep = nextPipeline.some((c) => c.key === project.pipelineStage);
    patchProject(
      { recordType: nextType, pipelineStage: keep ? project.pipelineStage : (nextPipeline[0] || {}).key },
      `Record type changed to ${recordTypeInfo(nextType).label}`
    );
  };

  return (
    <ModalShell
      wide
      title={project.title}
      subtitle={`${type.label} · updated ${formatShort(project.updatedAt)}`}
      status={saveStatus && (
        <span className="md-mono" style={{
          display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700,
          letterSpacing: ".12em", color: "var(--sage)", flexShrink: 0,
        }}>
          <CheckCircle2 size={12} color="var(--sage)" />
          {saveStatus === "edited" ? "EDITED" : "SAVED"}
        </span>
      )}
      onClose={onClose}
    >
      <ImageHeader project={project} onChange={(changes) => patchProject(changes, undefined, project.imageUrl || project.imagePath ? "edited" : "saved")} />

      <Field label="FILES" hint={listAttachments(project).length ? undefined : "Deck, one-sheet, treatment, budget."}>
        <AttachmentList
          record={project}
          accept={SLATE_FILE_ACCEPT}
          label="Add file"
          onAdd={(file) => patchProject(addAttachment(project, file))}
          onRemove={(item) => patchProject(removeAttachment(project, item))}
          onRestore={(item) => patchProject(undoRemove(project, item))}
          onPurge={async (item) => {
            const next = await purgeProjectFile(project, item);
            patchProject(next);
          }}
        />
      </Field>

      <Field label="TITLE">
        <InlineText value={project.title} style={{ fontSize: 18, fontWeight: 700 }} onCommit={(v) => v.trim() && patchProject({ title: v.trim() }, `Renamed to ${v.trim()}`)} />
      </Field>
      <Field label="LOGLINE / DESCRIPTION">
        <InlineText value={project.description} multiline markdown placeholder="What is this project about?" onCommit={(v) => patchProject({ description: v })} />
      </Field>

      <Section title="NEXT STEP">
        <div style={{ padding: 12, background: "var(--panel-raised)", border: `1px solid ${type.color}`, borderRadius: 8 }}>
          <InlineText value={project.nextStep} placeholder="Click to set the next step…" multiline
            onCommit={(v) => patchProject({ nextStep: v }, v ? `Next step: ${v}` : "Next step cleared")} />
        </div>
      </Section>

      <Section title="RECORD">
        <Row label="TYPE">
          <InlineSelect value={project.recordType} options={RECORD_TYPES.map((t) => ({ key: t.key, label: t.label }))} color={type.color} onCommit={changeType} />
        </Row>
        <Row label="PIPELINE">
          <InlineSelect value={project.pipelineStage} options={pipeline} color={lookupColor(pipeline, project.pipelineStage)}
            onCommit={(v) => patchProject({ pipelineStage: v }, `Moved to ${lookupLabel(pipeline, v)}`)} />
        </Row>
        <Row label="PRODUCTION STAGE">
          <InlineSelect value={project.stage} options={STAGES} color={stageInfo(project.stage).color}
            onCommit={(v) => patchProject({ stage: v }, `Moved to ${stageInfo(v).label}`)} />
        </Row>
        <Row label="OWNERS">
          <MemberPicker
            team={data.team}
            selectedIds={projectOwnerIds(project)}
            label="Assign owners"
            onChange={(ids) => {
              const next = withProjectOwners(ids);
              const names = next.ownerIds.map(memberName).filter(Boolean);
              const teamIds = (project.teamIds || []).filter((id) => !next.ownerIds.includes(id));
              patchProject({ ...next, teamIds }, names.length ? `Owners: ${names.join(", ")}` : "Owners cleared");
            }}
          />
        </Row>
        <Row label="TEAM MEMBERS">
          <MemberPicker team={data.team} selectedIds={project.teamIds || []} label="Add team members"
            onChange={(ids) => patchProject({ teamIds: ids.filter((id) => !projectOwnerIds(project).includes(id)) }, "Team updated")} />
        </Row>
        <Row label="COMPANY">
          <CompanySelect value={project.companyId} placeholder="No company"
            onCommit={(v) => patchProject({ companyId: v })} />
        </Row>
        <Row label="CONTACT PERSON">
          <InlineText value={project.contactName} placeholder="Who we call" onCommit={(v) => patchProject({ contactName: v.trim() })} />
        </Row>
        <Row label="CONTACT EMAIL">
          <InlineText value={project.contactEmail} mono placeholder="name@company.com" style={{ color: "var(--accent)" }}
            onCommit={(v) => patchProject({ contactEmail: v.trim().toLowerCase() })} />
        </Row>
        <Row label="PHONE">
          <InlineText value={project.contactPhone} mono placeholder="+1 (555) 000-0000"
            onCommit={(v) => patchProject({ contactPhone: v.trim() })} />
        </Row>
        <Row label="BUDGET / VALUE">
          <InlineText value={project.budget} mono placeholder="e.g. $12.5M" style={{ color: "var(--accent)", fontWeight: 700 }} onCommit={(v) => patchProject({ budget: v })} />
        </Row>
        <Row label="PRIORITY">
          <InlineSelect value={project.priority} options={PRIORITIES.map((p) => ({ key: p, label: p }))}
            color={project.priority === "HIGH" ? "var(--red)" : undefined} onCommit={(v) => patchProject({ priority: v })} />
        </Row>
        <Row label="PAID">
          <InlineSelect value={project.paymentStatus || "na"} options={PAYMENT_STATUSES} color={lookupColor(PAYMENT_STATUSES, project.paymentStatus)}
            onCommit={(v) => patchProject({ paymentStatus: v }, `Payment marked ${lookupLabel(PAYMENT_STATUSES, v)}`)} />
        </Row>
        <Row label="STUDIO / PARTNER">
          <InlineText value={project.studio} placeholder="Add studio" onCommit={(v) => patchProject({ studio: v })} />
        </Row>
        <Row label="START DATE">
          <input type="date" className="md-input" style={{ padding: "4px 8px", fontSize: 12, width: "auto", background: "transparent" }}
            value={dateInputValue(project.startDate)} onChange={(e) => patchProject({ startDate: tsFromDateInput(e.target.value) })} />
        </Row>
        <Row label="DELIVERY DATE">
          <input type="date" className="md-input" style={{ padding: "4px 8px", fontSize: 12, width: "auto", background: "transparent" }}
            value={dateInputValue(project.endDate)} onChange={(e) => patchProject({ endDate: tsFromDateInput(e.target.value) })} />
        </Row>
        <LinkRow label="GOOGLE DRIVE LINK" value={project.driveUrl} placeholder="https://drive.google.com/…"
          onCommit={(v) => patchProject({ driveUrl: v })} />
        <LinkRow label="EXTERNAL LINK" value={project.externalUrl} placeholder="https://"
          onCommit={(v) => patchProject({ externalUrl: v })} />
        {extraDates.map((d) => (
          <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: "1px solid var(--rule)", flexWrap: "wrap" }}>
            <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", width: 148, flexShrink: 0 }}>DATE</div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <InlineText value={d.label} placeholder="Date name" onCommit={(v) => patchExtraDate(d.id, { label: v.trim() })} />
            </div>
            <input type="date" className="md-input" style={{ padding: "4px 8px", fontSize: 12, width: "auto", background: "transparent" }}
              value={dateInputValue(d.date)} onChange={(e) => patchExtraDate(d.id, { date: tsFromDateInput(e.target.value) })} />
            <button className="md-btn md-btn-ghost" style={{ padding: 4 }} title="Remove date"
              onClick={() => removeExtraDate(d.id)}><X size={12} /></button>
          </div>
        ))}
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: extraDates.length ? 8 : 0 }}>
            {PROJECT_DATE_SUGGESTIONS
              .filter((label) => !extraDates.some((d) => d.label.toLowerCase() === label.toLowerCase()))
              .map((label) => (
                <button key={label} className="md-btn md-btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }}
                  onClick={() => addExtraDate(label)}>+ {label}</button>
              ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input className="md-input" placeholder="Add a date (e.g. Wrap, Premiere, Pitch)" value={newDateLabel}
              onChange={(e) => setNewDateLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addExtraDate(); }} />
            <button className="md-btn" onClick={() => addExtraDate()}><Plus size={13} /> Add date</button>
          </div>
        </div>
        {Object.keys(customFields).map((name) => {
          const href = safeHref(customFields[name]);
          return (
            <Row key={name} label={name.toUpperCase()}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <InlineText value={customFields[name]} wrap placeholder="—"
                    style={href ? { color: "var(--accent)", fontSize: 12 } : undefined}
                    onCommit={(v) => patchProject({ customFields: { ...customFields, [name]: v } })} />
                </div>
                {href && (
                  <a href={href} target="_blank" rel="noreferrer" className="md-btn md-btn-ghost" style={{ padding: 4, flexShrink: 0 }} title="Open link">
                    <ExternalLink size={12} />
                  </a>
                )}
                <button className="md-btn md-btn-ghost" style={{ padding: 4, flexShrink: 0 }} title="Remove field"
                  onClick={() => {
                    const next = { ...customFields };
                    delete next[name];
                    patchProject({ customFields: next });
                  }}><X size={12} /></button>
              </div>
            </Row>
          );
        })}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input className="md-input" placeholder="Add a custom field (e.g. Format, Territory, Delivery spec)" value={newFieldName}
            onChange={(e) => setNewFieldName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCustomField(); }} />
          <button className="md-btn" onClick={addCustomField}><Plus size={13} /> Add field</button>
        </div>
      </Section>


      <Section title="PRODUCTION TRACKING">
        <p style={{ fontSize: 12, color: "var(--dim)", marginBottom: 12, lineHeight: 1.45 }}>
          Interface is the studio shot / task / review tracker. Dailie stays the slate for deals, meetings, and paperwork.
        </p>
        {project.interfaceProjectId ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <a className="md-btn" href={`/production/projects/${project.interfaceProjectId}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
              <Clapperboard size={13} /> Open in Interface
            </a>
            <span className="md-mono" style={{ fontSize: 10, color: "var(--dim-2)" }}>{project.interfaceProjectId}</span>
            <button className="md-btn md-btn-ghost" style={{ fontSize: 12 }}
              onClick={() => patchProject({ interfaceProjectId: "" }, "Unlinked Interface project")}>
              Unlink
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <a className="md-btn" href={sendToProductionHref(project)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
              <ExternalLink size={13} /> Send to production
            </a>
            <span style={{ fontSize: 11, color: "var(--dim)" }}>Creates a linked Interface project (producer role).</span>
          </div>
        )}
        <Row label="INTERFACE ID">
          <InlineText
            value={project.interfaceProjectId || ""}
            mono
            placeholder="Paste Interface project id to link an existing show"
            onCommit={(v) => patchProject({ interfaceProjectId: v.trim() }, v.trim() ? `Linked Interface ${v.trim()}` : "Cleared Interface link")}
          />
        </Row>
      </Section>

      <Section title={`TASKS · ${tasks.filter((t) => t.status !== "done").length} OPEN`}>
        {tasks.map((t) => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
            <button className="md-btn md-btn-ghost" style={{ padding: 2 }}
              onClick={() => {
                update("tasks", t.id, { status: t.status === "done" ? "todo" : "done", completedAt: t.status === "done" ? null : Date.now() });
                flashSave("edited");
              }}>
              {t.status === "done" ? <CheckSquare size={15} color="var(--sage)" /> : <Square size={15} color="var(--dim)" />}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <InlineText value={t.title} onCommit={(v) => { update("tasks", t.id, { title: v }); flashSave("edited"); }}
                style={{ textDecoration: t.status === "done" ? "line-through" : "none", color: t.status === "done" ? "var(--dim)" : "var(--bone)" }} />
            </div>
            <div style={{ width: 150, flexShrink: 0 }}>
              <MemberPicker team={data.team} selectedIds={t.assigneeIds || []} label="Assign" onChange={(ids) => { update("tasks", t.id, { assigneeIds: ids }); flashSave("edited"); }} />
            </div>
            <ConfirmButton label="" confirmLabel="Sure?" onConfirm={() => remove("tasks", t.id)} />
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input className="md-input" placeholder="Add a task for this project…" value={newTask}
            onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addTask(); }} />
          <button className="md-btn" onClick={addTask}><Plus size={13} /> Add</button>
        </div>
      </Section>

      {booked.length > 0 && (
        <Section title={`CREW BOOKED · ${booked.length}`}>
          {booked.map(({ talent, assignment }) => (
            <div key={talent.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--rule)" }}>
              <Avatar name={talent.name} size={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{talent.name}</div>
                <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>
                  {assignment.role || talentDisciplines(talent).join(" · ") || talent.discipline || "Crew"}
                  {assignment.startDate ? ` · ${formatShort(assignment.startDate)} → ${formatShort(assignment.endDate || assignment.startDate)}` : ""}
                </div>
              </div>
              {assignment.allocation && assignment.allocation < 100 && <Badge label={`${assignment.allocation}%`} subtle />}
              {talent.rateAmount && (
                <span className="md-mono" style={{ fontSize: 11, color: "var(--accent)" }}>{talent.rateAmount}/{talent.rateUnit || "day"}</span>
              )}
            </div>
          ))}
        </Section>
      )}

      <Section title={`NOTES · ${notes.length}`}>
        {notes.map((n) => (
          <div key={n.id} style={{ padding: 10, background: "var(--panel-raised)", border: "1px solid var(--rule)", borderRadius: 8, marginBottom: 8 }}>
            <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", marginBottom: 4 }}>
              {memberName(n.authorId) || "Unknown"} · {formatShort(n.createdAt)}
            </div>
            <InlineText value={n.body} multiline markdown onCommit={(v) => { update("notes", n.id, { body: v, updatedAt: Date.now() }); flashSave("edited"); }} />
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input className="md-input" placeholder="Write a note the team can edit…" value={note}
            onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addNote(); }} />
          <button className="md-btn" onClick={addNote}><Plus size={13} /> Note</button>
        </div>
      </Section>

      <Section title={`EVENTS · ${linkedEvents.length}`}>
        {linkedEvents.map((e) => (
          <div key={e.id} onClick={() => onOpenRecord && onOpenRecord("events")} role="button" tabIndex={0}
            onKeyDown={(ev) => { if (ev.key === "Enter" && onOpenRecord) onOpenRecord("events"); }}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--rule)", borderRadius: 8, marginBottom: 6, cursor: "pointer" }}>
            <Mic2 size={14} color="var(--accent)" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{e.name || "Untitled event"}</div>
              <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", marginTop: 2 }}>
                {e.date ? formatShort(e.date) : "No date"} · {lookupLabel(EVENT_KINDS, e.kind)}
              </div>
            </div>
            <Badge label={lookupLabel(EVENT_STATUSES, e.status)} color={lookupColor(EVENT_STATUSES, e.status)} />
          </div>
        ))}
        <button className="md-btn md-btn-ghost" style={{ marginTop: linkedEvents.length ? 6 : 0, fontSize: 12 }}
          onClick={() => onOpenRecord && onOpenRecord("events")}>
          <Plus size={13} /> {linkedEvents.length ? "Open events" : "Add an event"}
        </button>
      </Section>

      <Section title={`SLATE · ${packages.length}`}>
        {packages.map((pkg) => {
          const status = resolvedSlateStatus(pkg);
          return (
            <div key={pkg.id} onClick={() => onOpenRecord && onOpenRecord("slate")} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" && onOpenRecord) onOpenRecord("slate"); }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--rule)", borderRadius: 8, marginBottom: 6, cursor: "pointer" }}>
              <Presentation size={14} color="var(--accent)" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{pkg.title || "Pitch package"}</div>
                {pkg.logline ? <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pkg.logline}</div> : null}
              </div>
              <Badge label={lookupLabel(SLATE_STATUSES, status)} color={lookupColor(SLATE_STATUSES, status)} />
            </div>
          );
        })}
        <button className="md-btn md-btn-ghost" style={{ marginTop: packages.length ? 6 : 0, fontSize: 12 }}
          onClick={() => onOpenRecord && onOpenRecord("slate")}>
          <Plus size={13} /> {packages.length ? "Open slate" : "Add a pitch package"}
        </button>
      </Section>

      <Section title={`PITCHED TO · ${pitches.length}`}>
        {pitches.map((pitch) => {
          const mandate = (data.mandates || []).find((m) => m.id === pitch.mandateId);
          return (
            <div key={pitch.id}
              style={{ padding: "10px 12px", border: "1px solid var(--rule)", borderRadius: 8, marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Send size={14} color="var(--accent)" style={{ flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{pitchLabel(pitch, data.companies, data.mandates)}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
                    <Badge label={lookupLabel(PITCH_SOURCES, pitch.source)} color={lookupColor(PITCH_SOURCES, pitch.source)} />
                    {mandate && (
                      <Badge label={lookupLabel(MANDATE_KINDS, mandate.kind)} color={lookupColor(MANDATE_KINDS, mandate.kind)} />
                    )}
                    {pitch.pitchedAt ? (
                      <span className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>{formatShort(pitch.pitchedAt)}</span>
                    ) : null}
                  </div>
                </div>
                <InlineSelect value={pitch.status} options={PITCH_STATUSES} color={lookupColor(PITCH_STATUSES, pitch.status)}
                  onCommit={(v) => {
                    update("pitches", pitch.id, {
                      status: v,
                      pitchedAt: v === "pitched" && !pitch.pitchedAt ? Date.now() : pitch.pitchedAt,
                    });
                    flashSave("edited");
                  }} />
              </div>
              {pitch.reason ? (
                <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 8, lineHeight: 1.5 }}>{pitch.reason}</div>
              ) : null}
              {mandate && mandate.mandate ? (
                <div style={{ fontSize: 12, color: "var(--dim-2)", marginTop: 6, lineHeight: 1.5 }}>
                  <span className="md-mono" style={{ fontSize: 10, letterSpacing: ".1em" }}>THEIR MANDATE · </span>
                  {summarizeMandate(mandate.mandate).objective || mandate.mandate}
                </div>
              ) : null}
            </div>
          );
        })}
        {pitchIdeas.length > 0 && (
          <div style={{ marginTop: pitches.length ? 12 : 0 }}>
            <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", marginBottom: 8 }}>
              COULD BE A FIT · FROM THEIR MANDATE
            </div>
            {pitchIdeas.map(({ mandate, reason, packageId }) => (
              <div key={mandate.id}
                style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", border: "1px dashed var(--rule)", borderRadius: 8, marginBottom: 6 }}>
                <Sparkles size={14} color="var(--accent)" style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{mandateLabel(mandate, data.companies)}</div>
                    <Badge label={lookupLabel(MANDATE_KINDS, mandate.kind)} color={lookupColor(MANDATE_KINDS, mandate.kind)} />
                  </div>
                  <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 4, lineHeight: 1.5 }}>{reason}</div>
                  {mandate.mandate ? (
                    <div style={{ fontSize: 12, color: "var(--dim-2)", marginTop: 4, lineHeight: 1.5 }}>
                      {summarizeMandate(mandate.mandate).objective || mandate.mandate}
                    </div>
                  ) : null}
                </div>
                <button className="md-btn" style={{ flexShrink: 0, fontSize: 12 }}
                  onClick={() => addSuggestedPitch({ mandate, reason, packageId })}>
                  <Plus size={13} /> Pitch
                </button>
              </div>
            ))}
          </div>
        )}
        <button className="md-btn md-btn-ghost" style={{ marginTop: pitches.length || pitchIdeas.length ? 6 : 0, fontSize: 12 }}
          onClick={() => onOpenRecord && onOpenRecord("slate")}>
          <Plus size={13} /> {pitches.length ? "Open slate" : "Add who we pitched"}
        </button>
      </Section>

      <Section title={`SOCIAL · ${social.length}`}>
        {social
          .slice()
          .sort((a, b) => (a.scheduledAt || Infinity) - (b.scheduledAt || Infinity))
          .map((item) => (
            <div key={item.id} onClick={() => onOpenRecord && onOpenRecord("social")} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" && onOpenRecord) onOpenRecord("social"); }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--rule)", borderRadius: 8, marginBottom: 6, cursor: "pointer" }}>
              <Share2 size={14} color="var(--accent)" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{item.title || (item.kind === "event" ? "Event" : "Post")}</div>
                <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", marginTop: 2 }}>
                  {item.scheduledAt ? formatShort(item.scheduledAt) : "No date"} · {item.kind === "event" ? "Event" : "Post"}
                </div>
              </div>
              <Badge label={lookupLabel(SOCIAL_STATUSES, item.status)} color={lookupColor(SOCIAL_STATUSES, item.status)} />
            </div>
          ))}
        <button className="md-btn md-btn-ghost" style={{ marginTop: social.length ? 6 : 0, fontSize: 12 }}
          onClick={() => onOpenRecord && onOpenRecord("social")}>
          <Plus size={13} /> {social.length ? "Open social calendar" : "Add a post or event"}
        </button>
      </Section>

      {(contracts.length > 0 || invoices.length > 0) && (
        <Section title="PAPERWORK">
          {contracts.map((c) => (
            <div key={c.id} onClick={() => onOpenRecord && onOpenRecord("contracts")} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" && onOpenRecord) onOpenRecord("contracts"); }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--rule)", borderRadius: 8, marginBottom: 6, cursor: "pointer" }}>
              <FileText size={14} color="var(--accent)" />
              <span style={{ flex: 1, fontSize: 13 }}>{c.title}</span>
              <Badge label={lookupLabel(CONTRACT_STATUSES, c.status)} color={lookupColor(CONTRACT_STATUSES, c.status)} />
            </div>
          ))}
          {invoices.map((i) => (
            <div key={i.id} onClick={() => onOpenRecord && onOpenRecord("finance")} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" && onOpenRecord) onOpenRecord("finance"); }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", border: "1px solid var(--rule)", borderRadius: 8, marginBottom: 6, cursor: "pointer" }}>
              <Receipt size={14} color="var(--accent)" />
              <span style={{ flex: 1, fontSize: 13 }}>Invoice {i.number || i.id} · {i.direction === "incoming" ? "receivable" : "payable"}</span>
              <span className="md-mono" style={{ fontSize: 12, color: "var(--accent)" }}>{formatMoney(i.amount, i.currency)}</span>
              <Badge label={lookupLabel(INVOICE_STATUSES, i.status)} color={lookupColor(INVOICE_STATUSES, i.status)} />
            </div>
          ))}
        </Section>
      )}

      {meetings.length > 0 && (
        <Section title={`MEETINGS · ${meetings.length}`}>
          {meetings.map((m) => (
            <div key={m.id} style={{ fontSize: 13, padding: "6px 0", borderBottom: "1px solid var(--rule)" }}>
              <span className="md-mono" style={{ fontSize: 11, color: "var(--dim)", marginRight: 8 }}>{formatShort(m.date)}</span>{m.title}
            </div>
          ))}
        </Section>
      )}

      <Section title="ACTIVITY LOG">
        <div className="md-scroll" style={{ maxHeight: 200, overflowY: "auto", paddingRight: 4 }}>
          {history.length === 0 && <div style={{ fontSize: 12, color: "var(--dim)" }}>No activity recorded yet.</div>}
          {history.map((h) => (
            <div key={h.id} style={{ fontSize: 12, marginBottom: 10, paddingLeft: 10, borderLeft: "2px solid var(--rule)" }}>
              <div className="md-mono" style={{ color: "var(--dim)", fontSize: 10 }}>{formatFull(h.date)}</div>
              <div style={{ color: "var(--bone)" }}>{h.note}</div>
            </div>
          ))}
        </div>
      </Section>

      <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
        <ConfirmButton label="Remove project" confirmLabel="Yes, remove it" icon={<Trash2 size={13} />}
          onConfirm={() => { remove("projects", project.id); onClose(); }} />
      </div>
    </ModalShell>
  );
}
