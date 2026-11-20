import { useMemo, useState } from "react";
import { Plus, Trash2, Download, FileText, ArrowRight, ArrowLeft, RotateCcw } from "lucide-react";
import { useStore } from "../lib/store";
import {
  sowDraftFromProject,
  sowExportPayload,
  buildSowSections,
  isArchivedProject,
  DEFAULT_SOW_STUDIO_NAME,
  DEFAULT_SOW_TITLE,
  SOW_OWNERSHIP_MODELS,
  SOW_FEEDBACK_WINDOWS,
  SOW_REVISION_ROUNDS,
  SOW_CREDIT_OPTIONS,
  makeSowDeliverable,
  makeSowSection,
  recordTypeInfo,
} from "../lib/model";
import { ModalShell, Field, Section, Badge } from "../ui/kit";
import { CompanySelect } from "../ui/CompanySelect";
import { downloadSowPdf, downloadSowDocx, sowPdfFile } from "../lib/sowExport";
import { uploadFile } from "../lib/files";

const STEPS = [
  { key: "deal", label: "Parties" },
  { key: "project", label: "Project & deliverables" },
  { key: "fees", label: "Fees & terms" },
  { key: "export", label: "Sections & export" },
];

const STUDIO_NAME = DEFAULT_SOW_STUDIO_NAME;

function draftFromSelection(data, projectId, extras = {}) {
  const project = projectId ? (data.projects || []).find((p) => p.id === projectId) : null;
  const company = project && project.companyId
    ? (data.companies || []).find((c) => c.id === project.companyId)
    : null;
  return sowDraftFromProject(project || null, {
    company,
    studioName: STUDIO_NAME,
    ...extras,
  });
}

function formatDealDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function DealSummary({ draft }) {
  const type = draft.recordType ? recordTypeInfo(draft.recordType) : null;
  const rows = [
    ["Client", draft.clientName || "—"],
    ["Contact", [draft.contactName, draft.contactEmail, draft.contactPhone].filter(Boolean).join(" · ") || "—"],
    ["Budget", draft.value || "—"],
    ["Start", formatDealDate(draft.startDate)],
    ["Delivery", formatDealDate(draft.endDate)],
    type ? ["Deal type", type.label] : null,
  ].filter(Boolean);
  if (!draft.projectId && !draft.clientName) return null;
  return (
    <div style={{
      border: "1px solid var(--rule)",
      borderRadius: 10,
      padding: 12,
      marginBottom: 14,
      background: "var(--panel-raised)",
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
      gap: 10,
    }}>
      {rows.map(([label, value]) => (
        <div key={label}>
          <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--dim)", marginBottom: 2 }}>{label.toUpperCase()}</div>
          <div style={{ fontSize: 13, color: "var(--bone)", lineHeight: 1.35 }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

export default function SowWizard({ projectId: initialProjectId = null, onClose }) {
  const { data, add, currentUser, companyName, showToast } = useStore();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(() => draftFromSelection(data, initialProjectId));

  const stepKey = STEPS[step].key;
  const preview = useMemo(() => sowExportPayload(draft), [draft]);
  const answers = draft.answers || {};

  const setField = (key, value) => setDraft((d) => ({ ...d, [key]: value, sectionsCustomized: false }));

  const setAnswer = (key, value) => setDraft((d) => ({
    ...d,
    answers: { ...(d.answers || {}), [key]: value },
    sectionsCustomized: false,
  }));

  const applyDeal = (projectId) => {
    setDraft((d) => {
      const next = draftFromSelection(data, projectId || null, {
        sowNumber: d.sowNumber,
        ownershipModel: d.ownershipModel || undefined,
        answers: {
          studioEntityDetail: d.answers?.studioEntityDetail,
          studioReps: d.answers?.studioReps,
          clientEntityDetail: d.answers?.clientEntityDetail,
          clientShortName: d.answers?.clientShortName,
        },
      });
      return {
        ...next,
        title: DEFAULT_SOW_TITLE,
        studioName: d.studioName || STUDIO_NAME,
        sowNumber: d.sowNumber || "",
        ownershipModel: projectId ? (next.ownershipModel || d.ownershipModel || "") : (d.ownershipModel || ""),
      };
    });
  };

  const syncClientName = (companyId) => {
    const company = (data.companies || []).find((c) => c.id === companyId);
    setDraft((d) => ({
      ...d,
      companyId: companyId || null,
      clientName: (company && company.name) || "",
      contactName: (company && company.contactName) || d.contactName || "",
      contactEmail: (company && company.contactEmail) || d.contactEmail || "",
      contactPhone: (company && company.contactPhone) || d.contactPhone || "",
      sectionsCustomized: false,
      answers: {
        ...d.answers,
        clientReps: [
          (company && company.contactName) || d.contactName,
          ((company && company.contactEmail) || d.contactEmail) && `(${(company && company.contactEmail) || d.contactEmail})`,
        ].filter(Boolean).join(" "),
      },
    }));
  };

  const updateDeliverable = (id, patch) => {
    setDraft((d) => ({
      ...d,
      sectionsCustomized: false,
      answers: {
        ...d.answers,
        deliverables: (d.answers.deliverables || []).map((row) => (row.id === id ? { ...row, ...patch } : row)),
      },
    }));
  };

  const rebuildSections = () => {
    setDraft((d) => ({
      ...d,
      sectionsCustomized: false,
      sections: buildSowSections(d),
    }));
  };

  const goToStep = (next) => {
    setStep(next);
    if (STEPS[next].key === "export") {
      setDraft((d) => {
        if (d.sectionsCustomized && (d.sections || []).length) return d;
        return { ...d, sections: buildSowSections(d), sectionsCustomized: false };
      });
    }
  };

  const updateSection = (id, patch) => {
    setDraft((d) => ({
      ...d,
      sectionsCustomized: true,
      sections: (d.sections || []).map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  };

  const removeSection = (id) => {
    setDraft((d) => ({
      ...d,
      sectionsCustomized: true,
      sections: (d.sections || []).filter((s) => s.id !== id),
    }));
  };

  const addSection = () => {
    setDraft((d) => ({
      ...d,
      sectionsCustomized: true,
      sections: [...(d.sections || []), makeSowSection({ title: "New section", body: "" })],
    }));
  };

  const saveDraft = async () => {
    if (!draft.title.trim()) {
      showToast("Give the Statement of Work a title.", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = sowExportPayload({
        ...draft,
        projectTitle: draft.projectId
          ? (((data.projects || []).find((p) => p.id === draft.projectId) || {}).title || draft.projectTitle)
          : draft.projectTitle,
        clientName: draft.clientName || companyName(draft.companyId) || "",
      });
      let fileMeta = {};
      try {
        fileMeta = await uploadFile(sowPdfFile(payload), "documents");
      } catch (err) {
        showToast(err.message || "Saved without attaching the PDF.", "info");
      }
      const saveTitle = payload.projectTitle
        ? `${payload.title} — ${payload.projectTitle}`
        : payload.title;
      add("contracts", {
        kind: "sow",
        title: saveTitle,
        companyId: draft.companyId || null,
        projectId: draft.projectId || null,
        status: "draft",
        value: payload.value,
        notes: [
          draft.sowNumber && `SOW No. ${draft.sowNumber}`,
          payload.ownershipModel && payload.ownershipLabel,
          draft.contactName && `Contact: ${draft.contactName}`,
          draft.contactEmail,
          draft.contactPhone,
        ].filter(Boolean).join(" · "),
        sections: payload.sections,
        answers: payload.answers,
        sowNumber: draft.sowNumber || "",
        ownershipModel: draft.ownershipModel || "",
        ownerId: currentUser && currentUser.id,
        signedAt: null,
        expiresAt: null,
        ...fileMeta,
      });
      showToast("Statement of Work saved as a draft agreement.", "success");
      onClose();
    } catch (err) {
      showToast(err.message || "Could not save the Statement of Work.", "error");
    } finally {
      setSaving(false);
    }
  };

  const exportDraft = {
    ...draft,
    clientName: draft.clientName || companyName(draft.companyId) || "",
  };

  return (
    <ModalShell
      wide
      zIndex={80}
      title="Create Statement of Work"
      subtitle={STEPS[step].label}
      status={<Badge label={`${step + 1} / ${STEPS.length}`} color="var(--accent)" />}
      onClose={onClose}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            className="md-btn md-btn-ghost"
            style={{
              fontSize: 12,
              border: i === step ? "1px solid var(--accent)" : "1px solid var(--rule)",
              color: i === step ? "var(--accent)" : "var(--dim)",
            }}
            onClick={() => goToStep(i)}
          >
            {i + 1}. {s.label}
          </button>
        ))}
      </div>

      {stepKey === "deal" && (
        <div>
          <Field label="DEAL" hint="Pulls client, contact, budget, and project title from the deal.">
            <select
              className="md-select"
              value={draft.projectId || ""}
              onChange={(e) => applyDeal(e.target.value || null)}
            >
              <option value="">No deal — start blank</option>
              {(data.projects || []).filter((p) => !isArchivedProject(p)).map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </Field>

          <DealSummary draft={draft} />

          <div className="md-split" style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12 }}>
            <Field label="SOW NO." hint="Internal reference only.">
              <input
                className="md-input"
                value={draft.sowNumber || ""}
                onChange={(e) => setField("sowNumber", e.target.value)}
                placeholder="2026-014"
              />
            </Field>
            <Field label="DOCUMENT TITLE">
              <input
                className="md-input"
                value={draft.title}
                onChange={(e) => setField("title", e.target.value)}
                placeholder={DEFAULT_SOW_TITLE}
              />
            </Field>
          </div>

          <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="CLIENT">
              <CompanySelect
                native
                value={draft.companyId || ""}
                placeholder="No company"
                onCommit={(id) => syncClientName(id || "")}
              />
            </Field>
            <Field label="OWNERSHIP MODEL">
              <select
                className="md-select"
                value={draft.ownershipModel || ""}
                onChange={(e) => setField("ownershipModel", e.target.value)}
              >
                <option value="">Choose…</option>
                {SOW_OWNERSHIP_MODELS.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="CLIENT LEGAL DETAIL" hint='e.g. a Singapore private limited company, operating as PixVerse'>
              <input className="md-input" value={answers.clientEntityDetail || ""} onChange={(e) => setAnswer("clientEntityDetail", e.target.value)} placeholder="a [jurisdiction] [entity type]" />
            </Field>
            <Field label="CLIENT SHORT NAME" hint='Shown as ("PixVerse")'>
              <input className="md-input" value={answers.clientShortName || ""} onChange={(e) => setAnswer("clientShortName", e.target.value)} placeholder="Client" />
            </Field>
          </div>

          <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="CONTACT">
              <input className="md-input" value={draft.contactName || ""} onChange={(e) => setField("contactName", e.target.value)} placeholder="Name" />
            </Field>
            <Field label="EMAIL">
              <input className="md-input" value={draft.contactEmail || ""} onChange={(e) => setField("contactEmail", e.target.value)} placeholder="name@company.com" />
            </Field>
            <Field label="PHONE">
              <input className="md-input" value={draft.contactPhone || ""} onChange={(e) => setField("contactPhone", e.target.value)} placeholder="+1…" />
            </Field>
          </div>

          <Field label="EFFECTIVE DATE">
            <input className="md-input" value={answers.effectiveDate || ""} onChange={(e) => setAnswer("effectiveDate", e.target.value)} placeholder="As of _____________ or a date" />
          </Field>

          <Section title="REPRESENTATIVES">
            <Field label="MATRIARCH">
              <textarea className="md-textarea" rows={2} value={answers.studioReps || ""} onChange={(e) => setAnswer("studioReps", e.target.value)} placeholder="Name (Title) (email); …" />
            </Field>
            <Field label="CLIENT">
              <textarea className="md-textarea" rows={2} value={answers.clientReps || ""} onChange={(e) => setAnswer("clientReps", e.target.value)} placeholder="Name, role (email)" />
            </Field>
          </Section>
        </div>
      )}

      {stepKey === "project" && (
        <div>
          <Field label="PROJECT TITLE">
            <input className="md-input" value={draft.projectTitle || ""} onChange={(e) => setField("projectTitle", e.target.value)} placeholder="PixVerse Original Short Film" />
          </Field>

          <Section title="DELIVERABLES">
            {(answers.deliverables || []).map((row, index) => (
              <div key={row.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr auto", gap: 8, marginBottom: 8 }}>
                <input className="md-input" value={row.name} onChange={(e) => updateDeliverable(row.id, { name: e.target.value })} placeholder={`Deliverable ${index + 1}`} />
                <input className="md-input" value={row.dueDate} onChange={(e) => updateDeliverable(row.id, { dueDate: e.target.value })} placeholder="Due date" />
                <input className="md-input" value={row.specs} onChange={(e) => updateDeliverable(row.id, { specs: e.target.value })} placeholder="Specs / notes" />
                <button
                  type="button"
                  className="md-btn md-btn-ghost"
                  style={{ color: "var(--red)" }}
                  disabled={(answers.deliverables || []).length <= 1}
                  onClick={() => setAnswer("deliverables", answers.deliverables.filter((d) => d.id !== row.id))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button type="button" className="md-btn md-btn-ghost" onClick={() => setAnswer("deliverables", [...(answers.deliverables || []), makeSowDeliverable()])}>
              <Plus size={14} /> Add deliverable
            </button>
          </Section>

          <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="FEEDBACK WINDOW">
              <select className="md-select" value={answers.feedbackWindow || "2"} onChange={(e) => setAnswer("feedbackWindow", e.target.value)}>
                {SOW_FEEDBACK_WINDOWS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="REVISIONS PER SUBMISSION">
              <select className="md-select" value={answers.revisionRounds || "1"} onChange={(e) => setAnswer("revisionRounds", e.target.value)}>
                {SOW_REVISION_ROUNDS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="APPROVALS LANGUAGE" hint="Leave blank to use the standard Matriarch feedback / revision / delay language.">
            <textarea className="md-textarea" rows={3} value={answers.approvalsExtra || ""} onChange={(e) => setAnswer("approvalsExtra", e.target.value)} placeholder="Optional override of the approvals paragraph" />
          </Field>

          <Field label="SOCIAL MEDIA POSTING">
            <textarea className="md-textarea" rows={3} value={answers.socialMediaPosting || ""} onChange={(e) => setAnswer("socialMediaPosting", e.target.value)} />
          </Field>

          <Field label="NON-UNION">
            <textarea className="md-textarea" rows={2} value={answers.nonUnion || ""} onChange={(e) => setAnswer("nonUnion", e.target.value)} />
          </Field>

          <Field label="AI TOOL CREDITS / EXPENSES">
            <textarea className="md-textarea" rows={2} value={answers.aiCreditsExpenses || ""} onChange={(e) => setAnswer("aiCreditsExpenses", e.target.value)} placeholder="Client provides access / credits…" />
          </Field>
        </div>
      )}

      {stepKey === "fees" && (
        <div>
          <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1.2fr 0.7fr 0.7fr", gap: 12 }}>
            <Field label="FEE (USD)">
              <input
                className="md-input"
                value={answers.feeAmount || draft.value || ""}
                onChange={(e) => {
                  const feeAmount = e.target.value;
                  setDraft((d) => ({
                    ...d,
                    value: feeAmount,
                    sectionsCustomized: false,
                    answers: { ...d.answers, feeAmount },
                  }));
                }}
                placeholder="$12,000"
              />
            </Field>
            <Field label="DEPOSIT %">
              <input className="md-input" value={answers.depositPct || ""} onChange={(e) => setAnswer("depositPct", e.target.value)} placeholder="75" />
            </Field>
            <Field label="FINAL %">
              <input className="md-input" value={answers.finalPct || ""} onChange={(e) => setAnswer("finalPct", e.target.value)} placeholder="25" />
            </Field>
          </div>
          <Field label="PAYMENT NOTES">
            <textarea className="md-textarea" rows={2} value={answers.paymentNotes || ""} onChange={(e) => setAnswer("paymentNotes", e.target.value)} />
          </Field>
          <Field label="KILL FEE">
            <textarea className="md-textarea" rows={3} value={answers.killFee || ""} onChange={(e) => setAnswer("killFee", e.target.value)} />
          </Field>

          <Section title="RIGHTS">
            {draft.ownershipModel !== "clientOwned" && (
              <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="LICENSE TERRITORY">
                  <input className="md-input" value={answers.licenseTerritory || ""} onChange={(e) => setAnswer("licenseTerritory", e.target.value)} />
                </Field>
                <Field label="LICENSE TERM">
                  <input className="md-input" value={answers.licenseTerm || ""} onChange={(e) => setAnswer("licenseTerm", e.target.value)} />
                </Field>
                <Field label="PAID MEDIA WINDOW">
                  <input className="md-input" value={answers.licensePaidMedia || ""} onChange={(e) => setAnswer("licensePaidMedia", e.target.value)} />
                </Field>
                <Field label="EXCLUSIVITY">
                  <input className="md-input" value={answers.exclusivity || ""} onChange={(e) => setAnswer("exclusivity", e.target.value)} />
                </Field>
              </div>
            )}
            <Field label="PERMITTED USES / MEDIA">
              <textarea className="md-textarea" rows={2} value={answers.licenseMedia || ""} onChange={(e) => setAnswer("licenseMedia", e.target.value)} />
            </Field>
            <Field label="RESTRICTIONS">
              <textarea className="md-textarea" rows={2} value={answers.licenseRestrictions || ""} onChange={(e) => setAnswer("licenseRestrictions", e.target.value)} />
            </Field>
            <Field label="RIGHTS EXTRA">
              <textarea className="md-textarea" rows={2} value={answers.rightsExtra || ""} onChange={(e) => setAnswer("rightsExtra", e.target.value)} />
            </Field>
          </Section>

          <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="CREDIT">
              <select className="md-select" value={answers.credit || ""} onChange={(e) => setAnswer("credit", e.target.value)}>
                {SOW_CREDIT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="ADDITIONAL CREDIT">
              <input className="md-input" value={answers.creditExtra || ""} onChange={(e) => setAnswer("creditExtra", e.target.value)} placeholder='"A PixVerse Original"' />
            </Field>
          </div>
          {answers.credit === "custom" && (
            <Field label="CUSTOM CREDIT">
              <input className="md-input" value={answers.creditCustom || ""} onChange={(e) => setAnswer("creditCustom", e.target.value)} />
            </Field>
          )}

          <Field label="CLIENT NOTICE ADDRESS">
            <textarea className="md-textarea" rows={3} value={answers.clientNotice || ""} onChange={(e) => setAnswer("clientNotice", e.target.value)} placeholder={"Legal name\nAddress\nAttn: Name (email)"} />
          </Field>
          <Field label="MATRIARCH NOTICE">
            <textarea className="md-textarea" rows={3} value={answers.studioNotice || ""} onChange={(e) => setAnswer("studioNotice", e.target.value)} />
          </Field>
          <Field label="GOVERNING LAW & DISPUTE RESOLUTION">
            <textarea className="md-textarea" rows={3} value={answers.governingLaw || ""} onChange={(e) => setAnswer("governingLaw", e.target.value)} />
          </Field>
          <Field label="INDEMNIFICATION">
            <textarea className="md-textarea" rows={3} value={answers.indemnification || ""} onChange={(e) => setAnswer("indemnification", e.target.value)} />
          </Field>
          <Field label="MISCELLANEOUS">
            <textarea className="md-textarea" rows={3} value={answers.miscellaneous || ""} onChange={(e) => setAnswer("miscellaneous", e.target.value)} />
          </Field>
        </div>
      )}

      {stepKey === "export" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.4 }}>
              Edit or remove any section before export. Removed sections will not appear in the PDF or Word file.
            </div>
            <button type="button" className="md-btn md-btn-ghost" onClick={rebuildSections} title="Rebuild from form answers">
              <RotateCcw size={14} /> Rebuild from answers
            </button>
          </div>

          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>{preview.title}</div>
          <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 16, whiteSpace: "pre-wrap" }}>
            {[preview.studioParty, preview.clientParty].filter(Boolean).join("\n")}
          </div>

          {(draft.sections || []).map((section) => (
            <div key={section.id} style={{ border: "1px solid var(--rule)", borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input
                  className="md-input"
                  value={section.title}
                  onChange={(e) => updateSection(section.id, { title: e.target.value })}
                  style={{ fontWeight: 700 }}
                />
                <button type="button" className="md-btn md-btn-ghost" style={{ color: "var(--red)" }} onClick={() => removeSection(section.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
              <textarea
                className="md-textarea"
                rows={section.key === "signatures" || section.key === "notices" ? 5 : 3}
                value={section.body}
                onChange={(e) => updateSection(section.id, { body: e.target.value })}
              />
            </div>
          ))}

          <button type="button" className="md-btn md-btn-ghost" onClick={addSection}>
            <Plus size={14} /> Add section
          </button>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
            <button type="button" className="md-btn md-btn-ghost" style={{ border: "1px solid var(--rule)" }}
              onClick={() => downloadSowPdf(exportDraft)}>
              <Download size={14} /> Download PDF
            </button>
            <button type="button" className="md-btn md-btn-ghost" style={{ border: "1px solid var(--rule)" }}
              onClick={() => downloadSowDocx(exportDraft)}>
              <FileText size={14} /> Download Word
            </button>
            <button type="button" className="md-btn md-btn-primary" disabled={saving} onClick={saveDraft}>
              {saving ? "Saving…" : "Save draft agreement"}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 22, paddingTop: 14, borderTop: "1px solid var(--rule)" }}>
        <button type="button" className="md-btn md-btn-ghost" disabled={step === 0} onClick={() => goToStep(Math.max(0, step - 1))}>
          <ArrowLeft size={14} /> Back
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" className="md-btn md-btn-primary" onClick={() => goToStep(Math.min(STEPS.length - 1, step + 1))}>
            Next <ArrowRight size={14} />
          </button>
        ) : (
          <button type="button" className="md-btn md-btn-primary" disabled={saving} onClick={saveDraft}>
            {saving ? "Saving…" : "Save draft"}
          </button>
        )}
      </div>
    </ModalShell>
  );
}
