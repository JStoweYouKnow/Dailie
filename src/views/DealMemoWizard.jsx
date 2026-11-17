import { useMemo, useState } from "react";
import { Download, FileText, ArrowRight, ArrowLeft } from "lucide-react";
import { useStore } from "../lib/store";
import {
  dealMemoDraftFrom,
  dealMemoExportPayload,
  isArchivedProject,
  DEFAULT_SOW_STUDIO_NAME,
  RATE_UNITS,
  DEAL_MEMO_PHASES,
  DEAL_MEMO_ENGAGEMENT_TYPES,
  DEAL_MEMO_EXCLUSIVITY,
  DEAL_MEMO_PAYMENT_SCHEDULES,
  DEAL_MEMO_CONFIDENTIALITY,
  SOW_CREDIT_OPTIONS,
  SOW_PORTFOLIO_OPTIONS,
  SOW_TALENT_OPTIONS,
  talentDisciplines,
  rosterDisciplines,
} from "../lib/model";
import { dateInputValue, tsFromDateInput } from "../lib/format";
import { ModalShell, Field, Section, Badge } from "../ui/kit";
import { downloadDealMemoPdf, downloadDealMemoDocx, dealMemoPdfFile } from "../lib/dealMemoExport";
import { uploadFile } from "../lib/files";

const STEPS = [
  { key: "talent", label: "Talent & deal" },
  { key: "role", label: "Role & dates" },
  { key: "fees", label: "Fees & terms" },
  { key: "export", label: "Preview & export" },
];

const STUDIO_NAME = DEFAULT_SOW_STUDIO_NAME;

function draftFromSelection(data, { talentId = null, projectId = null, extras = {} } = {}) {
  const talent = talentId ? (data.talent || []).find((t) => t.id === talentId) : null;
  const project = projectId ? (data.projects || []).find((p) => p.id === projectId) : null;
  return dealMemoDraftFrom({
    talent: talent || null,
    project: project || null,
    studioName: STUDIO_NAME,
    ...extras,
  });
}

function buildTitle(memoNumber, talentName, projectTitle) {
  const numberPart = String(memoNumber || "").trim() || "[●]";
  if (talentName && projectTitle) return `Deal Memo No. ${numberPart} — ${talentName} / ${projectTitle}`;
  if (talentName) return `Deal Memo No. ${numberPart} — ${talentName}`;
  if (projectTitle) return `Deal Memo No. ${numberPart} — ${projectTitle}`;
  return `Deal Memo No. ${numberPart}`;
}

function syncValueFromAnswers(answers) {
  const amount = String(answers.rateAmount || "").trim();
  if (!amount) return "";
  const unit = (RATE_UNITS.find((u) => u.key === answers.rateUnit) || {}).label || "";
  const currency = String(answers.currency || "USD").trim() || "USD";
  return unit ? `${amount} ${currency} ${unit}` : `${amount} ${currency}`;
}

