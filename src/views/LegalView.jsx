import { useMemo, useState } from "react";
import { Plus, Scale, Briefcase, Star, Mail, ExternalLink } from "lucide-react";
import { useStore } from "../lib/store";
import {
  LEGAL_KINDS, COUNSEL_KINDS, REPRESENTATION_KINDS, CONTRACT_STATUSES,
  isRepresentationKind, rosterRepresentedBy, lookupColor, lookupLabel, lastContactFor,
} from "../lib/model";
import { relativeDays, formatShort, daysSince } from "../lib/format";
import { safeHref } from "../lib/safeUrl";
import {
  ViewHeader, FilterChips, DataTable, EmptyState, Badge, Stat, Avatar,
  InlineText, InlineSelect, ModalShell, Field, Section, ConfirmButton,
} from "../ui/kit";

/**
 * One view backs Legal and Representation — same contact records, split by kind
 * so agents are not mixed in with counsel.
 */
function NewCounselModal({ onClose, representation }) {
  const { data, add } = useStore();
  const kinds = representation ? REPRESENTATION_KINDS : COUNSEL_KINDS;
  const [form, setForm] = useState({
    kind: kinds[0].key, name: "", firm: "", specialty: "",
    email: "", phone: "", rate: "", companyId: "", projectId: "", notes: "",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.name.trim() && !form.firm.trim()) return;
    add("legal", {
      ...form,
      name: form.name.trim() || form.firm.trim(),
      email: form.email.trim().toLowerCase(),
      companyId: form.companyId || null,
      projectId: form.projectId || null,
      preferred: false,
    });
    onClose();
  };

  return (
    <ModalShell
      title={representation ? "New Representation" : "New Legal Contact"}
      subtitle={representation ? "Agents, managers and business affairs" : "Attorneys, firms and in-house counsel"}
      onClose={onClose}
    >
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="NAME"><input className="md-input" autoFocus value={form.name} onChange={set("name")} placeholder="Full name" /></Field>
        <Field label="TYPE">
          <select className="md-select" value={form.kind} onChange={set("kind")}>
            {kinds.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="FIRM"><input className="md-input" value={form.firm} onChange={set("firm")} placeholder={representation ? "e.g. WME" : "e.g. Loeb & Loeb"} /></Field>
        <Field label="SPECIALTY"><input className="md-input" value={form.specialty} onChange={set("specialty")} placeholder="e.g. Production Legal" /></Field>
      </div>
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="EMAIL"><input className="md-input" value={form.email} onChange={set("email")} placeholder="name@firm.com" /></Field>
        <Field label="PHONE"><input className="md-input" value={form.phone} onChange={set("phone")} placeholder="+1 …" /></Field>
      </div>
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="RATE"><input className="md-input" value={form.rate} onChange={set("rate")} placeholder="e.g. $650/hr" /></Field>
        <Field label="PROJECT">
          <select className="md-select" value={form.projectId} onChange={set("projectId")}>
            <option value="">No project</option>
            {data.projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </Field>
      </div>
      <Field label="COMPANY" hint="If they act for one of the companies on the board.">
        <select className="md-select" value={form.companyId} onChange={set("companyId")}>
          <option value="">Not linked</option>
          {data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>
        {representation ? "Save Representation" : "Save Contact"}
      </button>
    </ModalShell>
  );
}

function CounselDetail({ contact, onClose, onOpenTab, representation }) {
  const { data, update, remove } = useStore();
  const live = (data.legal || []).find((l) => l.id === contact.id) || contact;
  const patch = (changes) => update("legal", live.id, changes);
  const kind = LEGAL_KINDS.find((k) => k.key === live.kind) || LEGAL_KINDS[0];
  const addresses = (live.email || "").trim() ? [live.email.trim().toLowerCase()] : [];
  const last = lastContactFor(data.emails, addresses);
  const emails = data.emails
    .filter((e) => {
      if (!addresses.length) return false;
      const set = new Set(addresses);
      return [e.from, ...(e.to || [])].some((p) => set.has(String(p || "").toLowerCase()));
    })
    .sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));
  const contracts = (data.contracts || []).filter((c) =>
    (live.companyId && c.companyId === live.companyId) || (live.projectId && c.projectId === live.projectId));
  const roster = representation ? rosterRepresentedBy(data.talent, live) : [];
  const project = data.projects.find((p) => p.id === live.projectId);
  const company = data.companies.find((c) => c.id === live.companyId);
  const stale = last && daysSince(last) > (data.settings.followUpDays || 14);
  const kinds = representation ? REPRESENTATION_KINDS : COUNSEL_KINDS;

  return (
    <ModalShell
      wide
      title={live.name || live.firm || "Untitled"}
      subtitle={[lookupLabel(kinds, live.kind, lookupLabel(LEGAL_KINDS, live.kind)), live.firm, live.specialty].filter(Boolean).join(" · ")}
      onClose={onClose}
    >
      <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20 }}>
        <Avatar name={live.name || live.firm} size={54} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <InlineText value={live.name} style={{ fontSize: 18, fontWeight: 700 }} placeholder="Add a name"
            onCommit={(v) => v.trim() && patch({ name: v.trim() })} />
          <InlineText value={live.firm} placeholder="Add a firm" style={{ color: "var(--dim)" }}
            onCommit={(v) => patch({ firm: v })} />
        </div>
        <button className="md-btn md-btn-ghost" title={live.preferred ? "Preferred" : "Mark as preferred"}
          style={{ padding: 8 }} onClick={() => patch({ preferred: !live.preferred })}>
          <Star size={18} color={live.preferred ? "var(--warn)" : "var(--dim-2)"} fill={live.preferred ? "var(--warn)" : "none"} />
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 14, marginBottom: 20 }}>
        <Field label="TYPE">
          <InlineSelect value={live.kind} options={kinds} color={kind.color} onCommit={(v) => patch({ kind: v })} />
        </Field>
        <Field label="SPECIALTY">
          <InlineText value={live.specialty} placeholder="e.g. Production Legal"
            onCommit={(v) => patch({ specialty: v })} />
        </Field>
        <Field label="EMAIL">
          <div>
            <InlineText value={live.email} mono style={{ color: "var(--accent)" }} placeholder="name@firm.com"
              onCommit={(v) => patch({ email: v.trim().toLowerCase() })} />
            {safeHref(live.email && `mailto:${live.email}`) && (
              <a href={safeHref(`mailto:${live.email}`)} className="md-mono"
                style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4, marginTop: 6 }}>
                Write <ExternalLink size={11} />
              </a>
            )}
          </div>
        </Field>
        <Field label="PHONE">
          <InlineText value={live.phone} mono placeholder="+1 …" onCommit={(v) => patch({ phone: v })} />
        </Field>
        <Field label="RATE">
          <InlineText value={live.rate} mono placeholder="e.g. $650/hr" onCommit={(v) => patch({ rate: v })} />
        </Field>
        <Field label="PROJECT">
          <InlineSelect value={live.projectId} options={data.projects.map((p) => ({ key: p.id, label: p.title }))} placeholder="No project"
            onCommit={(v) => patch({ projectId: v })} />
        </Field>
        <Field label="COMPANY">
          <InlineSelect value={live.companyId} options={data.companies.map((c) => ({ key: c.id, label: c.name }))} placeholder="Not linked"
            onCommit={(v) => patch({ companyId: v })} />
        </Field>
        <Field label="LAST CONTACT">
          <div style={{ fontSize: 13, color: stale ? "var(--red)" : "var(--bone)" }}>{relativeDays(last)}</div>
        </Field>
      </div>

      <Field label="NOTES">
        <InlineText value={live.notes} multiline placeholder="What they cover, who introduced them, anything the team should know…"
          onCommit={(v) => patch({ notes: v })} />
      </Field>

      {representation && (
        <Section title={`REPRESENTS · ${roster.length}`} right={
          <button className="md-btn md-btn-ghost" style={{ fontSize: 12 }} onClick={() => onOpenTab && onOpenTab("team")}>
            Open Roster <ExternalLink size={11} />
          </button>
        }>
          {roster.length === 0 && <div style={{ fontSize: 12, color: "var(--dim)" }}>Nobody on the roster names this agent yet.</div>}
          {roster.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--rule)" }}>
              <Avatar name={t.name} size={26} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
                <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>{t.discipline || t.agent || "—"}</div>
              </div>
            </div>
          ))}
        </Section>
      )}

      {(project || company) && (
        <Section title="LINKED">
          {project && (
            <div style={{ fontSize: 13, padding: "6px 0" }}>
              Project · {project.title}
            </div>
          )}
          {company && (
            <div style={{ fontSize: 13, padding: "6px 0" }}>
              Company · {company.name}
            </div>
          )}
        </Section>
      )}

      {contracts.length > 0 && (
        <Section title={`CONTRACTS & NDAs · ${contracts.length}`} right={
          <button className="md-btn md-btn-ghost" style={{ fontSize: 12 }} onClick={() => onOpenTab && onOpenTab("contracts")}>
            Open Contracts <ExternalLink size={11} />
          </button>
        }>
          {contracts.map((c) => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", fontSize: 13 }}>
              <span style={{ flex: 1 }}>{c.title}</span>
              <Badge label={lookupLabel(CONTRACT_STATUSES, c.status)} color={lookupColor(CONTRACT_STATUSES, c.status)} />
            </div>
          ))}
        </Section>
      )}

      <Section title={`EMAILS · ${emails.length}`} right={
        <button className="md-btn md-btn-ghost" style={{ fontSize: 12 }} onClick={() => onOpenTab && onOpenTab("emails")}>
          Open Emails <ExternalLink size={11} />
        </button>
      }>
        {emails.length === 0 && <div style={{ fontSize: 12, color: "var(--dim)" }}>No email logged with this contact yet.</div>}
        {emails.slice(0, 8).map((e) => (
          <div key={e.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0", borderBottom: "1px solid var(--rule)" }}>
            <Mail size={13} color="var(--dim)" />
            <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.subject}</span>
            <span className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>{formatShort(e.sentAt)}</span>
          </div>
        ))}
      </Section>

      <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
        <ConfirmButton
          label={representation ? "Remove representation" : "Remove contact"}
          confirmLabel="Yes, remove"
          onConfirm={() => { remove("legal", live.id); onClose(); }}
        />
      </div>
    </ModalShell>
  );
}

