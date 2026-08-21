import { useMemo, useState } from "react";
import { Plus, Receipt, ArrowDownLeft, ArrowUpRight, Banknote } from "lucide-react";
import { useStore } from "../lib/store";
import { INVOICE_STATUSES, PAYMENT_STATUSES, lookupColor } from "../lib/model";
import { formatMoney, parseMoney, formatShort, dateInputValue, tsFromDateInput } from "../lib/format";
import {
  ViewHeader, FilterChips, DataTable, EmptyState, Badge, Stat, InlineText, InlineSelect, InlineDate,
  ModalShell, Field, FileAttachButton, AttachmentRow, SingleAttachmentCell, ConfirmButton,
} from "../ui/kit";
import { useDraftUploads } from "../lib/draftUploads";

function NewInvoiceModal({ onClose, defaultDirection }) {
  const { data, add } = useStore();
  const drafts = useDraftUploads();
  const [form, setForm] = useState({
    number: "", direction: defaultDirection || "incoming", companyId: "", projectId: "",
    amount: "", currency: "USD", status: "draft", dueAt: "", notes: "",
  });
  const [file, setFile] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.amount.trim() && !form.number.trim()) return;
    add("invoices", {
      number: form.number.trim(),
      direction: form.direction,
      companyId: form.companyId || null,
      projectId: form.projectId || null,
      amount: parseMoney(form.amount),
      currency: form.currency,
      status: form.status,
      issuedAt: Date.now(),
      dueAt: tsFromDateInput(form.dueAt),
      paidAt: null,
      notes: form.notes.trim(),
      ...(file || {}),
    });
    drafts.markSaved();
    onClose();
  };

  return (
    <ModalShell title="New Invoice" onClose={onClose}>
      <Field label="DIRECTION" hint="Receivable is money coming to us. Payable is a vendor bill we owe.">
        <select className="md-select" value={form.direction} onChange={set("direction")}>
          <option value="incoming">Receivable — we invoiced a client</option>
          <option value="outgoing">Payable — a vendor invoiced us</option>
        </select>
      </Field>
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="INVOICE NUMBER"><input className="md-input" autoFocus value={form.number} onChange={set("number")} placeholder="MAT-2041" /></Field>
        <Field label="AMOUNT"><input className="md-input" value={form.amount} onChange={set("amount")} placeholder="850000" /></Field>
      </div>
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="COMPANY">
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
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="STATUS">
          <select className="md-select" value={form.status} onChange={set("status")}>
            {INVOICE_STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="DUE DATE"><input type="date" className="md-input" value={form.dueAt} onChange={set("dueAt")} /></Field>
      </div>
      <Field label="NOTES"><textarea className="md-textarea" rows={2} value={form.notes} onChange={set("notes")} /></Field>
      <Field label="INVOICE DOCUMENT">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <FileAttachButton kind="documents" label="Upload invoice" accept=".pdf,.png,.jpg,.jpeg"
            onUploaded={(next) => { if (file) drafts.drop(file); if (drafts.keep(next)) setFile(next); }} />
          {file && <AttachmentRow record={file} onRemove={() => { drafts.drop(file); setFile(null); }} />}
        </div>
      </Field>
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>Save Invoice</button>
    </ModalShell>
  );
}

