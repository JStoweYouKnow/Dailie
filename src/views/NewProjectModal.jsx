import { useState } from "react";
import { useStore } from "../lib/store";
import { RECORD_TYPES, STAGES, PRIORITIES, recordTypeInfo, withProjectOwners } from "../lib/model";
import { ModalShell, Field, FileAttachButton, AttachmentRow, MemberPicker } from "../ui/kit";
import { useDraftUploads } from "../lib/draftUploads";
import { storedInlineUrl } from "../lib/blobUrls.js";

export default function NewProjectModal({ onClose, initialTitle = "", initialDesc = "", onCreated }) {
  const { data, add, currentUser, showToast, memberName } = useStore();
  const drafts = useDraftUploads();
  const [form, setForm] = useState({
    title: initialTitle,
    description: initialDesc,
    recordType: "service",
    stage: STAGES[0].key,
    pipelineStage: "",
    ownerIds: currentUser && currentUser.id ? [currentUser.id] : [],
    teamIds: [],
    companyId: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
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
    const owners = withProjectOwners(form.ownerIds);
    const ownerNames = (owners.ownerIds || []).map(memberName).filter(Boolean);
    const project = add("projects", {
      title: form.title.trim(),
      description: form.description.trim(),
      recordType: form.recordType,
      stage: form.stage,
      pipelineStage: form.pipelineStage || (pipeline[0] || {}).key,
      ...owners,
      teamIds: (form.teamIds || []).filter((id) => !(owners.ownerIds || []).includes(id)),
      companyId: form.companyId || null,
      contactName: form.contactName.trim(),
      contactEmail: form.contactEmail.trim().toLowerCase(),
      contactPhone: form.contactPhone.trim(),
      budget: form.budget.trim(),
      priority: form.priority,
      nextStep: form.nextStep.trim(),
      paymentStatus: "na",
      imagePath: image ? image.filePath : "",
      imageUrl: image ? storedInlineUrl(image.fileUrl) : "",
      customFields: {},
      createdAt: now,
      updatedAt: now,
      history: [{
        id: `h-${now}`,
        date: now,
        note: ownerNames.length
          ? `Added to the board — ${recordTypeInfo(form.recordType).label}. Owners: ${ownerNames.join(", ")}`
          : `Added to the board — ${recordTypeInfo(form.recordType).label}`,
      }],
    });
    drafts.markSaved();
    showToast(`"${project.title}" saved.`, "success");
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
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
      <Field label="OWNERS" hint="Who is responsible. Pick one person or several — you can pass ownership around later.">
        <MemberPicker
          team={data.team}
          selectedIds={form.ownerIds}
          label="Assign owners"
          onChange={(ids) => setForm((f) => ({ ...f, ownerIds: ids }))}
        />
      </Field>
      <Field label="TEAM MEMBERS" hint="Everyone else working the project. They can be made owners later.">
        <MemberPicker
          team={data.team}
          selectedIds={form.teamIds}
          label="Assign team"
          onChange={(ids) => setForm((f) => ({ ...f, teamIds: ids }))}
        />
      </Field>
      <Field label="COMPANY">
        <select className="md-select" value={form.companyId} onChange={(e) => {
          const companyId = e.target.value;
          const company = data.companies.find((c) => c.id === companyId);
          setForm((f) => ({
            ...f,
            companyId,
            contactName: f.contactName || (company && company.contactName) || "",
            contactEmail: f.contactEmail || (company && company.contactEmail) || "",
            contactPhone: f.contactPhone || (company && company.contactPhone) || "",
          }));
        }}>
          <option value="">No company</option>
          {data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="CONTACT PERSON"><input className="md-input" value={form.contactName} onChange={set("contactName")} placeholder="Who we call" /></Field>
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="CONTACT EMAIL"><input className="md-input" value={form.contactEmail} onChange={set("contactEmail")} placeholder="name@company.com" /></Field>
        <Field label="PHONE"><input className="md-input" value={form.contactPhone} onChange={set("contactPhone")} placeholder="+1 (555) 000-0000" /></Field>
      </div>
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
          <FileAttachButton kind="images" label="Upload key art or still" accept="image/*"
            onUploaded={(next) => { if (image) drafts.drop(image); if (drafts.keep(next)) setImage(next); }} />
          {image && <AttachmentRow record={image} onRemove={() => { drafts.drop(image); setImage(null); }} />}
        </div>
      </Field>
      {error && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 10 }}>{error}</div>}
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>Add to Board</button>
    </ModalShell>
  );
}
