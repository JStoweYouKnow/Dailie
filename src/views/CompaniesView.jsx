import { useMemo, useState } from "react";
import { Plus, RefreshCw, Globe, Mail, Users, ExternalLink } from "lucide-react";
import { useStore } from "../lib/store";
import {
  COMPANY_TYPES, companyTypeInfo, RELATIONSHIP_STAGES, CONTRACT_STATUSES,
  deriveDirectoryFromEmails, lookupLabel, lookupColor, makeTask,
} from "../lib/model";
import { relativeDays, formatShort, daysSince, formatMoney, emailDomain } from "../lib/format";
import {
  ViewHeader, FilterChips, DataTable, EmptyState, Badge, Avatar, InlineText, InlineSelect,
  ModalShell, Field, Section, ConfirmButton,
} from "../ui/kit";

function CompanyDetail({ company, onClose, onOpenTab }) {
  const { data, update, remove, add, currentUser, memberName } = useStore();
  const [task, setTask] = useState("");

  const people = data.people.filter((p) => p.companyId === company.id);
  const emails = data.emails.filter((e) => e.companyId === company.id).sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));
  const projects = data.projects.filter((p) => p.companyId === company.id);
  const contracts = data.contracts.filter((c) => c.companyId === company.id);
  const invoices = data.invoices.filter((i) => i.companyId === company.id);
  const tasks = data.tasks.filter((t) => t.companyId === company.id);
  const lastContact = emails.reduce((max, e) => Math.max(max, e.sentAt || 0), 0) || null;
  const type = companyTypeInfo(company.type);

  const addTask = () => {
    if (!task.trim()) return;
    add("tasks", makeTask({ title: task.trim(), companyId: company.id, assigneeIds: currentUser ? [currentUser.id] : [] }, currentUser && currentUser.id));
    setTask("");
  };

  return (
    <ModalShell wide title={company.name} subtitle={`${type.label}${company.domain ? ` · ${company.domain}` : ""}`} onClose={onClose}>
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20 }}>
        <Avatar name={company.name} size={54} />
        <div style={{ flex: 1 }}>
          <InlineText value={company.name} style={{ fontSize: 18, fontWeight: 700 }} onCommit={(v) => v.trim() && update("companies", company.id, { name: v.trim() })} />
          <InlineText value={company.website} mono placeholder="Add website" style={{ color: "var(--accent)", fontSize: 12 }} onCommit={(v) => update("companies", company.id, { website: v })} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 20 }}>
        <Field label="LABEL / TYPE">
          <InlineSelect value={company.type} options={COMPANY_TYPES} color={type.color} onCommit={(v) => update("companies", company.id, { type: v })} />
        </Field>
        <Field label="RELATIONSHIP">
          <InlineSelect value={company.relationship || "new"} options={RELATIONSHIP_STAGES} onCommit={(v) => update("companies", company.id, { relationship: v })} />
        </Field>
        <Field label="OWNED BY">
          <InlineSelect value={company.ownerId} options={data.team.map((m) => ({ key: m.id, label: m.name }))} placeholder="Unassigned"
            onCommit={(v) => update("companies", company.id, { ownerId: v })} />
        </Field>
        <Field label="EMAIL DOMAIN">
          <InlineText value={company.domain} mono placeholder="acme.com" onCommit={(v) => update("companies", company.id, { domain: v.trim().toLowerCase() })} />
        </Field>
        <Field label="LAST CONTACT">
          <div style={{ fontSize: 13, color: lastContact && daysSince(lastContact) > (data.settings.followUpDays || 14) ? "var(--red)" : "var(--bone)" }}>
            {relativeDays(lastContact)}
          </div>
        </Field>
      </div>

      <Field label="RELATIONSHIP NOTES">
        <InlineText value={company.notes} multiline placeholder="Where are we with this relationship? What was agreed, what is next…"
          onCommit={(v) => update("companies", company.id, { notes: v })} />
      </Field>

      <Section title={`PEOPLE WE SPEAK WITH · ${people.length}`} right={
        <button className="md-btn md-btn-ghost" style={{ fontSize: 12 }} onClick={() => onOpenTab && onOpenTab("people")}>Open People <ExternalLink size={11} /></button>
      }>
        {people.length === 0 && <div style={{ fontSize: 12, color: "var(--dim)" }}>No contacts linked yet.</div>}
        {people.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--rule)" }}>
            <Avatar name={p.name} size={26} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
              <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>{p.role || "—"}{p.email ? ` · ${p.email}` : ""}</div>
            </div>
            <Badge label={lookupLabel(RELATIONSHIP_STAGES, p.relationship || "new")} subtle />
          </div>
        ))}
      </Section>

      {projects.length > 0 && (
        <Section title={`PROJECTS · ${projects.length}`}>
          {projects.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", fontSize: 13 }}>
              <span style={{ flex: 1 }}>{p.title}</span>
              <span className="md-mono" style={{ fontSize: 11, color: "var(--accent)" }}>{p.budget}</span>
            </div>
          ))}
        </Section>
      )}

      {contracts.length > 0 && (
        <Section title={`CONTRACTS & NDAs · ${contracts.length}`}>
          {contracts.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", fontSize: 13 }}>
              <span style={{ flex: 1 }}>{c.title}</span>
              <Badge label={lookupLabel(CONTRACT_STATUSES, c.status)} color={lookupColor(CONTRACT_STATUSES, c.status)} />
            </div>
          ))}
        </Section>
      )}

      {invoices.length > 0 && (
        <Section title={`INVOICES · ${invoices.length}`}>
          {invoices.map((i) => (
            <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", fontSize: 13 }}>
              <span style={{ flex: 1 }}>{i.number || i.id} · {i.direction === "incoming" ? "receivable" : "payable"}</span>
              <span className="md-mono" style={{ fontSize: 12, color: "var(--accent)" }}>{formatMoney(i.amount, i.currency)}</span>
            </div>
          ))}
        </Section>
      )}

      <Section title={`EMAILS · ${emails.length}`}>
        {emails.length === 0 && <div style={{ fontSize: 12, color: "var(--dim)" }}>No email traffic logged for this company.</div>}
        {emails.slice(0, 8).map((e) => (
          <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--rule)" }}>
            <Mail size={13} color="var(--dim)" />
            <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.subject}</span>
            <span className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>{formatShort(e.sentAt)}</span>
          </div>
        ))}
      </Section>

      <Section title={`TASKS · ${tasks.filter((t) => t.status !== "done").length} OPEN`}>
        {tasks.map((t) => (
          <div key={t.id} style={{ fontSize: 13, padding: "5px 0", color: t.status === "done" ? "var(--dim)" : "var(--bone)", textDecoration: t.status === "done" ? "line-through" : "none" }}>{t.title}</div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input className="md-input" placeholder="Add a task about this company…" value={task}
            onChange={(e) => setTask(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addTask(); }} />
          <button className="md-btn" onClick={addTask}><Plus size={13} /></button>
        </div>
      </Section>

      <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
        <ConfirmButton label="Remove company" confirmLabel="Yes, remove" onConfirm={() => { remove("companies", company.id); onClose(); }} />
      </div>
    </ModalShell>
  );
}

function NewCompanyModal({ onClose, defaultType }) {
  const { add, currentUser } = useStore();
  const [form, setForm] = useState({ name: "", domain: "", type: defaultType || "prospect", website: "", notes: "" });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.name.trim()) return;
    const domain = form.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    add("companies", {
      name: form.name.trim(),
      domain,
      type: form.type,
      relationship: "new",
      ownerId: currentUser && currentUser.id,
      website: form.website.trim() || (domain ? `https://${domain}` : ""),
      notes: form.notes.trim(),
      tags: [],
    });
    onClose();
  };

  return (
    <ModalShell title="New Company" onClose={onClose}>
      <Field label="COMPANY NAME"><input className="md-input" autoFocus value={form.name} onChange={set("name")} placeholder="e.g. A24" /></Field>
      <Field label="EMAIL DOMAIN" hint="Used to match incoming mail to this company automatically.">
        <input className="md-input" value={form.domain} onChange={set("domain")} placeholder="a24films.com" />
      </Field>
      <Field label="LABEL">
        <select className="md-select" value={form.type} onChange={set("type")}>
          {COMPANY_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </Field>
      <Field label="RELATIONSHIP NOTES"><textarea className="md-textarea" rows={3} value={form.notes} onChange={set("notes")} placeholder="Where are we with them?" /></Field>
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>Save Company</button>
    </ModalShell>
  );
}

