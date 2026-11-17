import { useMemo, useState } from "react";
import { Plus, Trash2, Download, FileText, ArrowRight, ArrowLeft } from "lucide-react";
import { useStore } from "../lib/store";
import {
  sowDraftFromProject,
  sowExportPayload,
  isArchivedProject,
  DEFAULT_SOW_STUDIO_NAME,
  SOW_OWNERSHIP_MODELS,
  SOW_FORMATS,
  SOW_PRODUCTION_METHODS,
  SOW_AI_TOOLS_OPTIONS,
  SOW_DELIVERY_METHODS,
  SOW_FEEDBACK_WINDOWS,
  SOW_REVISION_ROUNDS,
  SOW_TALENT_OPTIONS,
  SOW_CREDIT_OPTIONS,
  SOW_PORTFOLIO_OPTIONS,
  SOW_WEATHER_OPTIONS,
  makeSowDeliverable,
  makeSowClientMaterial,
  recordTypeInfo,
} from "../lib/model";
import { ModalShell, Field, Section, Badge } from "../ui/kit";
import { CompanySelect } from "../ui/CompanySelect";
import { downloadSowPdf, downloadSowDocx, sowPdfFile } from "../lib/sowExport";
import { uploadFile } from "../lib/files";

const STEPS = [
  { key: "deal", label: "Deal" },
  { key: "project", label: "Project" },
  { key: "fees", label: "Fees & terms" },
  { key: "export", label: "Preview & export" },
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

function buildSowTitle(sowNumber, projectTitle) {
  const numberPart = String(sowNumber || "").trim() || "[●]";
  return projectTitle
    ? `Statement of Work No. ${numberPart} — ${projectTitle}`
    : `Statement of Work No. ${numberPart}`;
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
      {(draft.milestones || []).length > 0 && (
        <div style={{ gridColumn: "1 / -1" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.06em", color: "var(--dim)", marginBottom: 2 }}>MILESTONES FROM DEAL</div>
          <div style={{ fontSize: 13, color: "var(--bone)" }}>
            {draft.milestones.map((m) => `${m.label}: ${m.dateLabel}`).join(" · ")}
          </div>
        </div>
      )}
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

  const setField = (key, value) => setDraft((d) => {
    const next = { ...d, [key]: value };
    if (key === "sowNumber" || key === "projectTitle") {
      next.title = buildSowTitle(next.sowNumber, next.projectTitle);
    }
    return next;
  });

  const setAnswer = (key, value) => setDraft((d) => ({
    ...d,
    answers: { ...(d.answers || {}), [key]: value },
  }));

  const applyDeal = (projectId) => {
    setDraft((d) => {
      const next = draftFromSelection(data, projectId || null, {
        sowNumber: d.sowNumber,
        ownershipModel: d.ownershipModel || undefined,
        answers: {
          studioRepName: d.answers?.studioRepName,
          studioRepTitle: d.answers?.studioRepTitle,
          studioEmail: d.answers?.studioEmail,
          studioPhone: d.answers?.studioPhone,
          clientEntityType: d.answers?.clientEntityType,
          clientState: d.answers?.clientState,
        },
      });
      return {
        ...next,
        title: projectId ? next.title : (d.title || next.title),
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
    }));
  };

  const updateDeliverable = (id, patch) => {
    setDraft((d) => ({
      ...d,
      answers: {
        ...d.answers,
        deliverables: (d.answers.deliverables || []).map((row) => (row.id === id ? { ...row, ...patch } : row)),
      },
    }));
  };

  const updateMaterial = (id, patch) => {
    setDraft((d) => ({
      ...d,
      answers: {
        ...d.answers,
        clientMaterials: (d.answers.clientMaterials || []).map((row) => (row.id === id ? { ...row, ...patch } : row)),
      },
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
      add("contracts", {
        kind: "sow",
        title: payload.title,
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
            onClick={() => setStep(i)}
          >
            {i + 1}. {s.label}
          </button>
        ))}
      </div>

      {stepKey === "deal" && (
        <div>
          <Field label="DEAL" hint="Pulls client, contact, budget, dates, and scope from the deal.">
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
            <Field label="SOW NO.">
              <input
                className="md-input"
                value={draft.sowNumber || ""}
                onChange={(e) => setField("sowNumber", e.target.value)}
                placeholder="2026-014"
              />
            </Field>
            <Field label="TITLE">
              <input
                className="md-input"
                value={draft.title}
                onChange={(e) => setField("title", e.target.value)}
                placeholder="Statement of Work No. [●] — Project name"
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

          <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="TOTAL APPROVED BUDGET">
              <input
                className="md-input"
                value={draft.value || ""}
                onChange={(e) => {
                  const value = e.target.value;
                  setDraft((d) => ({
                    ...d,
                    value,
                    answers: {
                      ...d.answers,
                      productionFee: d.answers?.productionFee || value,
                    },
                  }));
                }}
                placeholder="e.g. $180,000"
              />
            </Field>
            <Field label="CLIENT STATE">
              <input className="md-input" value={answers.clientState || ""} onChange={(e) => setAnswer("clientState", e.target.value)} placeholder="e.g. Delaware" />
            </Field>
            <Field label="CLIENT ENTITY TYPE">
              <input className="md-input" value={answers.clientEntityType || ""} onChange={(e) => setAnswer("clientEntityType", e.target.value)} placeholder="e.g. corporation" />
            </Field>
          </div>

          <Section title="MATRIARCH APPROVALS CONTACT">
            <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="NAME">
                <input className="md-input" value={answers.studioRepName || ""} onChange={(e) => setAnswer("studioRepName", e.target.value)} placeholder="Name" />
              </Field>
              <Field label="TITLE">
                <input className="md-input" value={answers.studioRepTitle || ""} onChange={(e) => setAnswer("studioRepTitle", e.target.value)} placeholder="Title" />
              </Field>
              <Field label="EMAIL">
                <input className="md-input" value={answers.studioEmail || ""} onChange={(e) => setAnswer("studioEmail", e.target.value)} placeholder="email@matriarch…" />
              </Field>
              <Field label="PHONE">
                <input className="md-input" value={answers.studioPhone || ""} onChange={(e) => setAnswer("studioPhone", e.target.value)} placeholder="+1…" />
              </Field>
            </div>
          </Section>
        </div>
      )}

      {stepKey === "project" && (
        <div>
          <Field label="SCOPE OF WORK" hint={draft.projectId ? "Pulled from the deal description — edit if needed." : ""}>
            <textarea
              className="md-textarea"
              rows={4}
              value={answers.scope || ""}
              onChange={(e) => setAnswer("scope", e.target.value)}
              placeholder="Describe the project…"
            />
          </Field>

          <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="FORMAT">
              <select className="md-select" value={answers.format || ""} onChange={(e) => setAnswer("format", e.target.value)}>
                <option value="">Choose…</option>
                {SOW_FORMATS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="FORMAT DETAIL">
              <input className="md-input" value={answers.formatDetail || ""} onChange={(e) => setAnswer("formatDetail", e.target.value)} placeholder="Length, episodes, cuts…" />
            </Field>
            <Field label="PRODUCTION METHOD">
              <select className="md-select" value={answers.productionMethod || ""} onChange={(e) => setAnswer("productionMethod", e.target.value)}>
                <option value="">Choose…</option>
                {SOW_PRODUCTION_METHODS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="AI TOOLS">
              <select className="md-select" value={answers.aiTools || ""} onChange={(e) => setAnswer("aiTools", e.target.value)}>
                {SOW_AI_TOOLS_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </Field>
          </div>
          {answers.aiTools === "custom" && (
            <Field label="AI TOOLS LIST">
              <input className="md-input" value={answers.aiToolsCustom || ""} onChange={(e) => setAnswer("aiToolsCustom", e.target.value)} placeholder="List approved or restricted tools" />
            </Field>
          )}
          <Field label="OUT OF SCOPE">
            <textarea className="md-textarea" rows={2} value={answers.outOfScope || ""} onChange={(e) => setAnswer("outOfScope", e.target.value)} placeholder="Anything expressly excluded…" />
          </Field>

          {draft.ownershipModel === "studioOwned" && (
            <Section title="STUDIO-OWNED LICENSE">
              <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="MEDIA"><input className="md-input" value={answers.licenseMedia || ""} onChange={(e) => setAnswer("licenseMedia", e.target.value)} /></Field>
                <Field label="TERRITORY"><input className="md-input" value={answers.licenseTerritory || ""} onChange={(e) => setAnswer("licenseTerritory", e.target.value)} /></Field>
                <Field label="TERM"><input className="md-input" value={answers.licenseTerm || ""} onChange={(e) => setAnswer("licenseTerm", e.target.value)} /></Field>
                <Field label="EXCLUSIVITY"><input className="md-input" value={answers.licenseExclusivity || ""} onChange={(e) => setAnswer("licenseExclusivity", e.target.value)} /></Field>
              </div>
              <Field label="SPONSORSHIP / INTEGRATION RIGHTS">
                <input className="md-input" value={answers.licenseSponsorship || ""} onChange={(e) => setAnswer("licenseSponsorship", e.target.value)} />
              </Field>
            </Section>
          )}

          <Field label="THIRD-PARTY MATERIALS">
            <input className="md-input" value={answers.thirdPartyMaterials || ""} onChange={(e) => setAnswer("thirdPartyMaterials", e.target.value)} placeholder="Music, stock, fonts, talent usage…" />
          </Field>

          <Section title="FINAL DELIVERABLES">
            {(answers.deliverables || []).map((row, index) => (
              <div key={row.id} style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr auto", gap: 8, marginBottom: 8 }}>
                <input className="md-input" value={row.name} onChange={(e) => updateDeliverable(row.id, { name: e.target.value })} placeholder={`Deliverable ${index + 1}`} />
                <input className="md-input" value={row.specs} onChange={(e) => updateDeliverable(row.id, { specs: e.target.value })} placeholder="Specs" />
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
            <div style={{ marginTop: 12 }}>
              <Field label="DELIVERY METHOD">
                <select className="md-select" value={answers.deliveryMethod || ""} onChange={(e) => setAnswer("deliveryMethod", e.target.value)}>
                  {SOW_DELIVERY_METHODS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </Field>
              {answers.deliveryMethod === "other" && (
                <Field label="DELIVERY METHOD DETAIL">
                  <input className="md-input" value={answers.deliveryMethodOther || ""} onChange={(e) => setAnswer("deliveryMethodOther", e.target.value)} />
                </Field>
              )}
            </div>
          </Section>

          <Section title="CLIENT MATERIALS">
            {(answers.clientMaterials || []).map((row) => (
              <div key={row.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr auto", gap: 8, marginBottom: 8 }}>
                <input className="md-input" value={row.material} onChange={(e) => updateMaterial(row.id, { material: e.target.value })} placeholder="Material" />
                <input className="md-input" value={row.format} onChange={(e) => updateMaterial(row.id, { format: e.target.value })} placeholder="Format" />
                <input className="md-input" value={row.dueDate} onChange={(e) => updateMaterial(row.id, { dueDate: e.target.value })} placeholder="Due date" />
                <button
                  type="button"
                  className="md-btn md-btn-ghost"
                  style={{ color: "var(--red)" }}
                  onClick={() => setAnswer("clientMaterials", answers.clientMaterials.filter((m) => m.id !== row.id))}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button type="button" className="md-btn md-btn-ghost" onClick={() => setAnswer("clientMaterials", [...(answers.clientMaterials || []), makeSowClientMaterial()])}>
              <Plus size={14} /> Add material
            </button>
          </Section>

          <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="FEEDBACK WINDOW">
              <select className="md-select" value={answers.feedbackWindow || "3"} onChange={(e) => setAnswer("feedbackWindow", e.target.value)}>
                {SOW_FEEDBACK_WINDOWS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="REVISION ROUNDS">
              <select className="md-select" value={answers.revisionRounds || "2"} onChange={(e) => setAnswer("revisionRounds", e.target.value)}>
                {SOW_REVISION_ROUNDS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </Field>
          </div>

          {(draft.startDate || draft.endDate || (draft.milestones || []).length > 0) && (
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--dim)" }}>
              Timeline dates come from the deal
              {draft.startDate ? ` · Start ${formatDealDate(draft.startDate)}` : ""}
              {draft.endDate ? ` · Delivery ${formatDealDate(draft.endDate)}` : ""}
              {(draft.milestones || []).length ? ` · ${draft.milestones.map((m) => m.label).join(", ")}` : ""}.
            </div>
          )}
        </div>
      )}

      {stepKey === "fees" && (
        <div>
          <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="PRODUCTION FEE">
              <input className="md-input" value={answers.productionFee || ""} onChange={(e) => setAnswer("productionFee", e.target.value)} placeholder={draft.value || "Amount"} />
            </Field>
            <Field label="EST. THIRD-PARTY COSTS">
              <input className="md-input" value={answers.thirdPartyCosts || ""} onChange={(e) => setAnswer("thirdPartyCosts", e.target.value)} placeholder="Amount" />
            </Field>
            <Field label="CONTINGENCY %">
              <input className="md-input" value={answers.contingencyPct || ""} onChange={(e) => setAnswer("contingencyPct", e.target.value)} placeholder="10" />
            </Field>
            <Field label="CONTINGENCY AMOUNT">
              <input className="md-input" value={answers.contingencyAmount || ""} onChange={(e) => setAnswer("contingencyAmount", e.target.value)} placeholder="Amount" />
            </Field>
            <Field label="THIRD-PARTY MARKUP %">
              <input className="md-input" value={answers.thirdPartyMarkupPct || ""} onChange={(e) => setAnswer("thirdPartyMarkupPct", e.target.value)} placeholder="e.g. 15" />
            </Field>
            <Field label="WEATHER / HOLDS BILLING">
              <select className="md-select" value={answers.weatherBilling || "actual"} onChange={(e) => setAnswer("weatherBilling", e.target.value)}>
                {SOW_WEATHER_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </Field>
          </div>
          {answers.weatherBilling === "custom" && (
            <Field label="WEATHER RATE">
              <input className="md-input" value={answers.weatherRateCustom || ""} onChange={(e) => setAnswer("weatherRateCustom", e.target.value)} placeholder="Rate or description" />
            </Field>
          )}

          <Section title="PRODUCTION TERMS">
            <Field label="KEY PERSONNEL">
              <input className="md-input" value={answers.keyPersonnel || ""} onChange={(e) => setAnswer("keyPersonnel", e.target.value)} placeholder="Director, producer, AI lead…" />
            </Field>
            <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="TALENT / GUILD">
                <select className="md-select" value={answers.talentStatus || ""} onChange={(e) => setAnswer("talentStatus", e.target.value)}>
                  {SOW_TALENT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="TALENT NOTES">
                <input className="md-input" value={answers.talentNotes || ""} onChange={(e) => setAnswer("talentNotes", e.target.value)} placeholder="Signatory, usage…" />
              </Field>
              <Field label="CREDIT">
                <select className="md-select" value={answers.credit || ""} onChange={(e) => setAnswer("credit", e.target.value)}>
                  {SOW_CREDIT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="PORTFOLIO USE">
                <select className="md-select" value={answers.portfolioUse || ""} onChange={(e) => setAnswer("portfolioUse", e.target.value)}>
                  {SOW_PORTFOLIO_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </Field>
            </div>
            {answers.credit === "custom" && (
              <Field label="CUSTOM CREDIT">
                <input className="md-input" value={answers.creditCustom || ""} onChange={(e) => setAnswer("creditCustom", e.target.value)} />
              </Field>
            )}
            <Field label="INSURANCE">
              <input className="md-input" value={answers.insurance || ""} onChange={(e) => setAnswer("insurance", e.target.value)} placeholder="E&O, additional insured…" />
            </Field>
          </Section>

          <Field label="SPECIAL TERMS">
            <textarea className="md-textarea" rows={3} value={answers.specialTerms || ""} onChange={(e) => setAnswer("specialTerms", e.target.value)} placeholder="Leave blank for none." />
          </Field>
        </div>
      )}

      {stepKey === "export" && (
        <div>
          <Section title="PREVIEW">
            <div className="md-display" style={{ fontSize: 20, marginBottom: 8 }}>{preview.title}</div>
            <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 16 }}>
              {[preview.studioName, preview.clientName].filter(Boolean).join(" · ")}
              {preview.projectTitle ? ` · ${preview.projectTitle}` : ""}
              {preview.value ? ` · Budget ${preview.value}` : ""}
              {preview.ownershipModel ? ` · ${preview.ownershipLabel}` : ""}
            </div>
            {preview.sections.map((section, index) => (
              <div key={section.id || index} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{index + 1}. {section.title}</div>
                <div style={{ fontSize: 13, whiteSpace: "pre-wrap", color: "var(--bone)", lineHeight: 1.5 }}>
                  {section.body || <span style={{ color: "var(--dim)" }}>(empty)</span>}
                </div>
              </div>
            ))}
          </Section>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
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
        <button type="button" className="md-btn md-btn-ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          <ArrowLeft size={14} /> Back
        </button>
        {step < STEPS.length - 1 ? (
          <button type="button" className="md-btn md-btn-primary" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
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
