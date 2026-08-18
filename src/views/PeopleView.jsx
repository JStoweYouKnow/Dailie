import { useMemo, useState } from "react";
import { Plus, Mail, Phone, ExternalLink } from "lucide-react";
import { useStore } from "../lib/store";
import { RELATIONSHIP_STAGES, lastContactFor, personEmails, makeTask } from "../lib/model";
import { relativeDays, formatShort, daysSince } from "../lib/format";
import {
  ViewHeader, DataTable, EmptyState, Badge, Avatar, InlineText, InlineSelect, ModalShell,
  Field, Section, ConfirmButton, MemberPicker,
} from "../ui/kit";

function PersonDetail({ person, onClose, onOpenTab }) {
  const { data, update, remove, add, currentUser, memberName, companyName } = useStore();
  const [task, setTask] = useState("");

  const emails = data.emails.filter((e) => e.personId === person.id).sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));
  const tasks = data.tasks.filter((t) => t.personId === person.id);
  const last = lastContactFor(data.emails, personEmails(person));

  const addTask = () => {
    if (!task.trim()) return;
    add("tasks", makeTask({ title: task.trim(), personId: person.id, companyId: person.companyId, assigneeIds: currentUser ? [currentUser.id] : [] }, currentUser && currentUser.id));
    setTask("");
  };

  return (
    <ModalShell wide title={person.name} subtitle={[person.role, person.organization].filter(Boolean).join(" · ")} onClose={onClose}>
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20 }}>
        <Avatar name={person.name} size={54} />
        <div style={{ flex: 1 }}>
          <InlineText value={person.name} style={{ fontSize: 18, fontWeight: 700 }} onCommit={(v) => v.trim() && update("people", person.id, { name: v.trim() })} />
          <InlineText value={person.role} placeholder="Add a role" style={{ color: "var(--dim)" }} onCommit={(v) => update("people", person.id, { role: v })} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 22 }}>
        <Field label="EMAIL"><InlineText value={person.email} mono style={{ color: "var(--accent)" }} onCommit={(v) => update("people", person.id, { email: v })} /></Field>
        <Field label="PHONE"><InlineText value={person.phone} mono onCommit={(v) => update("people", person.id, { phone: v })} /></Field>
        <Field label="COMPANY">
          <InlineSelect value={person.companyId} options={data.companies.map((c) => ({ key: c.id, label: c.name }))} placeholder="No company"
            onCommit={(v) => update("people", person.id, { companyId: v, organization: companyName(v) })} />
        </Field>
        <Field label="RELATIONSHIP">
          <InlineSelect value={person.relationship || "new"} options={RELATIONSHIP_STAGES} onCommit={(v) => update("people", person.id, { relationship: v })} />
        </Field>
        <Field label="RELATIONSHIP OWNER">
          <InlineSelect value={person.ownerId} options={data.team.map((m) => ({ key: m.id, label: m.name }))} placeholder="Unassigned"
            onCommit={(v) => update("people", person.id, { ownerId: v })} />
        </Field>
        <Field label="LAST CONTACT">
          <div style={{ fontSize: 13, color: last && daysSince(last) > (data.settings.followUpDays || 14) ? "var(--red)" : "var(--bone)" }}>
            {relativeDays(last)}
          </div>
        </Field>
      </div>

      <Field label="NOTES">
        <InlineText value={person.notes} multiline placeholder="What is the relationship, what do they care about…" onCommit={(v) => update("people", person.id, { notes: v })} />
      </Field>

      <Section title="LINKED PROJECTS">
        <MemberPicker
          team={data.projects.map((p) => ({ id: p.id, name: p.title }))}
          selectedIds={person.projectIds || []}
          label="Link projects"
          onChange={(ids) => update("people", person.id, { projectIds: ids })}
        />
      </Section>

      <Section title={`EMAILS · ${emails.length}`} right={
        <button className="md-btn md-btn-ghost" style={{ fontSize: 12 }} onClick={() => onOpenTab && onOpenTab("emails")}>Open Emails <ExternalLink size={11} /></button>
      }>
        {emails.length === 0 && <div style={{ fontSize: 12, color: "var(--dim)" }}>No email logged with this person yet.</div>}
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
          <div key={t.id} style={{ fontSize: 13, padding: "5px 0", color: t.status === "done" ? "var(--dim)" : "var(--bone)", textDecoration: t.status === "done" ? "line-through" : "none" }}>
            {t.title}
          </div>
        ))}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input className="md-input" placeholder="Add a task about this person…" value={task}
            onChange={(e) => setTask(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addTask(); }} />
          <button className="md-btn" onClick={addTask}><Plus size={13} /></button>
        </div>
      </Section>

      <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
        <ConfirmButton label="Remove person" confirmLabel="Yes, remove" onConfirm={() => { remove("people", person.id); onClose(); }} />
      </div>
    </ModalShell>
  );
}

