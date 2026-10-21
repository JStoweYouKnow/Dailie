import { useMemo, useState } from "react";
import { Plus, MessagesSquare } from "lucide-react";
import { useStore } from "../lib/store";
import {
  RECORD_TYPES, recordTypeInfo,
  OPPORTUNITY_STATUSES, OPPORTUNITY_SOURCES,
  opportunityStatusInfo, opportunitySourceLabel, isOpenOpportunity,
  makeOpportunity, dealFromOpportunity, normalizeConversations,
} from "../lib/model";
import { formatShort, formatFull, uid } from "../lib/format";
import { ViewHeader, FilterChips, EmptyState, Badge, ModalShell, Field, Section, ConfirmButton, InlineText } from "../ui/kit";
import { CompanySelect } from "../ui/CompanySelect";

const FILTERS = [
  { key: "open", label: "Open" },
  ...OPPORTUNITY_STATUSES.map((s) => ({ key: s.key, label: s.label, color: s.color })),
];

function matchesFilter(opportunity, filter) {
  if (filter === "open") return isOpenOpportunity(opportunity);
  return opportunity.status === filter;
}

export default function OpportunitiesView({ searchQuery, onOpenProject }) {
  const { data, add, update, remove, currentUser, companyName, memberName, showToast } = useStore();
  const [filter, setFilter] = useState("open");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);

  const opportunities = useMemo(() => {
    let list = (data.opportunities || []).filter((o) => matchesFilter(o, filter));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((o) =>
        (o.title || "").toLowerCase().includes(q) ||
        (o.summary || "").toLowerCase().includes(q) ||
        (o.contactName || "").toLowerCase().includes(q) ||
        (o.contactEmail || "").toLowerCase().includes(q) ||
        (o.nextStep || "").toLowerCase().includes(q) ||
        companyName(o.companyId).toLowerCase().includes(q) ||
        (o.conversations || []).some((c) => (c.note || "").toLowerCase().includes(q) || (c.who || "").toLowerCase().includes(q))
      );
    }
    return [...list].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  }, [data.opportunities, filter, searchQuery, companyName]);

  const open = (data.opportunities || []).find((o) => o.id === openId) || null;

  return (
    <div>
      <ViewHeader count={opportunities.length} label={`OPPORTUNIT${opportunities.length === 1 ? "Y" : "IES"}`}>
        <button className="md-btn md-btn-primary" onClick={() => setCreating(true)}>
          <Plus size={14} /> New opportunity
        </button>
      </ViewHeader>

      <div style={{ marginBottom: 18 }}>
        <FilterChips
          options={FILTERS.map((f) => ({
            ...f,
            count: (data.opportunities || []).filter((o) => matchesFilter(o, f.key)).length,
          }))}
          value={filter}
          onChange={setFilter}
        />
      </div>

      {opportunities.length === 0 ? (
        <EmptyState
          title={filter === "open" ? "No open conversations" : "Nothing in this view"}
          subtitle="An opportunity is a conversation that is not a deal yet. Log it here, then open a deal when it is real."
          action={<button className="md-btn md-btn-primary" onClick={() => setCreating(true)}><Plus size={14} /> New opportunity</button>}
        />
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {opportunities.map((o) => {
            const status = opportunityStatusInfo(o.status);
            const latest = (o.conversations || [])[0];
            return (
              <div key={o.id} className="md-card" role="button" tabIndex={0}
                onClick={() => setOpenId(o.id)}
                onKeyDown={(e) => { if (e.key === "Enter") setOpenId(o.id); }}
                style={{ padding: "12px 14px", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <MessagesSquare size={16} color="var(--accent)" style={{ marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 700 }}>{o.title || "Untitled conversation"}</span>
                      <Badge label={status.label} color={status.color} />
                      <Badge label={opportunitySourceLabel(o.source)} color="var(--dim)" />
                    </div>
                    <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", marginTop: 4 }}>
                      {[companyName(o.companyId), o.contactName, memberName(o.ownerId)].filter(Boolean).join(" · ") || "No company yet"}
                      {" · "}{formatShort(o.updatedAt)}
                    </div>
                    {o.nextStep && (
                      <div style={{ fontSize: 12, marginTop: 6 }}>
                        <span className="md-mono" style={{ fontSize: 9, color: "var(--dim)", letterSpacing: ".1em" }}>NEXT · </span>{o.nextStep}
                      </div>
                    )}
                    {latest && (
                      <div style={{ fontSize: 12, color: "var(--bone)", opacity: 0.85, marginTop: 6, lineHeight: 1.4 }}>
                        {latest.who ? `${latest.who}: ` : ""}{latest.note}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <NewOpportunityModal
          onClose={() => setCreating(false)}
          onCreate={(fields) => {
            const { id, ...record } = makeOpportunity({ ...fields, ownerId: (currentUser && currentUser.id) || null });
            const created = add("opportunities", record);
            if (created) {
              showToast(`"${created.title}" saved.`, "success");
              setOpenId(created.id);
            }
            setCreating(false);
          }}
        />
      )}

      {open && (
        <OpportunityDetail
          opportunity={open}
          onClose={() => setOpenId(null)}
          onChange={(changes) => update("opportunities", open.id, { ...changes, updatedAt: Date.now() })}
          onRemove={() => { remove("opportunities", open.id); setOpenId(null); }}
          onMakeDeal={(recordType) => {
            const pipeline = data.pipelines[recordType] || [];
            const project = add("projects", dealFromOpportunity(open, {
              recordType,
              pipelineStage: (pipeline[0] || {}).key || null,
            }));
            if (!project) return;
            update("opportunities", open.id, { status: "deal", projectId: project.id, updatedAt: Date.now() });
            showToast(`"${project.title}" is a deal now.`, "success");
            setOpenId(null);
            if (onOpenProject) onOpenProject(project);
          }}
          onOpenDeal={() => {
            const project = (data.projects || []).find((p) => p.id === open.projectId);
            if (project && onOpenProject) {
              setOpenId(null);
              onOpenProject(project);
            }
          }}
        />
      )}
    </div>
  );
}

function NewOpportunityModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    title: "", summary: "", companyId: "", contactName: "", contactEmail: "",
    source: "intro", nextStep: "",
  });
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = () => {
    if (!form.title.trim()) { setError("Name the conversation."); return; }
    onCreate({
      title: form.title.trim(),
      summary: form.summary.trim(),
      companyId: form.companyId || null,
      contactName: form.contactName.trim(),
      contactEmail: form.contactEmail.trim().toLowerCase(),
      source: form.source,
      nextStep: form.nextStep.trim(),
      status: "talking",
    });
  };

  return (
    <ModalShell title="New opportunity" subtitle="A conversation that is not a deal yet." onClose={onClose}>
      <Field label="WHAT IS THIS ABOUT">
        <input className="md-input" autoFocus value={form.title} onChange={set("title")} placeholder="A series for Roku, a finish for A24…" />
      </Field>
      {error && <div style={{ fontSize: 12, color: "var(--red)", marginTop: -6, marginBottom: 10 }}>{error}</div>}
      <Field label="THE CONVERSATION SO FAR">
        <textarea className="md-textarea" rows={3} value={form.summary} onChange={set("summary")} placeholder="What was said, and what is still open." />
      </Field>
      <Field label="COMPANY">
        <CompanySelect native value={form.companyId} placeholder="No company"
          onCommit={(companyId, company) => setForm((f) => ({
            ...f,
            companyId: companyId || "",
            contactName: f.contactName || (company && company.contactName) || "",
            contactEmail: f.contactEmail || (company && company.contactEmail) || "",
          }))} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="WHO WE'RE TALKING TO">
          <input className="md-input" value={form.contactName} onChange={set("contactName")} placeholder="Name" />
        </Field>
        <Field label="EMAIL">
          <input className="md-input" value={form.contactEmail} onChange={set("contactEmail")} placeholder="name@company.com" />
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="HOW IT STARTED">
          <select className="md-select" value={form.source} onChange={set("source")}>
            {OPPORTUNITY_SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="NEXT STEP">
          <input className="md-input" value={form.nextStep} onChange={set("nextStep")} placeholder="Send a one-sheet" />
        </Field>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
        <button className="md-btn md-btn-ghost" onClick={onClose}>Cancel</button>
        <button className="md-btn md-btn-primary" onClick={submit}>Save opportunity</button>
      </div>
    </ModalShell>
  );
}

function OpportunityDetail({ opportunity, onClose, onChange, onRemove, onMakeDeal, onOpenDeal }) {
  const { companyName } = useStore();
  const [who, setWho] = useState(opportunity.contactName || "");
  const [note, setNote] = useState("");
  const [recordType, setRecordType] = useState("service");
  const status = opportunityStatusInfo(opportunity.status);
  const conversations = normalizeConversations(opportunity.conversations);

  const addNote = () => {
    if (!note.trim()) return;
    onChange({
      conversations: [
        ...(opportunity.conversations || []),
        { id: uid(), at: Date.now(), who: who.trim(), note: note.trim() },
      ],
    });
    setNote("");
  };

  return (
    <ModalShell wide title={opportunity.title || "Opportunity"} subtitle={companyName(opportunity.companyId) || "No company yet"} onClose={onClose}>
      <Field label="WHAT IS THIS ABOUT">
        <InlineText value={opportunity.title} placeholder="Name this conversation" style={{ fontSize: 16, fontWeight: 700 }}
          onCommit={(v) => v.trim() && onChange({ title: v.trim() })} />
      </Field>
      <Field label="SUMMARY">
        <InlineText value={opportunity.summary} multiline placeholder="What was said, and what is still open."
          onCommit={(v) => onChange({ summary: v })} />
      </Field>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <Badge label={status.label} color={status.color} />
        <Badge label={opportunitySourceLabel(opportunity.source)} color="var(--dim)" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="STATUS">
          <select className="md-select" value={opportunity.status || "talking"}
            onChange={(e) => onChange({ status: e.target.value })}>
            {OPPORTUNITY_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="HOW IT STARTED">
          <select className="md-select" value={opportunity.source || "intro"}
            onChange={(e) => onChange({ source: e.target.value })}>
            {OPPORTUNITY_SOURCES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="COMPANY">
        <CompanySelect native value={opportunity.companyId || ""} placeholder="No company"
          onCommit={(companyId) => onChange({ companyId: companyId || null })} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="CONTACT">
          <InlineText value={opportunity.contactName} placeholder="Who we're talking to"
            onCommit={(v) => onChange({ contactName: v.trim() })} />
        </Field>
        <Field label="EMAIL">
          <InlineText value={opportunity.contactEmail} mono placeholder="name@company.com"
            onCommit={(v) => onChange({ contactEmail: v.trim().toLowerCase() })} />
        </Field>
      </div>
      <Field label="NEXT STEP">
        <InlineText value={opportunity.nextStep} placeholder="What happens next"
          onCommit={(v) => onChange({ nextStep: v.trim() })} />
      </Field>

      <Section title={`CONVERSATION · ${conversations.length}`}>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr auto", gap: 8, marginBottom: 10 }}>
          <input className="md-input" value={who} onChange={(e) => setWho(e.target.value)} placeholder="Who" />
          <input className="md-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was said"
            onKeyDown={(e) => { if (e.key === "Enter") addNote(); }} />
          <button className="md-btn" onClick={addNote}>Add</button>
        </div>
        {conversations.length === 0 && <div style={{ fontSize: 12, color: "var(--dim)" }}>Nothing logged yet.</div>}
        {conversations.map((entry) => (
          <div key={entry.id} style={{ fontSize: 12, marginBottom: 10, paddingLeft: 10, borderLeft: "2px solid var(--rule)" }}>
            <div className="md-mono" style={{ color: "var(--dim)", fontSize: 10 }}>
              {formatFull(entry.at)}{entry.who ? ` · ${entry.who}` : ""}
            </div>
            <div style={{ color: "var(--bone)" }}>{entry.note}</div>
          </div>
        ))}
      </Section>

      <Section title="WHEN IT BECOMES A DEAL">
        {opportunity.projectId ? (
          <button className="md-btn md-btn-primary" onClick={onOpenDeal}>Open the deal</button>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <select className="md-select" style={{ width: 220 }} value={recordType} onChange={(e) => setRecordType(e.target.value)}>
              {RECORD_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <button className="md-btn md-btn-primary" onClick={() => onMakeDeal(recordType)}>
              Make this a {recordTypeInfo(recordType).short.toLowerCase()} deal
            </button>
          </div>
        )}
      </Section>

      <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
        <ConfirmButton label="Remove opportunity" confirmLabel="Yes, remove it" onConfirm={onRemove} />
      </div>
    </ModalShell>
  );
}
