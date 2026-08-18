import { useState } from "react";
import { Plus, Trash2, Image as ImageIcon, CheckSquare, Square, FileText, Receipt, X } from "lucide-react";
import { useStore } from "../lib/store";
import {
  RECORD_TYPES, recordTypeInfo, STAGES, stageInfo, PRIORITIES, PAYMENT_STATUSES,
  CONTRACT_STATUSES, INVOICE_STATUSES, lookupLabel, lookupColor, makeTask,
} from "../lib/model";
import { formatShort, formatFull, formatMoney, uid, dateInputValue, tsFromDateInput } from "../lib/format";
import { imageSrc, uploadFile } from "../lib/files";
import {
  ModalShell, Field, Section, Badge, InlineText, InlineSelect, MemberPicker, ConfirmButton, Avatar,
} from "../ui/kit";

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
      onChange({ imagePath: meta.filePath || "", imageUrl: meta.fileUrl || "" });
    } catch (err) {
      setError(err.message || "Upload failed.");
    }
    setBusy(false);
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
              onClick={() => onChange({ imagePath: "", imageUrl: "" })}><X size={13} /></button>
          )}
        </div>
      </div>
      {error && <div style={{ fontSize: 11, color: "var(--red)", marginTop: 6 }}>{error}</div>}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--rule)" }}>
      <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", width: 130, flexShrink: 0 }}>{label}</div>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

export default function ProjectDetail({ project, onClose, onOpenRecord }) {
  const { data, update, updateProject, remove, add, currentUser, memberName } = useStore();
  const [newTask, setNewTask] = useState("");
  const [note, setNote] = useState("");
  const [newFieldName, setNewFieldName] = useState("");

  const patchProject = (changes, note) => updateProject(project.id, changes, note);
  const type = recordTypeInfo(project.recordType);
  const pipeline = data.pipelines[project.recordType] || [];

  const tasks = data.tasks.filter((t) => t.projectId === project.id);
  const notes = data.notes.filter((n) => n.projectId === project.id);
  const contracts = data.contracts.filter((c) => c.projectId === project.id);
  const invoices = data.invoices.filter((i) => i.projectId === project.id);
  const meetings = data.meetings.filter((m) => m.projectId === project.id);
  const history = [...(project.history || [])].sort((a, b) => b.date - a.date);
  const booked = (data.talent || [])
    .map((t) => ({ talent: t, assignment: (t.assignments || []).find((a) => a.projectId === project.id) }))
    .filter((x) => x.assignment);
  const customFields = project.customFields || {};

  const addTask = () => {
    if (!newTask.trim()) return;
    add("tasks", makeTask({
      title: newTask.trim(),
      projectId: project.id,
      assigneeIds: project.ownerId ? [project.ownerId] : [],
    }, currentUser && currentUser.id));
    setNewTask("");
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
  };

  const addCustomField = () => {
    const name = newFieldName.trim();
    if (!name) return;
    patchProject({ customFields: { ...customFields, [name]: "" } });
    setNewFieldName("");
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
    <ModalShell wide title={project.title} subtitle={`${type.label} · updated ${formatShort(project.updatedAt)}`} onClose={onClose}>
      <ImageHeader project={project} onChange={(changes) => patchProject(changes)} />

      <Field label="TITLE">
        <InlineText value={project.title} style={{ fontSize: 18, fontWeight: 700 }} onCommit={(v) => v.trim() && patchProject({ title: v.trim() }, `Renamed to ${v.trim()}`)} />
      </Field>
      <Field label="LOGLINE / DESCRIPTION">
        <InlineText value={project.description} multiline placeholder="What is this project about?" onCommit={(v) => patchProject({ description: v })} />
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
        <Row label="OWNER">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {project.ownerId && <Avatar name={memberName(project.ownerId)} size={24} />}
            <InlineSelect value={project.ownerId} options={data.team.map((m) => ({ key: m.id, label: m.name }))} placeholder="Unassigned"
              onCommit={(v) => patchProject({ ownerId: v }, `Owner changed to ${memberName(v) || "unassigned"}`)} />
          </div>
        </Row>
        <Row label="TEAM MEMBERS">
          <MemberPicker team={data.team} selectedIds={project.teamIds || []} label="Add team members"
            onChange={(ids) => patchProject({ teamIds: ids }, "Team updated")} />
        </Row>
        <Row label="COMPANY">
          <InlineSelect value={project.companyId} options={data.companies.map((c) => ({ key: c.id, label: c.name }))} placeholder="No company"
            onCommit={(v) => patchProject({ companyId: v })} />
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
        {Object.keys(customFields).map((name) => (
          <Row key={name} label={name.toUpperCase()}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1 }}>
                <InlineText value={customFields[name]} placeholder="—" onCommit={(v) => patchProject({ customFields: { ...customFields, [name]: v } })} />
              </div>
              <button className="md-btn md-btn-ghost" style={{ padding: 4 }} title="Remove field"
                onClick={() => {
                  const next = { ...customFields };
                  delete next[name];
                  patchProject({ customFields: next });
                }}><X size={12} /></button>
            </div>
          </Row>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input className="md-input" placeholder="Add a custom field (e.g. Format, Territory, Delivery spec)" value={newFieldName}
            onChange={(e) => setNewFieldName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCustomField(); }} />
          <button className="md-btn" onClick={addCustomField}><Plus size={13} /> Add field</button>
        </div>
      </Section>

      <Section title={`TASKS · ${tasks.filter((t) => t.status !== "done").length} OPEN`}>
        {tasks.map((t) => (
          <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
            <button className="md-btn md-btn-ghost" style={{ padding: 2 }}
              onClick={() => update("tasks", t.id, { status: t.status === "done" ? "todo" : "done", completedAt: t.status === "done" ? null : Date.now() })}>
              {t.status === "done" ? <CheckSquare size={15} color="var(--sage)" /> : <Square size={15} color="var(--dim)" />}
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <InlineText value={t.title} onCommit={(v) => update("tasks", t.id, { title: v })}
                style={{ textDecoration: t.status === "done" ? "line-through" : "none", color: t.status === "done" ? "var(--dim)" : "var(--bone)" }} />
            </div>
            <div style={{ width: 150, flexShrink: 0 }}>
              <MemberPicker team={data.team} selectedIds={t.assigneeIds || []} label="Assign" onChange={(ids) => update("tasks", t.id, { assigneeIds: ids })} />
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
                  {assignment.role || talent.discipline || "Crew"}
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
            <InlineText value={n.body} multiline onCommit={(v) => update("notes", n.id, { body: v, updatedAt: Date.now() })} />
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input className="md-input" placeholder="Write a note the team can edit…" value={note}
            onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addNote(); }} />
          <button className="md-btn" onClick={addNote}><Plus size={13} /> Note</button>
        </div>
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
