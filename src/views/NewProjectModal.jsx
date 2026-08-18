import { useState } from "react";
import { useStore } from "../lib/store";
import { RECORD_TYPES, STAGES, PRIORITIES, recordTypeInfo, stageInfo } from "../lib/model";
import { ModalShell, Field, FileAttachButton, AttachmentRow } from "../ui/kit";

export default function NewProjectModal({ onClose, initialTitle = "", initialDesc = "", onCreated }) {
  const { data, add, currentUser } = useStore();
  const [form, setForm] = useState({
    title: initialTitle,
    description: initialDesc,
    recordType: "service",
    stage: STAGES[0].key,
    pipelineStage: "",
    ownerId: (currentUser && currentUser.id) || "",
    companyId: "",
    budget: "",
    priority: "HIGH",
    nextStep: "",
  });
  const [image, setImage] = useState(null);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const pipeline = data.pipelines[form.recordType] || [];

  const submit = () => {
    if (!form.title.trim()) { setError("Give the project a title."); return; }
    const now = Date.now();
    const project = add("projects", {
      title: form.title.trim(),
      description: form.description.trim(),
      recordType: form.recordType,
      stage: form.stage,
      pipelineStage: form.pipelineStage || (pipeline[0] || {}).key,
      ownerId: form.ownerId || null,
      teamIds: [],
      companyId: form.companyId || null,
      budget: form.budget.trim(),
      priority: form.priority,
      nextStep: form.nextStep.trim(),
      paymentStatus: "na",
      imagePath: image ? image.filePath : "",
      imageUrl: image ? image.fileUrl : "",
      customFields: {},
      createdAt: now,
      updatedAt: now,
      history: [{ id: `h-${now}`, date: now, note: `Added to the board — ${recordTypeInfo(form.recordType).label}` }],
    });
    if (onCreated) onCreated(project);
    onClose();
  };

  return (
    <ModalShell title="New Project" onClose={onClose}>
      <Field label="TITLE"><input className="md-input" autoFocus value={form.title} onChange={set("title")} placeholder="Project title" /></Field>
      <Field label="TYPE" hint={recordTypeInfo(form.recordType).description}>
        <select className="md-select" value={form.recordType} onChange={(e) => setForm((f) => ({ ...f, recordType: e.target.value, pipelineStage: "" }))}>
          {RECORD_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </Field>
      <Field label="LOGLINE / DESCRIPTION"><textarea className="md-textarea" rows={3} value={form.description} onChange={set("description")} placeholder="What is this project about?" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="PIPELINE STAGE">
          <select className="md-select" value={form.pipelineStage || (pipeline[0] || {}).key || ""} onChange={set("pipelineStage")}>
            {pipeline.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="PRODUCTION STAGE">
          <select className="md-select" value={form.stage} onChange={set("stage")}>
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="OWNER">
          <select className="md-select" value={form.ownerId} onChange={set("ownerId")}>
            <option value="">Unassigned</option>
            {data.team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <Field label="COMPANY">
          <select className="md-select" value={form.companyId} onChange={set("companyId")}>
            <option value="">No company</option>
            {data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="BUDGET / VALUE"><input className="md-input" value={form.budget} onChange={set("budget")} placeholder="e.g. $12.5M" /></Field>
        <Field label="PRIORITY">
          <select className="md-select" value={form.priority} onChange={set("priority")}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
      </div>
      <Field label="NEXT STEP"><input className="md-input" value={form.nextStep} onChange={set("nextStep")} placeholder="Immediate action item" /></Field>
      <Field label="PROJECT IMAGE">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <FileAttachButton kind="images" label="Upload key art or still" accept="image/*" onUploaded={setImage} />
          {image && <AttachmentRow record={image} onRemove={() => setImage(null)} />}
        </div>
      </Field>
      {error && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 10 }}>{error}</div>}
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>Add to Board</button>
    </ModalShell>
  );
}