export default function DealMemoWizard({
  projectId: initialProjectId = null,
  talentId: initialTalentId = null,
  onClose,
}) {
  const { data, add, currentUser, showToast } = useStore();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(() => draftFromSelection(data, {
    talentId: initialTalentId,
    projectId: initialProjectId,
  }));

  const stepKey = STEPS[step].key;
  const preview = useMemo(() => dealMemoExportPayload(draft), [draft]);
  const answers = draft.answers || {};
  const activeProjects = (data.projects || []).filter((p) => !isArchivedProject(p));
  const disciplineOptions = rosterDisciplines(data.talent);

  const setField = (key, value) => setDraft((d) => {
    const next = { ...d, [key]: value };
    if (key === "memoNumber" || key === "talentName" || key === "projectTitle") {
      next.title = buildTitle(next.memoNumber, next.talentName, next.projectTitle);
    }
    return next;
  });

  const setAnswer = (key, value) => setDraft((d) => {
    const answersNext = { ...(d.answers || {}), [key]: value };
    const next = { ...d, answers: answersNext };
    if (key === "rateAmount" || key === "rateUnit" || key === "currency" || key === "role") {
      next.value = syncValueFromAnswers(answersNext);
      if (key === "role") next.title = buildTitle(next.memoNumber, next.talentName, next.projectTitle);
    }
    return next;
  });

  const applyTalent = (talentId) => {
    setDraft((d) => {
      const next = draftFromSelection(data, {
        talentId: talentId || null,
        projectId: d.projectId,
        extras: {
          memoNumber: d.memoNumber,
          answers: {
            studioRepName: d.answers?.studioRepName,
            studioRepTitle: d.answers?.studioRepTitle,
            phase: d.answers?.phase,
            engagementType: d.answers?.engagementType,
            exclusivity: d.answers?.exclusivity,
            paymentSchedule: d.answers?.paymentSchedule,
            credit: d.answers?.credit,
            portfolioUse: d.answers?.portfolioUse,
            specialTerms: d.answers?.specialTerms,
          },
        },
      });
      return {
        ...next,
        memoNumber: d.memoNumber || "",
        studioName: d.studioName || STUDIO_NAME,
      };
    });
  };

  const applyProject = (projectId) => {
    setDraft((d) => {
      const next = draftFromSelection(data, {
        talentId: d.talentId,
        projectId: projectId || null,
        extras: {
          memoNumber: d.memoNumber,
          answers: {
            ...d.answers,
            // Keep edited role/rate if the new booking doesn't override them later.
          },
        },
      });
      // Prefer existing answer edits when switching projects unless booking fills role/dates.
      return {
        ...next,
        memoNumber: d.memoNumber || "",
        studioName: d.studioName || STUDIO_NAME,
        answers: {
          ...next.answers,
          studioRepName: d.answers?.studioRepName || next.answers.studioRepName,
          studioRepTitle: d.answers?.studioRepTitle || next.answers.studioRepTitle,
          scope: next.answers.scope || d.answers?.scope || "",
          deliverables: d.answers?.deliverables || next.answers.deliverables,
          buyout: d.answers?.buyout || "",
          overtime: d.answers?.overtime || "",
          kitFee: d.answers?.kitFee || "",
          killFee: d.answers?.killFee || "",
          travel: d.answers?.travel || "",
          specialTerms: d.answers?.specialTerms || "",
          exclusivity: d.answers?.exclusivity || next.answers.exclusivity,
          paymentSchedule: d.answers?.paymentSchedule || next.answers.paymentSchedule,
          credit: d.answers?.credit || next.answers.credit,
          portfolioUse: d.answers?.portfolioUse || next.answers.portfolioUse,
        },
      };
    });
  };

  const saveDraft = async () => {
    if (!draft.title.trim()) {
      showToast("Give the deal memo a title.", "error");
      return;
    }
    if (!draft.talentId && !draft.talentName) {
      showToast("Pick talent or enter a name.", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = dealMemoExportPayload(draft);
      let fileMeta = {};
      try {
        fileMeta = await uploadFile(dealMemoPdfFile(payload), "documents");
      } catch (err) {
        showToast(err.message || "Saved without attaching the PDF.", "info");
      }
      add("contracts", {
        kind: "dealMemo",
        title: payload.title,
        companyId: draft.companyId || null,
        projectId: draft.projectId || null,
        talentId: draft.talentId || null,
        status: "draft",
        value: payload.value,
        notes: [
          draft.memoNumber && `Memo No. ${draft.memoNumber}`,
          payload.role && `Role: ${payload.role}`,
          draft.agent && `Agent: ${draft.agent}`,
          draft.talentEmail,
          draft.talentPhone,
        ].filter(Boolean).join(" · "),
        sections: payload.sections,
        answers: payload.answers,
        memoNumber: draft.memoNumber || "",
        ownerId: currentUser && currentUser.id,
        signedAt: null,
        expiresAt: null,
        ...fileMeta,
      });
      showToast("Deal memo saved as a draft agreement.", "success");
      onClose();
    } catch (err) {
      showToast(err.message || "Could not save the deal memo.", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      wide
      zIndex={80}
      title="Create Deal Memo"
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

      {stepKey === "talent" && (
        <div>
          <Field label="TALENT" hint="Pulls rate, agent, location, and NDA status from the roster.">
            <select className="md-select" value={draft.talentId || ""} onChange={(e) => applyTalent(e.target.value || null)}>
              <option value="">No roster pick — enter manually</option>
              {(data.talent || []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}{talentDisciplines(t).length ? ` · ${talentDisciplines(t).join(", ")}` : ""}
                </option>
              ))}
            </select>
          </Field>

          <div className="md-split" style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12 }}>
            <Field label="MEMO NO.">
              <input className="md-input" value={draft.memoNumber || ""} onChange={(e) => setField("memoNumber", e.target.value)} placeholder="2026-014" />
            </Field>
            <Field label="TITLE">
              <input className="md-input" value={draft.title} onChange={(e) => setField("title", e.target.value)} />
            </Field>
          </div>

          <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="NAME">
              <input className="md-input" value={draft.talentName || ""} onChange={(e) => setField("talentName", e.target.value)} placeholder="Talent name" />
            </Field>
            <Field label="DEAL">
              <select className="md-select" value={draft.projectId || ""} onChange={(e) => applyProject(e.target.value || null)}>
                <option value="">No deal</option>
                {activeProjects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </Field>
          </div>

          <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="EMAIL">
              <input className="md-input" value={draft.talentEmail || ""} onChange={(e) => setField("talentEmail", e.target.value)} />
            </Field>
            <Field label="PHONE">
              <input className="md-input" value={draft.talentPhone || ""} onChange={(e) => setField("talentPhone", e.target.value)} />
            </Field>
            <Field label="AGENT / REP">
              <input className="md-input" value={draft.agent || ""} onChange={(e) => setField("agent", e.target.value)} />
            </Field>
          </div>

          <Section title="MATRIARCH SIGNATORY">
            <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="NAME">
                <input className="md-input" value={answers.studioRepName || ""} onChange={(e) => setAnswer("studioRepName", e.target.value)} />
              </Field>
              <Field label="TITLE">
                <input className="md-input" value={answers.studioRepTitle || ""} onChange={(e) => setAnswer("studioRepTitle", e.target.value)} />
              </Field>
            </div>
          </Section>
        </div>
      )}

      {stepKey === "role" && (
        <div>
          <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="ROLE">
              <input
                className="md-input"
                list="deal-memo-roles"
                value={answers.role || ""}
                onChange={(e) => setAnswer("role", e.target.value)}
                placeholder="e.g. Editor — assembly"
              />
              <datalist id="deal-memo-roles">
                {disciplineOptions.map((d) => <option key={d} value={d} />)}
              </datalist>
            </Field>
            <Field label="ENGAGEMENT TYPE">
              <select className="md-select" value={answers.engagementType || ""} onChange={(e) => setAnswer("engagementType", e.target.value)}>
                {DEAL_MEMO_ENGAGEMENT_TYPES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="PHASE">
              <select className="md-select" value={answers.phase || ""} onChange={(e) => setAnswer("phase", e.target.value)}>
                {DEAL_MEMO_PHASES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="EXCLUSIVITY">
              <select className="md-select" value={answers.exclusivity || ""} onChange={(e) => setAnswer("exclusivity", e.target.value)}>
                {DEAL_MEMO_EXCLUSIVITY.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="SERVICES / SCOPE">
            <textarea className="md-textarea" rows={3} value={answers.scope || ""} onChange={(e) => setAnswer("scope", e.target.value)} placeholder="What they are engaged to do…" />
          </Field>
          <Field label="DELIVERABLES">
            <textarea className="md-textarea" rows={2} value={answers.deliverables || ""} onChange={(e) => setAnswer("deliverables", e.target.value)} placeholder="Cuts, stems, masters, stills…" />
          </Field>

          <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="START">
              <input
                className="md-input"
                type="date"
                value={dateInputValue(draft.startDate)}
                onChange={(e) => setField("startDate", tsFromDateInput(e.target.value))}
              />
            </Field>
            <Field label="END">
              <input
                className="md-input"
                type="date"
                value={dateInputValue(draft.endDate)}
                onChange={(e) => setField("endDate", tsFromDateInput(e.target.value))}
              />
            </Field>
            <Field label="ALLOCATION %">
              <input className="md-input" value={answers.allocation || ""} onChange={(e) => setAnswer("allocation", e.target.value)} placeholder="100" />
            </Field>
          </div>
          <Field label="WORK LOCATION">
            <input className="md-input" value={answers.location || ""} onChange={(e) => setAnswer("location", e.target.value)} placeholder="City / remote / set" />
          </Field>
        </div>
      )}

      {stepKey === "fees" && (
        <div>
          <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Field label="RATE AMOUNT">
              <input className="md-input" value={answers.rateAmount || ""} onChange={(e) => setAnswer("rateAmount", e.target.value)} placeholder="e.g. 1450" />
            </Field>
            <Field label="RATE UNIT">
              <select className="md-select" value={answers.rateUnit || "day"} onChange={(e) => setAnswer("rateUnit", e.target.value)}>
                {RATE_UNITS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="CURRENCY">
              <input className="md-input" value={answers.currency || "USD"} onChange={(e) => setAnswer("currency", e.target.value)} />
            </Field>
          </div>

          <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="PAYMENT SCHEDULE">
              <select className="md-select" value={answers.paymentSchedule || ""} onChange={(e) => setAnswer("paymentSchedule", e.target.value)}>
                {DEAL_MEMO_PAYMENT_SCHEDULES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="BUYOUT / RIGHTS">
              <input className="md-input" value={answers.buyout || ""} onChange={(e) => setAnswer("buyout", e.target.value)} placeholder="None / terms…" />
            </Field>
            <Field label="OVERTIME">
              <input className="md-input" value={answers.overtime || ""} onChange={(e) => setAnswer("overtime", e.target.value)} />
            </Field>
            <Field label="KIT / GEAR FEE">
              <input className="md-input" value={answers.kitFee || ""} onChange={(e) => setAnswer("kitFee", e.target.value)} />
            </Field>
          </div>
          {answers.paymentSchedule === "custom" && (
            <Field label="CUSTOM PAYMENT SCHEDULE">
              <input className="md-input" value={answers.paymentScheduleCustom || ""} onChange={(e) => setAnswer("paymentScheduleCustom", e.target.value)} />
            </Field>
          )}

          <Section title="CREDIT, UNION & LEGAL">
            <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
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
              <Field label="UNION / GUILD">
                <select className="md-select" value={answers.unionStatus || ""} onChange={(e) => setAnswer("unionStatus", e.target.value)}>
                  {SOW_TALENT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </Field>
              <Field label="CONFIDENTIALITY">
                <select className="md-select" value={answers.confidentiality || ""} onChange={(e) => setAnswer("confidentiality", e.target.value)}>
                  {DEAL_MEMO_CONFIDENTIALITY.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
              </Field>
            </div>
            {answers.credit === "custom" && (
              <Field label="CUSTOM CREDIT">
                <input className="md-input" value={answers.creditCustom || ""} onChange={(e) => setAnswer("creditCustom", e.target.value)} />
              </Field>
            )}
            <Field label="UNION NOTES">
              <input className="md-input" value={answers.unionNotes || ""} onChange={(e) => setAnswer("unionNotes", e.target.value)} placeholder="Signatory, usage…" />
            </Field>
            <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="KILL / CANCELLATION FEE">
                <input className="md-input" value={answers.killFee || ""} onChange={(e) => setAnswer("killFee", e.target.value)} />
              </Field>
              <Field label="TRAVEL & EXPENSES">
                <input className="md-input" value={answers.travel || ""} onChange={(e) => setAnswer("travel", e.target.value)} />
              </Field>
            </div>
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
              {[preview.studioName, preview.talentName].filter(Boolean).join(" · ")}
              {preview.projectTitle ? ` · ${preview.projectTitle}` : ""}
              {preview.role ? ` · ${preview.role}` : ""}
              {preview.value ? ` · ${preview.value}` : ""}
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
            <button type="button" className="md-btn md-btn-ghost" style={{ border: "1px solid var(--rule)" }} onClick={() => downloadDealMemoPdf(draft)}>
              <Download size={14} /> Download PDF
            </button>
            <button type="button" className="md-btn md-btn-ghost" style={{ border: "1px solid var(--rule)" }} onClick={() => downloadDealMemoDocx(draft)}>
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