export function NewPersonModal({ onClose }) {
  const { data, add, currentUser } = useStore();
  const [form, setForm] = useState({ name: "", role: "", companyId: "", email: "", phone: "" });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.name.trim()) return;
    const company = data.companies.find((c) => c.id === form.companyId);
    add("people", {
      name: form.name.trim(),
      role: form.role.trim(),
      companyId: form.companyId || null,
      organization: company ? company.name : "",
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim(),
      projectIds: [],
      status: "Active",
      relationship: "new",
      ownerId: currentUser && currentUser.id,
      notes: "",
    });
    onClose();
  };

  return (
    <ModalShell title="New Person" onClose={onClose}>
      <Field label="FULL NAME"><input className="md-input" autoFocus value={form.name} onChange={set("name")} placeholder="e.g. David Sterling" /></Field>
      <Field label="ROLE / TITLE"><input className="md-input" value={form.role} onChange={set("role")} placeholder="e.g. VP Distribution" /></Field>
      <Field label="COMPANY">
        <select className="md-select" value={form.companyId} onChange={set("companyId")}>
          <option value="">No company</option>
          {data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="EMAIL"><input className="md-input" value={form.email} onChange={set("email")} placeholder="email@domain.com" /></Field>
        <Field label="PHONE"><input className="md-input" value={form.phone} onChange={set("phone")} placeholder="+1 (555) 000-0000" /></Field>
      </div>
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>Save Person</button>
    </ModalShell>
  );
}

export default function PeopleView({ searchQuery, onOpenTab }) {
  const { data, update, companyName, memberName } = useStore();
  const [open, setOpen] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const rows = useMemo(() => {
    let list = data.people.map((p) => ({ ...p, lastContactAt: lastContactFor(data.emails, personEmails(p)) }));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        (p.role || "").toLowerCase().includes(q) ||
        (p.email || "").toLowerCase().includes(q) ||
        (p.organization || "").toLowerCase().includes(q));
    }
    return list.sort((a, b) => (b.lastContactAt || 0) - (a.lastContactAt || 0));
  }, [data.people, data.emails, searchQuery]);

  const threshold = data.settings.followUpDays || 14;

  const columns = [
    { key: "name", label: "NAME", render: (p) => (
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Avatar name={p.name} size={28} />
        <span style={{ fontWeight: 700, color: "var(--bone)" }}>{p.name}</span>
      </div>
    ) },
    { key: "role", label: "ROLE", stopClick: true, render: (p) => <InlineText value={p.role} placeholder="Add role" onCommit={(v) => update("people", p.id, { role: v })} /> },
    { key: "company", label: "COMPANY", stopClick: true, render: (p) => (
      <InlineSelect value={p.companyId} options={data.companies.map((c) => ({ key: c.id, label: c.name }))} placeholder={p.organization || "—"}
        onCommit={(v) => update("people", p.id, { companyId: v, organization: companyName(v) })} />
    ) },
    { key: "email", label: "EMAIL", stopClick: true, render: (p) => (
      <InlineText value={p.email} mono style={{ color: "var(--accent)", fontSize: 12 }} onCommit={(v) => update("people", p.id, { email: v })} />
    ) },
    { key: "phone", label: "PHONE", stopClick: true, render: (p) => (
      <InlineText value={p.phone} mono style={{ fontSize: 12, color: "var(--dim)" }} onCommit={(v) => update("people", p.id, { phone: v })} />
    ) },
    { key: "relationship", label: "RELATIONSHIP", stopClick: true, render: (p) => (
      <InlineSelect value={p.relationship || "new"} options={RELATIONSHIP_STAGES} onCommit={(v) => update("people", p.id, { relationship: v })} />
    ) },
    { key: "owner", label: "OWNED BY", stopClick: true, render: (p) => (
      <InlineSelect value={p.ownerId} options={data.team.map((m) => ({ key: m.id, label: m.name }))} placeholder="—"
        onCommit={(v) => update("people", p.id, { ownerId: v })} />
    ) },
    { key: "last", label: "LAST CONTACT", render: (p) => {
      const stale = p.lastContactAt && daysSince(p.lastContactAt) > threshold;
      return <Badge label={relativeDays(p.lastContactAt)} color={stale ? "var(--red)" : undefined} subtle={!stale} />;
    } },
  ];

  return (
    <div>
      <ViewHeader count={rows.length} label="PEOPLE IN THE NETWORK">
        <button className="md-btn md-btn-primary" onClick={() => setShowNew(true)}><Plus size={14} /> Add Person</button>
      </ViewHeader>

      {rows.length === 0 ? (
        <EmptyState title="No people yet" subtitle="Add someone, or sync a Gmail thread and Dailie will populate people automatically." />
      ) : (
        <DataTable columns={columns} rows={rows} onRowClick={setOpen} />
      )}

      {open && <PersonDetail person={data.people.find((p) => p.id === open.id) || open} onClose={() => setOpen(null)} onOpenTab={onOpenTab} />}
      {showNew && <NewPersonModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
