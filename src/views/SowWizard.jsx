import { useMemo, useState } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Download, FileText, ArrowRight, ArrowLeft } from "lucide-react";
import { useStore } from "../lib/store";
import {
  makeSowSection,
  sowDraftFromProject,
  sowExportPayload,
  normalizeSowSections,
  isArchivedProject,
  DEFAULT_SOW_STUDIO_NAME,
  SOW_OWNERSHIP_MODELS,
} from "../lib/model";
import { uid } from "../lib/format";
import { ModalShell, Field, Section, Badge } from "../ui/kit";
import { CompanySelect } from "../ui/CompanySelect";
import { downloadSowPdf, downloadSowDocx, sowPdfFile } from "../lib/sowExport";
import { uploadFile } from "../lib/files";

const STEPS = [
  { key: "parties", label: "Deal & parties" },
  { key: "sections", label: "Sections" },
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

export default function SowWizard({ projectId: initialProjectId = null, onClose }) {
  const { data, add, currentUser, companyName, showToast } = useStore();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(() => draftFromSelection(data, initialProjectId));

  const stepKey = STEPS[step].key;
  const preview = useMemo(() => sowExportPayload(draft), [draft]);

  const setField = (key, value) => setDraft((d) => ({ ...d, [key]: value }));

  const applyDeal = (projectId) => {
    setDraft((d) => {
      const next = draftFromSelection(data, projectId || null, {
        sowNumber: d.sowNumber,
        ownershipModel: d.ownershipModel,
      });
      return {
        ...next,
        // Keep an edited title if the user already typed one and is clearing the deal.
        title: projectId ? next.title : (d.title || next.title),
        studioName: d.studioName || STUDIO_NAME,
        sowNumber: d.sowNumber || "",
        ownershipModel: d.ownershipModel || "",
      };
    });
  };

  const setSowMeta = (patch) => {
    setDraft((d) => {
      const next = { ...d, ...patch };
      if ("sowNumber" in patch || "projectTitle" in patch) {
        const project = next.projectId
          ? (data.projects || []).find((p) => p.id === next.projectId)
          : null;
        const projectTitle = (project && project.title) || next.projectTitle || "";
        next.projectTitle = projectTitle;
        next.title = buildSowTitle(next.sowNumber, projectTitle);
      }
      if ("ownershipModel" in patch) {
        const rebuilt = sowDraftFromProject(
          next.projectId ? (data.projects || []).find((p) => p.id === next.projectId) : null,
          {
            company: next.companyId
              ? (data.companies || []).find((c) => c.id === next.companyId)
              : (next.clientName ? { name: next.clientName } : null),
            studioName: next.studioName,
            sowNumber: next.sowNumber,
            ownershipModel: next.ownershipModel,
          },
        );
        const ownership = rebuilt.sections.find((s) => /Ownership and Rights/i.test(s.title));
        if (ownership) {
          next.sections = normalizeSowSections((next.sections || []).map((s) => (
            /Ownership and Rights/i.test(s.title) ? { ...s, body: ownership.body } : s
          )));
        }
      }
      return next;
    });
  };

  const updateSection = (id, patch) => {
    setDraft((d) => ({
      ...d,
      sections: normalizeSowSections((d.sections || []).map((s) => (s.id === id ? { ...s, ...patch } : s))),
    }));
  };

  const moveSection = (id, dir) => {
    setDraft((d) => {
      const list = [...(d.sections || [])];
      const idx = list.findIndex((s) => s.id === id);
      if (idx < 0) return d;
      const next = idx + dir;
      if (next < 0 || next >= list.length) return d;
      const tmp = list[idx];
      list[idx] = list[next];
      list[next] = tmp;
      return { ...d, sections: list };
    });
  };

  const removeSection = (id) => {
    setDraft((d) => ({
      ...d,
      sections: (d.sections || []).filter((s) => s.id !== id),
    }));
  };

  const addSection = () => {
    setDraft((d) => ({
      ...d,
      sections: [...(d.sections || []), makeSowSection({ id: uid(), title: "New section", body: "" })],
    }));
  };

  const syncClientName = (companyId) => {
    const company = (data.companies || []).find((c) => c.id === companyId);
    setDraft((d) => ({
      ...d,
      companyId: companyId || null,
      clientName: (company && company.name) || "",
      contactName: d.contactName || (company && company.contactName) || "",
      contactEmail: d.contactEmail || (company && company.contactEmail) || "",
      contactPhone: d.contactPhone || (company && company.contactPhone) || "",
    }));
  };

  const saveDraft = async () => {
    if (!draft.title.trim()) {
      showToast("Give the Statement of Work a title.", "error");
      return;
    }
    if (!(draft.sections || []).length) {
      showToast("Add at least one section.", "error");
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
        // Still save the structured draft if the blob store is unavailable.
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

      {stepKey === "parties" && (
        <div>
          <Field label="DEAL" hint="Optional. Prefills parties, scope, fees, and timeline from the deal.">
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
          <div className="md-split" style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12 }}>
            <Field label="SOW NO.">
              <input
                className="md-input"
                value={draft.sowNumber || ""}
                onChange={(e) => setSowMeta({ sowNumber: e.target.value })}
                placeholder="●"
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
            <Field label="CLIENT / COUNTERPARTY">
              <CompanySelect
                native
                value={draft.companyId || ""}
                placeholder="No company"
                onCommit={(id) => syncClientName(id || "")}
              />
            </Field>
            <Field label="STUDIO">
              <input
                className="md-input"
                value={draft.studioName}
                onChange={(e) => setField("studioName", e.target.value)}
              />
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
          <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="TOTAL APPROVED BUDGET">
              <input
                className="md-input"
                value={draft.value || ""}
                onChange={(e) => setField("value", e.target.value)}
                placeholder="e.g. $180,000"
              />
            </Field>
            <Field label="OWNERSHIP MODEL">
              <select
                className="md-select"
                value={draft.ownershipModel || ""}
                onChange={(e) => setSowMeta({ ownershipModel: e.target.value })}
              >
                <option value="">Choose…</option>
                {SOW_OWNERSHIP_MODELS.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      )}

      {stepKey === "sections" && (
        <div>
          <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 12 }}>
            Rename, edit, reorder, add, or remove sections. Bodies are plain text.
          </div>
          {(draft.sections || []).map((section, index) => (
            <div key={section.id} style={{ border: "1px solid var(--rule)", borderRadius: 10, padding: 12, marginBottom: 10, background: "var(--panel-raised)" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
                <span className="md-mono" style={{ fontSize: 11, color: "var(--dim)", width: 24 }}>{index + 1}.</span>
                <input
                  className="md-input"
                  style={{ flex: "1 1 180px" }}
                  value={section.title}
                  onChange={(e) => updateSection(section.id, { title: e.target.value })}
                />
                <button type="button" className="md-btn md-btn-ghost" title="Move up" onClick={() => moveSection(section.id, -1)} disabled={index === 0}>
                  <ChevronUp size={14} />
                </button>
                <button type="button" className="md-btn md-btn-ghost" title="Move down" onClick={() => moveSection(section.id, 1)} disabled={index === draft.sections.length - 1}>
                  <ChevronDown size={14} />
                </button>
                <button type="button" className="md-btn md-btn-ghost" title="Remove section" style={{ color: "var(--red)" }} onClick={() => removeSection(section.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
              <textarea
                className="md-textarea"
                rows={4}
                value={section.body}
                onChange={(e) => updateSection(section.id, { body: e.target.value })}
                placeholder="Section body…"
              />
            </div>
          ))}
          <button type="button" className="md-btn md-btn-ghost" onClick={addSection}>
            <Plus size={14} /> Add section
          </button>
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
              onClick={() => downloadSowPdf({ ...draft, clientName: draft.clientName || companyName(draft.companyId) || "" })}>
              <Download size={14} /> Download PDF
            </button>
            <button type="button" className="md-btn md-btn-ghost" style={{ border: "1px solid var(--rule)" }}
              onClick={() => downloadSowDocx({ ...draft, clientName: draft.clientName || companyName(draft.companyId) || "" })}>
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
