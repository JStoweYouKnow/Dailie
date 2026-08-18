import { useMemo, useState } from "react";
import { Plus, FileText, ShieldCheck, AlertTriangle } from "lucide-react";
import { useStore } from "../lib/store";
import { CONTRACT_KINDS, CONTRACT_STATUSES, lookupLabel, lookupColor } from "../lib/model";
import { formatShort, dateInputValue, tsFromDateInput, daysSince } from "../lib/format";
import {
  ViewHeader, FilterChips, DataTable, EmptyState, Badge, Stat, InlineText, InlineSelect, InlineDate,
  ModalShell, Field, FileAttachButton, AttachmentRow, ConfirmButton,
} from "../ui/kit";

function NewContractModal({ onClose, defaultKind }) {
  const { data, add, currentUser } = useStore();
  const [form, setForm] = useState({
    kind: defaultKind || "nda",
    title: "",
    companyId: "",
    projectId: "",
    status: "draft",
    value: "",
    notes: "",
  });
  const [file, setFile] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.title.trim()) return;
    add("contracts", {
      kind: form.kind,
      title: form.title.trim(),
      companyId: form.companyId || null,
      projectId: form.projectId || null,
      status: form.status,
      value: form.value.trim(),
      notes: form.notes.trim(),
      ownerId: currentUser && currentUser.id,
      signedAt: null,
      expiresAt: null,
      ...(file || {}),
    });
    onClose();
  };

  return (
    <ModalShell title="New Agreement" onClose={onClose}>
      <Field label="TYPE">
        <select className="md-select" value={form.kind} onChange={set("kind")}>
          {CONTRACT_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
      </Field>
      <Field label="TITLE"><input className="md-input" autoFocus value={form.title} onChange={set("title")} placeholder="e.g. A24 — Mutual NDA" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="COUNTERPARTY">
          <select className="md-select" value={form.companyId} onChange={set("companyId")}>
            <option value="">No company</option>
            {data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="PROJECT">
          <select className="md-select" value={form.projectId} onChange={set("projectId")}>
            <option value="">No project</option>
            {data.projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="STATUS">
          <select className="md-select" value={form.status} onChange={set("status")}>
            {CONTRACT_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="VALUE"><input className="md-input" value={form.value} onChange={set("value")} placeholder="e.g. $180,000" /></Field>
      </div>
      <Field label="NOTES"><textarea className="md-textarea" rows={2} value={form.notes} onChange={set("notes")} /></Field>
      <Field label="DOCUMENT" hint="PDFs, Word files and scans are stored privately — only this app can read them back.">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <FileAttachButton kind="documents" label="Upload signed document" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onUploaded={setFile} />
          {file && <AttachmentRow record={file} onRemove={() => setFile(null)} />}
        </div>
      </Field>
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>Save Agreement</button>
    </ModalShell>
  );
}

export default function ContractsView({ searchQuery }) {
  const { data, update, remove, companyName, projectName } = useStore();
  const [kindFilter, setKindFilter] = useState("all");
  const [showNew, setShowNew] = useState(false);

  const rows = useMemo(() => {
    let list = [...data.contracts];
    if (kindFilter !== "all") list = list.filter((c) => c.kind === kindFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c) =>
        (c.title || "").toLowerCase().includes(q) ||
        companyName(c.companyId).toLowerCase().includes(q) ||
        (c.notes || "").toLowerCase().includes(q));
    }
    return list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [data.contracts, kindFilter, searchQuery, companyName]);

  const ndas = data.contracts.filter((c) => c.kind === "nda");
  const openCount = data.contracts.filter((c) => c.status === "open" || c.status === "sent").length;
  const expiringSoon = data.contracts.filter((c) => c.status === "signed" && c.expiresAt && c.expiresAt < Date.now() + 30 * 86400000).length;

  const columns = [
    { key: "title", label: "AGREEMENT", cellStyle: { minWidth: 220 }, stopClick: true, render: (c) => (
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        {c.kind === "nda" ? <ShieldCheck size={14} color="var(--accent)" /> : <FileText size={14} color="var(--dim)" />}
        <InlineText value={c.title} style={{ fontWeight: 700 }} onCommit={(v) => update("contracts", c.id, { title: v })} />
      </div>
    ) },
    { key: "kind", label: "TYPE", stopClick: true, render: (c) => (
      <InlineSelect value={c.kind} options={CONTRACT_KINDS} onCommit={(v) => update("contracts", c.id, { kind: v })} />
    ) },
    { key: "company", label: "COUNTERPARTY", stopClick: true, render: (c) => (
      <InlineSelect value={c.companyId} options={data.companies.map((x) => ({ key: x.id, label: x.name }))} placeholder="—"
        onCommit={(v) => update("contracts", c.id, { companyId: v })} />
    ) },
    { key: "project", label: "PROJECT", stopClick: true, render: (c) => (
      <InlineSelect value={c.projectId} options={data.projects.map((p) => ({ key: p.id, label: p.title }))} placeholder="—"
        onCommit={(v) => update("contracts", c.id, { projectId: v })} />
    ) },
    { key: "status", label: "STATUS", stopClick: true, render: (c) => (
      <InlineSelect value={c.status} options={CONTRACT_STATUSES} color={lookupColor(CONTRACT_STATUSES, c.status)}
        onCommit={(v) => update("contracts", c.id, { status: v, signedAt: v === "signed" && !c.signedAt ? Date.now() : c.signedAt })} />
    ) },
    { key: "signed", label: "SIGNED", stopClick: true, render: (c) => <InlineDate value={c.signedAt} onCommit={(v) => update("contracts", c.id, { signedAt: v })} /> },
    { key: "expires", label: "EXPIRES", stopClick: true, render: (c) => <InlineDate value={c.expiresAt} onCommit={(v) => update("contracts", c.id, { expiresAt: v })} /> },
    { key: "value", label: "VALUE", stopClick: true, render: (c) => (
      <InlineText value={c.value} mono style={{ color: "var(--accent)", fontWeight: 700 }} onCommit={(v) => update("contracts", c.id, { value: v })} />
    ) },
    { key: "file", label: "DOCUMENT", stopClick: true, cellStyle: { minWidth: 190 }, render: (c) => (
      c.fileName
        ? <AttachmentRow record={c} onRemove={() => update("contracts", c.id, { fileName: "", filePath: "", fileUrl: "", fileSize: 0 })} />
        : <FileAttachButton compact kind="documents" label="Upload" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            onUploaded={(meta) => update("contracts", c.id, meta)} />
    ) },
    { key: "del", label: "", stopClick: true, render: (c) => <ConfirmButton label="" confirmLabel="Sure?" onConfirm={() => remove("contracts", c.id)} /> },
  ];

  return (
    <div>
      <ViewHeader count={rows.length} label="AGREEMENTS ON FILE">
        <button className="md-btn md-btn-primary" onClick={() => setShowNew(true)}><Plus size={14} /> New Agreement</button>
      </ViewHeader>

      <div style={{ display: "flex", gap: 36, flexWrap: "wrap", padding: "14px 18px", border: "1px solid var(--rule)", borderRadius: 12, background: "var(--panel)", marginBottom: 20 }}>
        <Stat label="NDAs SIGNED" value={ndas.filter((c) => c.status === "signed").length} />
        <Stat label="NDAs OPEN" value={ndas.filter((c) => c.status !== "signed").length} accent={ndas.filter((c) => c.status !== "signed").length ? "var(--red)" : undefined} />
        <Stat label="AWAITING SIGNATURE" value={openCount} accent={openCount ? "var(--red)" : undefined} />
        <Stat label="EXPIRING IN 30 DAYS" value={expiringSoon} accent={expiringSoon ? "#c9a227" : undefined} />
      </div>

      <div style={{ marginBottom: 18 }}>
        <FilterChips
          options={CONTRACT_KINDS.map((k) => ({ ...k, count: data.contracts.filter((c) => c.kind === k.key).length }))}
          value={kindFilter} onChange={setKindFilter} allLabel="All Agreements"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No agreements tracked yet"
          subtitle="Track who you have an NDA with, which deal and vendor contracts are signed, and upload the documents themselves."
          action={<button className="md-btn md-btn-primary" onClick={() => setShowNew(true)}><Plus size={14} /> New Agreement</button>}
        />
      ) : (
        <DataTable columns={columns} rows={rows} />
      )}

      {showNew && <NewContractModal onClose={() => setShowNew(false)} defaultKind={kindFilter === "all" ? "nda" : kindFilter} />}
    </div>
  );
}