/**
 * One view backs the Companies, Vendors and AI Tools tabs — they are the same records
 * filtered to a label, so the columns, detail panel and editing behave identically.
 */
export default function CompaniesView({ searchQuery, onOpenTab, lockedType, title }) {
  const { data, patch, update, showToast } = useStore();
  const [typeFilter, setTypeFilter] = useState(lockedType || "all");
  const [open, setOpen] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const rows = useMemo(() => {
    const lastByCompany = new Map();
    data.emails.forEach((e) => {
      if (!e.companyId) return;
      const prev = lastByCompany.get(e.companyId) || 0;
      if ((e.sentAt || 0) > prev) lastByCompany.set(e.companyId, e.sentAt || 0);
    });

    let list = data.companies.map((c) => ({
      ...c,
      lastContactAt: lastByCompany.get(c.id) || null,
      peopleCount: data.people.filter((p) => p.companyId === c.id).length,
      projectCount: data.projects.filter((p) => p.companyId === c.id).length,
    }));

    const effective = lockedType || typeFilter;
    if (effective !== "all") list = list.filter((c) => c.type === effective);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || (c.domain || "").toLowerCase().includes(q) || (c.notes || "").toLowerCase().includes(q));
    }
    return list.sort((a, b) => (b.lastContactAt || 0) - (a.lastContactAt || 0));
  }, [data.companies, data.people, data.projects, data.emails, typeFilter, lockedType, searchQuery]);

  /** Rebuilds companies and people from every email that has been imported. */
  const populateFromEmail = () => {
    // With no mail on the board the old message read "everything is already here",
    // which looks exactly like a button that does nothing.
    if (!data.emails.length) {
      showToast("No email on the board yet — sync a Gmail account first, then run this.", "info");
      return;
    }
    const result = deriveDirectoryFromEmails(data);
    patch({ companies: result.companies, people: result.people, emails: result.emails });
    const added = result.newCompanies.length;
    const addedPeople = result.newPeople.length;
    showToast(
      added || addedPeople
        ? `Added ${added} compan${added === 1 ? "y" : "ies"} and ${addedPeople} ${addedPeople === 1 ? "person" : "people"} from your mail.`
        : "Every company and person in your mail is already on the board.",
      added || addedPeople ? "success" : "info"
    );
  };

  const threshold = data.settings.followUpDays || 14;

  const columns = [
    { key: "name", label: "COMPANY", render: (c) => (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar name={c.name} size={28} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: "var(--bone)" }}>{c.name}</div>
          {c.domain && <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>{c.domain}</div>}
        </div>
      </div>
    ) },
    { key: "type", label: "LABEL", stopClick: true, render: (c) => (
      <InlineSelect value={c.type} options={COMPANY_TYPES} color={companyTypeInfo(c.type).color} onCommit={(v) => update("companies", c.id, { type: v })} />
    ) },
    { key: "relationship", label: "RELATIONSHIP", stopClick: true, render: (c) => (
      <InlineSelect value={c.relationship || "new"} options={RELATIONSHIP_STAGES} onCommit={(v) => update("companies", c.id, { relationship: v })} />
    ) },
    { key: "people", label: "PEOPLE", render: (c) => (
      <span className="md-mono" style={{ fontSize: 12, color: "var(--dim)", display: "inline-flex", alignItems: "center", gap: 5 }}>
        <Users size={12} /> {c.peopleCount}
      </span>
    ) },
    { key: "projects", label: "PROJECTS", render: (c) => <span className="md-mono" style={{ fontSize: 12, color: "var(--dim)" }}>{c.projectCount}</span> },
    { key: "notes", label: "WHERE WE ARE", cellStyle: { minWidth: 260, maxWidth: 380 }, stopClick: true, render: (c) => (
      <InlineText value={c.notes} placeholder="Add relationship note" onCommit={(v) => update("companies", c.id, { notes: v })} />
    ) },
    { key: "owner", label: "OWNED BY", stopClick: true, render: (c) => (
      <InlineSelect value={c.ownerId} options={data.team.map((m) => ({ key: m.id, label: m.name }))} placeholder="—"
        onCommit={(v) => update("companies", c.id, { ownerId: v })} />
    ) },
    { key: "last", label: "LAST CONTACT", render: (c) => {
      const stale = c.lastContactAt && daysSince(c.lastContactAt) > threshold;
      return <Badge label={relativeDays(c.lastContactAt)} color={stale ? "var(--red)" : undefined} subtle={!stale} />;
    } },
  ];

  return (
    <div>
      <ViewHeader count={rows.length} label={title || "COMPANIES"}>
        <button className="md-btn md-btn-ghost" style={{ border: "1px solid var(--rule)" }} onClick={populateFromEmail} title="Scan every imported email and create the companies and people behind them">
          <RefreshCw size={13} /> Populate from Email
        </button>
        <button className="md-btn md-btn-primary" onClick={() => setShowNew(true)}><Plus size={14} /> New Company</button>
      </ViewHeader>

      {!lockedType && (
        <div style={{ marginBottom: 18 }}>
          <FilterChips
            options={COMPANY_TYPES.map((t) => ({ ...t, count: data.companies.filter((c) => c.type === t.key).length }))}
            value={typeFilter} onChange={setTypeFilter} allLabel="All Labels"
          />
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          title="No companies here yet"
          subtitle="Sync your Gmail accounts, then hit Populate from Email — Dailie builds companies and the people behind them from your mail traffic."
        />
      ) : (
        <DataTable columns={columns} rows={rows} onRowClick={setOpen} />
      )}

      {open && <CompanyDetail company={data.companies.find((c) => c.id === open.id) || open} onClose={() => setOpen(null)} onOpenTab={onOpenTab} />}
      {showNew && <NewCompanyModal onClose={() => setShowNew(false)} defaultType={lockedType} />}
    </div>
  );
}