function NewPaymentModal({ onClose }) {
  const { data, add } = useStore();
  const [form, setForm] = useState({ companyId: "", projectId: "", invoiceId: "", amount: "", dueAt: "", method: "Wire", notes: "" });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const vendors = data.companies.filter((c) => c.type === "vendor" || c.type === "ai-tool" || c.type === "agency");

  const submit = () => {
    if (!form.amount.trim()) return;
    add("payments", {
      companyId: form.companyId || null,
      projectId: form.projectId || null,
      invoiceId: form.invoiceId || null,
      amount: parseMoney(form.amount),
      currency: "USD",
      dueAt: tsFromDateInput(form.dueAt),
      paidAt: null,
      status: "unpaid",
      method: form.method,
      notes: form.notes.trim(),
    });
    onClose();
  };

  return (
    <ModalShell title="New Vendor Payment" onClose={onClose}>
      <Field label="VENDOR">
        <select className="md-select" value={form.companyId} onChange={set("companyId")}>
          <option value="">Select vendor</option>
          {(vendors.length ? vendors : data.companies).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="AMOUNT"><input className="md-input" autoFocus value={form.amount} onChange={set("amount")} placeholder="60000" /></Field>
        <Field label="DUE DATE"><input type="date" className="md-input" value={form.dueAt} onChange={set("dueAt")} /></Field>
      </div>
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="PROJECT">
          <select className="md-select" value={form.projectId} onChange={set("projectId")}>
            <option value="">No project</option>
            {data.projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </Field>
        <Field label="AGAINST INVOICE">
          <select className="md-select" value={form.invoiceId} onChange={set("invoiceId")}>
            <option value="">None</option>
            {data.invoices.filter((i) => i.direction === "outgoing").map((i) => <option key={i.id} value={i.id}>{i.number || i.id}</option>)}
          </select>
        </Field>
      </div>
      <Field label="METHOD"><input className="md-input" value={form.method} onChange={set("method")} placeholder="Wire / ACH / Card" /></Field>
      <Field label="NOTES"><textarea className="md-textarea" rows={2} value={form.notes} onChange={set("notes")} /></Field>
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>Save Payment</button>
    </ModalShell>
  );
}

export default function FinanceView({ searchQuery }) {
  const { data, update, remove, companyName } = useStore();
  const [pane, setPane] = useState("invoices");
  const [directionFilter, setDirectionFilter] = useState("all");
  const [showInvoice, setShowInvoice] = useState(false);
  const [showPayment, setShowPayment] = useState(false);

  const invoices = useMemo(() => {
    let list = [...data.invoices];
    if (directionFilter !== "all") list = list.filter((i) => i.direction === directionFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((i) => (i.number || "").toLowerCase().includes(q) || companyName(i.companyId).toLowerCase().includes(q));
    }
    return list.sort((a, b) => (b.issuedAt || 0) - (a.issuedAt || 0));
  }, [data.invoices, directionFilter, searchQuery, companyName]);

  const payments = useMemo(() => {
    let list = [...data.payments];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) => companyName(p.companyId).toLowerCase().includes(q) || (p.notes || "").toLowerCase().includes(q));
    }
    return list.sort((a, b) => (a.dueAt || Infinity) - (b.dueAt || Infinity));
  }, [data.payments, searchQuery, companyName]);

  const receivableOpen = data.invoices.filter((i) => i.direction === "incoming" && i.status !== "paid").reduce((s, i) => s + (i.amount || 0), 0);
  const payableOpen = data.invoices.filter((i) => i.direction === "outgoing" && i.status !== "paid").reduce((s, i) => s + (i.amount || 0), 0);
  const overdue = data.invoices.filter((i) => i.status !== "paid" && i.dueAt && i.dueAt < Date.now()).length;
  const vendorOwed = data.payments.filter((p) => p.status !== "paid").reduce((s, p) => s + (p.amount || 0), 0);

  const invoiceColumns = [
    { key: "dir", label: "", width: 34, render: (i) => (
      i.direction === "incoming"
        ? <ArrowDownLeft size={14} color="var(--sage)" title="Receivable" />
        : <ArrowUpRight size={14} color="var(--warn)" title="Payable" />
    ) },
    { key: "number", label: "INVOICE", stopClick: true, render: (i) => (
      <InlineText value={i.number} mono style={{ fontWeight: 700 }} placeholder="Add number" onCommit={(v) => update("invoices", i.id, { number: v })} />
    ) },
    { key: "company", label: "COMPANY", stopClick: true, render: (i) => (
      <InlineSelect value={i.companyId} options={data.companies.map((c) => ({ key: c.id, label: c.name }))} placeholder="—"
        onCommit={(v) => update("invoices", i.id, { companyId: v })} />
    ) },
    { key: "project", label: "PROJECT", stopClick: true, render: (i) => (
      <InlineSelect value={i.projectId} options={data.projects.map((p) => ({ key: p.id, label: p.title }))} placeholder="—"
        onCommit={(v) => update("invoices", i.id, { projectId: v })} />
    ) },
    { key: "amount", label: "AMOUNT", stopClick: true, render: (i) => (
      <InlineText value={formatMoney(i.amount, i.currency)} mono style={{ color: "var(--accent)", fontWeight: 700 }}
        onCommit={(v) => update("invoices", i.id, { amount: parseMoney(v) })} />
    ) },
    { key: "status", label: "PAID?", stopClick: true, render: (i) => (
      <InlineSelect value={i.status} options={INVOICE_STATUSES} color={lookupColor(INVOICE_STATUSES, i.status)}
        onCommit={(v) => update("invoices", i.id, { status: v, paidAt: v === "paid" ? Date.now() : null })} />
    ) },
    { key: "due", label: "DUE", stopClick: true, render: (i) => {
      const late = i.status !== "paid" && i.dueAt && i.dueAt < Date.now();
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <InlineDate value={i.dueAt} onCommit={(v) => update("invoices", i.id, { dueAt: v })} />
          {late && <Badge label="OVERDUE" color="var(--red)" />}
        </div>
      );
    } },
    { key: "file", label: "DOCUMENT", stopClick: true, cellStyle: { minWidth: 180 }, render: (i) => (
      <SingleAttachmentCell record={i} accept=".pdf,.png,.jpg,.jpeg"
        onChange={(changes) => update("invoices", i.id, changes)} />
    ) },
    { key: "del", label: "", stopClick: true, render: (i) => <ConfirmButton label="" confirmLabel="Sure?" onConfirm={() => remove("invoices", i.id)} /> },
  ];

  const paymentColumns = [
    { key: "vendor", label: "VENDOR", stopClick: true, render: (p) => (
      <InlineSelect value={p.companyId} options={data.companies.map((c) => ({ key: c.id, label: c.name }))} placeholder="—"
        onCommit={(v) => update("payments", p.id, { companyId: v })} />
    ) },
    { key: "amount", label: "AMOUNT OUT", stopClick: true, render: (p) => (
      <InlineText value={formatMoney(p.amount, p.currency)} mono style={{ color: "var(--warn)", fontWeight: 700 }}
        onCommit={(v) => update("payments", p.id, { amount: parseMoney(v) })} />
    ) },
    { key: "project", label: "PROJECT", stopClick: true, render: (p) => (
      <InlineSelect value={p.projectId} options={data.projects.map((x) => ({ key: x.id, label: x.title }))} placeholder="—"
        onCommit={(v) => update("payments", p.id, { projectId: v })} />
    ) },
    { key: "status", label: "PAID?", stopClick: true, render: (p) => (
      <InlineSelect value={p.status} options={PAYMENT_STATUSES} color={lookupColor(PAYMENT_STATUSES, p.status)}
        onCommit={(v) => update("payments", p.id, { status: v, paidAt: v === "paid" ? Date.now() : null })} />
    ) },
    { key: "due", label: "DUE", stopClick: true, render: (p) => {
      const late = p.status !== "paid" && p.dueAt && p.dueAt < Date.now();
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <InlineDate value={p.dueAt} onCommit={(v) => update("payments", p.id, { dueAt: v })} />
          {late && <Badge label="OVERDUE" color="var(--red)" />}
        </div>
      );
    } },
    { key: "paidAt", label: "PAID ON", render: (p) => <span className="md-mono" style={{ fontSize: 11, color: "var(--dim)" }}>{p.paidAt ? formatShort(p.paidAt) : "—"}</span> },
    { key: "method", label: "METHOD", stopClick: true, render: (p) => <InlineText value={p.method} placeholder="—" onCommit={(v) => update("payments", p.id, { method: v })} /> },
    { key: "notes", label: "NOTES", cellStyle: { minWidth: 200 }, stopClick: true, render: (p) => (
      <InlineText value={p.notes} placeholder="Add note" onCommit={(v) => update("payments", p.id, { notes: v })} />
    ) },
    { key: "del", label: "", stopClick: true, render: (p) => <ConfirmButton label="" confirmLabel="Sure?" onConfirm={() => remove("payments", p.id)} /> },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {[["invoices", "Invoices"], ["payments", "Vendor Payments Out"]].map(([k, l]) => (
          <div key={k} className={"md-chip" + (pane === k ? " active" : "")} role="button" tabIndex={0}
            onClick={() => setPane(k)} onKeyDown={(e) => { if (e.key === "Enter") setPane(k); }}>{l}</div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 36, flexWrap: "wrap", padding: "14px 18px", border: "1px solid var(--rule)", borderRadius: 12, background: "var(--panel)", marginBottom: 20 }}>
        <Stat label="RECEIVABLE OPEN" value={formatMoney(receivableOpen)} accent="var(--sage)" />
        <Stat label="PAYABLE OPEN" value={formatMoney(payableOpen)} accent="var(--warn)" />
        <Stat label="VENDOR PAYMENTS DUE" value={formatMoney(vendorOwed)} accent="var(--warn)" />
        <Stat label="OVERDUE INVOICES" value={overdue} accent={overdue ? "var(--red)" : undefined} />
      </div>

      {pane === "invoices" ? (
        <div>
          <ViewHeader count={invoices.length} label="INVOICES">
            <button className="md-btn md-btn-primary" onClick={() => setShowInvoice(true)}><Plus size={14} /> New Invoice</button>
          </ViewHeader>
          <div style={{ marginBottom: 18 }}>
            <FilterChips
              options={[
                { key: "incoming", label: "Receivable", count: data.invoices.filter((i) => i.direction === "incoming").length },
                { key: "outgoing", label: "Payable", count: data.invoices.filter((i) => i.direction === "outgoing").length },
              ]}
              value={directionFilter} onChange={setDirectionFilter} allLabel="All Invoices"
            />
          </div>
          {invoices.length === 0 ? (
            <EmptyState title="No invoices yet" subtitle="Track what clients owe you and what vendors have billed, with the documents attached."
              action={<button className="md-btn md-btn-primary" onClick={() => setShowInvoice(true)}><Receipt size={14} /> New Invoice</button>} />
          ) : (
            <DataTable columns={invoiceColumns} rows={invoices} exportTitle="Invoices" />
          )}
        </div>
      ) : (
        <div>
          <ViewHeader count={payments.length} label="OUTGOING VENDOR PAYMENTS">
            <button className="md-btn md-btn-primary" onClick={() => setShowPayment(true)}><Plus size={14} /> New Payment</button>
          </ViewHeader>
          {payments.length === 0 ? (
            <EmptyState title="No vendor payments tracked" subtitle="Log what you owe each vendor, when it is due, and mark it paid when it clears."
              action={<button className="md-btn md-btn-primary" onClick={() => setShowPayment(true)}><Banknote size={14} /> New Payment</button>} />
          ) : (
            <DataTable columns={paymentColumns} rows={payments} exportTitle="Vendor Payments" />
          )}
        </div>
      )}

      {showInvoice && <NewInvoiceModal onClose={() => setShowInvoice(false)} />}
      {showPayment && <NewPaymentModal onClose={() => setShowPayment(false)} />}
    </div>
  );
}
