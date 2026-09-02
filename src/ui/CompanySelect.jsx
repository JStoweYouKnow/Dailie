import { useState } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../lib/store";
import { COMPANY_TYPES } from "../lib/model";
import { InlineSelect, ModalShell, Field } from "./kit";

const NEW_COMPANY = "__new__";

export function NewCompanyModal({ onClose, onCreated, defaultType }) {
  const { add, currentUser } = useStore();
  const [form, setForm] = useState({
    name: "", domain: "", type: defaultType || "prospect", website: "", notes: "",
    contactName: "", contactEmail: "", contactPhone: "",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    if (!form.name.trim()) return;
    const domain = form.domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    const created = add("companies", {
      name: form.name.trim(),
      domain,
      type: form.type,
      relationship: "new",
      ownerId: (currentUser && currentUser.id) || null,
      website: form.website.trim() || (domain ? `https://${domain}` : ""),
      notes: form.notes.trim(),
      tags: [],
      contactName: form.contactName.trim(),
      contactEmail: form.contactEmail.trim().toLowerCase(),
      contactPhone: form.contactPhone.trim(),
    });
    if (!created) return;
    if (onCreated) onCreated(created);
    onClose();
  };

  return (
    <ModalShell title="New Company" onClose={onClose} zIndex={60}>
      <Field label="COMPANY NAME"><input className="md-input" autoFocus value={form.name} onChange={set("name")} placeholder="e.g. A24" /></Field>
      <Field label="EMAIL DOMAIN" hint="Used to match incoming mail to this company automatically.">
        <input className="md-input" value={form.domain} onChange={set("domain")} placeholder="a24films.com" />
      </Field>
      <Field label="LABEL">
        <select className="md-select" value={form.type} onChange={set("type")}>
          {COMPANY_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </Field>
      <Field label="CONTACT PERSON"><input className="md-input" value={form.contactName} onChange={set("contactName")} placeholder="Who we call" /></Field>
      <div className="md-split" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="CONTACT EMAIL"><input className="md-input" value={form.contactEmail} onChange={set("contactEmail")} placeholder="name@company.com" /></Field>
        <Field label="PHONE"><input className="md-input" value={form.contactPhone} onChange={set("contactPhone")} placeholder="+1 (555) 000-0000" /></Field>
      </div>
      <Field label="RELATIONSHIP NOTES"><textarea className="md-textarea" rows={3} value={form.notes} onChange={set("notes")} placeholder="Where are we with them?" /></Field>
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>Save Company</button>
    </ModalShell>
  );
}

/**
 * Company picker with a New company option, so a company can be added from a
 * project, person, agreement, or anywhere else that already asks for one.
 */
export function CompanySelect({ value, onCommit, placeholder = "No company", native, defaultType }) {
  const { data } = useStore();
  const [showNew, setShowNew] = useState(false);
  const companies = data.companies || [];

  const pick = (id) => {
    if (id === NEW_COMPANY) {
      setShowNew(true);
      return;
    }
    const company = companies.find((c) => c.id === id) || null;
    onCommit(id || null, company);
  };

  const created = (company) => {
    if (!company) return;
    onCommit(company.id, company);
    setShowNew(false);
  };

  const options = [
    ...companies.map((c) => ({ key: c.id, label: c.name })),
    { key: NEW_COMPANY, label: "+ New company" },
  ];

  return (
    <>
      {native ? (
        <select className="md-select" value={value || ""} onChange={(e) => pick(e.target.value)}>
          <option value="">{placeholder}</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value={NEW_COMPANY}>+ New company</option>
        </select>
      ) : (
        <InlineSelect value={value} options={options} placeholder={placeholder} onCommit={pick} />
      )}
      {showNew && createPortal(
        <NewCompanyModal
          defaultType={defaultType}
          onClose={() => setShowNew(false)}
          onCreated={created}
        />,
        document.body
      )}
    </>
  );
}
