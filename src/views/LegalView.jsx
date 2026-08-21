import { useMemo, useState } from "react";
import { Plus, Scale, Star, Mail, Phone } from "lucide-react";
import { useStore } from "../lib/store";
import { LEGAL_KINDS, LEGAL_SPECIALTIES, lookupColor } from "../lib/model";
import {
  ViewHeader, FilterChips, DataTable, EmptyState, Badge, Stat, Avatar,
  InlineText, InlineSelect, ModalShell, Field, ConfirmButton,
} from "../ui/kit";

function NewCounselModal({ onClose }) {
  const { data, add } = useStore();
  const [form, setForm] = useState({
    kind: "attorney", name: "", firm: "", specialty: LEGAL_SPECIALTIES[0],
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
    <ModalShell title="New Legal Contact" subtitle="Attorneys, firms, in-house counsel and agents" onClose={onClose}>
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="NAME"><input className="md-input" autoFocus value={form.name} onChange={set("name")} placeholder="Full name" /></Field>
        <Field label="TYPE">
          <select className="md-select" value={form.kind} onChange={set("kind")}>
            {LEGAL_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </Field>
      </div>
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="FIRM"><input className="md-input" value={form.firm} onChange={set("firm")} placeholder="e.g. Loeb & Loeb" /></Field>
        <Field label="SPECIALTY">
          <select className="md-select" value={form.specialty} onChange={set("specialty")}>
            {LEGAL_SPECIALTIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
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
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>Save Contact</button>
    </ModalShell>
  );
}

export default function LegalView({ searchQuery }) {
  const { data, update, remove } = useStore();
  const [kindFilter, setKindFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);

  const all = data.legal || [];
  const rows = useMemo(() => {
    let list = [...all];
    if (kindFilter !== "all") list = list.filter((l) => l.kind === kindFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((l) =>
        (l.name || "").toLowerCase().includes(q) ||
        (l.firm || "").toLowerCase().includes(q) ||
        (l.specialty || "").toLowerCase().includes(q) ||
        (l.email || "").toLowerCase().includes(q));
    }
    // Preferred counsel first — that is who you call.
    return list.sort((a, b) => (b.preferred ? 1 : 0) - (a.preferred ? 1 : 0) || (a.name || "").localeCompare(b.name || ""));
  }, [all, kindFilter, searchQuery]);

  const firms = new Set(all.map((l) => (l.firm || "").trim().toLowerCase()).filter(Boolean));
  const onRetainer = all.filter((l) => l.preferred);

  const columns = [
    { key: "name", label: "NAME", cellStyle: { minWidth: 200 }, stopClick: true, render: (l) => (
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <Avatar name={l.name} size={28} />
        <div style={{ minWidth: 0 }}>
          <InlineText value={l.name} style={{ fontWeight: 700 }} onCommit={(v) => update("legal", l.id, { name: v })} />
          <InlineText value={l.firm} placeholder="Add firm" style={{ fontSize: 11, color: "var(--dim)" }}
            onCommit={(v) => update("legal", l.id, { firm: v })} />
        </div>
      </div>
    ) },
    { key: "kind", label: "TYPE", stopClick: true, render: (l) => (
      <InlineSelect value={l.kind} options={LEGAL_KINDS} color={lookupColor(LEGAL_KINDS, l.kind)}
        onCommit={(v) => update("legal", l.id, { kind: v })} />
    ) },
    { key: "specialty", label: "SPECIALTY", stopClick: true, render: (l) => (
      <InlineSelect value={l.specialty} options={LEGAL_SPECIALTIES.map((s) => ({ key: s, label: s }))} placeholder="—"
        onCommit={(v) => update("legal", l.id, { specialty: v })} />
    ) },
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
      <button className="md-btn md-btn-ghost" title={l.preferred ? "Preferred counsel" : "Mark as preferred"}
        style={{ padding: 5 }} onClick={() => update("legal", l.id, { preferred: !l.preferred })}>
        <Star size={14} color={l.preferred ? "var(--warn)" : "var(--dim-2)"} fill={l.preferred ? "var(--warn)" : "none"} />
      </button>
    ) },
    { key: "del", label: "", stopClick: true, render: (l) => <ConfirmButton label="" confirmLabel="Sure?" onConfirm={() => remove("legal", l.id)} /> },
  ];

  return (
    <div>
      <ViewHeader count={rows.length} label="LEGAL">
        <button className="md-btn md-btn-primary" onClick={() => setShowNew(true)}><Plus size={14} /> New Contact</button>
      </ViewHeader>

      <div style={{ display: "flex", gap: 34, flexWrap: "wrap", padding: "13px 18px", border: "1px solid var(--rule)", borderRadius: 12, background: "var(--panel)", marginBottom: 20 }}>
        <Stat label="CONTACTS" value={all.length} />
        <Stat label="FIRMS" value={firms.size} />
        <Stat label="PREFERRED" value={onRetainer.length} accent="var(--warn)" />
        <Stat label="CONTRACTS ON FILE" value={(data.contracts || []).length} accent="var(--accent)" />
      </div>

      <div style={{ marginBottom: 18 }}>
        <FilterChips options={LEGAL_KINDS.map((k) => ({ ...k, count: all.filter((l) => l.kind === k.key).length }))}
          value={kindFilter} onChange={setKindFilter} allLabel="All Contacts" />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No legal contacts yet"
          subtitle="Keep attorneys, firms, in-house counsel and agents here — with their specialty, rate and which project they cover. Signed paper lives in Contracts."
          action={<button className="md-btn md-btn-primary" onClick={() => setShowNew(true)}><Scale size={14} /> New Contact</button>}
        />
      ) : (
        <DataTable columns={columns} rows={rows} exportTitle="Legal" />
      )}

      {showNew && <NewCounselModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