export default function LegalView({ searchQuery, scope = "legal", onOpenTab }) {
  const { data, update, remove } = useStore();
  const [kindFilter, setKindFilter] = useState("all");
  const [open, setOpen] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const representation = scope === "representation";
  const kinds = representation ? REPRESENTATION_KINDS : COUNSEL_KINDS;
  const Icon = representation ? Briefcase : Scale;

  const scoped = useMemo(() => (
    (data.legal || []).filter((l) => representation ? isRepresentationKind(l.kind) : !isRepresentationKind(l.kind))
  ), [data.legal, representation]);

  const rows = useMemo(() => {
    let list = [...scoped];
    if (kindFilter !== "all") list = list.filter((l) => l.kind === kindFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((l) =>
        (l.name || "").toLowerCase().includes(q) ||
        (l.firm || "").toLowerCase().includes(q) ||
        (l.specialty || "").toLowerCase().includes(q) ||
        (l.email || "").toLowerCase().includes(q));
    }
    return list.sort((a, b) => (b.preferred ? 1 : 0) - (a.preferred ? 1 : 0) || (a.name || "").localeCompare(b.name || ""));
  }, [scoped, kindFilter, searchQuery]);

  const firms = new Set(scoped.map((l) => (l.firm || "").trim().toLowerCase()).filter(Boolean));
  const onRetainer = scoped.filter((l) => l.preferred);
  const repped = (data.talent || []).filter((t) => (t.agent || "").trim()).length;

  const columns = [
    { key: "name", label: "NAME", cellStyle: { minWidth: 200 }, render: (l) => (
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <Avatar name={l.name || l.firm} size={28} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: "var(--bone)" }}>{l.name || l.firm || "Untitled"}</div>
          {l.firm && l.name ? <div style={{ fontSize: 11, color: "var(--dim)" }}>{l.firm}</div> : null}
        </div>
      </div>
    ) },
    { key: "kind", label: "TYPE", stopClick: true, render: (l) => (
      <InlineSelect value={l.kind} options={LEGAL_KINDS} color={lookupColor(LEGAL_KINDS, l.kind)}
        onCommit={(v) => update("legal", l.id, { kind: v })} />
    ) },
    { key: "specialty", label: "SPECIALTY", stopClick: true, render: (l) => (
      <InlineText value={l.specialty} placeholder="—" onCommit={(v) => update("legal", l.id, { specialty: v })} />
    ) },
    ...(representation ? [{
      key: "represents", label: "REPRESENTS", cellStyle: { minWidth: 160 }, render: (l) => {
        const list = rosterRepresentedBy(data.talent, l);
        if (!list.length) return <span style={{ fontSize: 12, color: "var(--dim-2)" }}>—</span>;
        return (
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {list.slice(0, 2).map((t) => <Badge key={t.id} label={t.name} subtle />)}
            {list.length > 2 && <span className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>+{list.length - 2}</span>}
          </div>
        );
      },
    }] : []),
    { key: "email", label: "EMAIL", stopClick: true, render: (l) => (
      <InlineText value={l.email} mono placeholder="—" style={{ color: "var(--accent)", fontSize: 12 }}
        onCommit={(v) => update("legal", l.id, { email: v.trim().toLowerCase() })} />
    ) },
    { key: "phone", label: "PHONE", stopClick: true, render: (l) => (
      <InlineText value={l.phone} mono placeholder="—" style={{ fontSize: 12 }}
        onCommit={(v) => update("legal", l.id, { phone: v })} />
    ) },
    { key: "rate", label: "RATE", stopClick: true, render: (l) => (
      <InlineText value={l.rate} mono placeholder="—" onCommit={(v) => update("legal", l.id, { rate: v })} />
    ) },
    { key: "project", label: "PROJECT", stopClick: true, render: (l) => (
      <InlineSelect value={l.projectId} options={data.projects.map((p) => ({ key: p.id, label: p.title }))} placeholder="—"
        onCommit={(v) => update("legal", l.id, { projectId: v })} />
    ) },
    { key: "company", label: "COMPANY", stopClick: true, render: (l) => (
      <InlineSelect value={l.companyId} options={data.companies.map((c) => ({ key: c.id, label: c.name }))} placeholder="—"
        onCommit={(v) => update("legal", l.id, { companyId: v })} />
    ) },
    { key: "notes", label: "NOTES", cellStyle: { minWidth: 180 }, stopClick: true, render: (l) => (
      <InlineText value={l.notes} placeholder="Add note" onCommit={(v) => update("legal", l.id, { notes: v })} />
    ) },
    { key: "preferred", label: "", stopClick: true, width: 40, render: (l) => (
      <button className="md-btn md-btn-ghost" title={l.preferred ? "Preferred" : "Mark as preferred"}
        style={{ padding: 5 }} onClick={() => update("legal", l.id, { preferred: !l.preferred })}>
        <Star size={14} color={l.preferred ? "var(--warn)" : "var(--dim-2)"} fill={l.preferred ? "var(--warn)" : "none"} />
      </button>
    ) },
    { key: "del", label: "", stopClick: true, render: (l) => <ConfirmButton label="" confirmLabel="Sure?" onConfirm={() => remove("legal", l.id)} /> },
  ];

  return (
    <div>
      <ViewHeader count={rows.length} label={representation ? "REPRESENTATION" : "LEGAL"}>
        <button className="md-btn md-btn-primary" onClick={() => setShowNew(true)}>
          <Plus size={14} /> {representation ? "New Agent" : "New Contact"}
        </button>
      </ViewHeader>

      <div style={{ display: "flex", gap: 34, flexWrap: "wrap", padding: "13px 18px", border: "1px solid var(--rule)", borderRadius: 12, background: "var(--panel)", marginBottom: 20 }}>
        <Stat label="CONTACTS" value={scoped.length} />
        <Stat label="FIRMS" value={firms.size} />
        <Stat label="PREFERRED" value={onRetainer.length} accent="var(--warn)" />
        {representation
          ? <Stat label="ROSTER WITH A REP" value={repped} accent="var(--accent)" />
          : <Stat label="CONTRACTS ON FILE" value={(data.contracts || []).length} accent="var(--accent)" />}
      </div>

      <div style={{ marginBottom: 18 }}>
        <FilterChips options={kinds.map((k) => ({ ...k, count: scoped.filter((l) => l.kind === k.key).length }))}
          value={kindFilter} onChange={setKindFilter} allLabel={representation ? "All Representation" : "All Contacts"} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={representation ? "No representation yet" : "No legal contacts yet"}
          subtitle={representation
            ? "Keep agents, managers and business affairs here — with who they represent on the roster. Counsel stays on Legal."
            : "Keep attorneys, firms and in-house counsel here — with their specialty, rate and which project they cover. Agents live on Representation. Signed paper lives in Contracts."}
          action={<button className="md-btn md-btn-primary" onClick={() => setShowNew(true)}><Icon size={14} /> {representation ? "New Agent" : "New Contact"}</button>}
        />
      ) : (
        <DataTable columns={columns} rows={rows} onRowClick={setOpen} exportTitle={representation ? "Representation" : "Legal"} />
      )}

      {open && (
        <CounselDetail
          contact={(data.legal || []).find((l) => l.id === open.id) || open}
          onClose={() => setOpen(null)}
          onOpenTab={onOpenTab}
          representation={representation}
        />
      )}
      {showNew && <NewCounselModal onClose={() => setShowNew(false)} representation={representation} />}
    </div>
  );
}
