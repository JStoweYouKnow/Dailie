import { useMemo, useState } from "react";
import { Plus, Mail, ArrowDownLeft, ArrowUpRight, Eye, Zap, AlertTriangle, Inbox, Send, RefreshCw } from "lucide-react";
import { useStore } from "../lib/store";
import { staleFollowUps, deriveDirectoryFromEmails, makeTask } from "../lib/model";
import { parseEmailPaste, dedupeEmails } from "../lib/emailImport";
import { syncFromGoogle } from "../lib/googleSync";
import { useAccount, useAuthToken } from "../lib/auth";
import { formatShort, relativeDays, daysSince, parseEmailList } from "../lib/format";
import {
  ViewHeader, FilterChips, DataTable, EmptyState, Badge, InlineText, InlineSelect,
  ModalShell, Field, Section, ConfirmButton, Avatar,
} from "../ui/kit";

export function EmailImportModal({ onClose }) {
  const { data, patch, updateSettings, showToast } = useStore();
  const { enabled: authEnabled, account: signedIn } = useAccount();
  const getToken = useAuthToken();
  const [googleState, setGoogleState] = useState("idle");
  const [googleError, setGoogleError] = useState("");
  const [text, setText] = useState("");
  const [account, setAccount] = useState((data.settings.emailAccounts[0] || {}).address || "");
  const [newAccount, setNewAccount] = useState("");
  const [preview, setPreview] = useState(null);

  const accounts = data.settings.emailAccounts || [];

  const addAccount = () => {
    const address = newAccount.trim().toLowerCase();
    if (!address.includes("@")) return;
    if (accounts.some((a) => a.address === address)) return;
    updateSettings({ emailAccounts: [...accounts, { id: `acct-${Date.now()}`, address, label: address }] });
    setAccount(address);
    setNewAccount("");
  };

  const scan = () => {
    const parsed = parseEmailPaste(text, accounts.map((a) => a.address));
    if (!parsed.length) {
      setPreview({ error: "Nothing that looks like email was found in that paste. Copy a whole Gmail thread, or a message with its From/To/Subject headers." });
      return;
    }
    const fresh = dedupeEmails(data.emails, parsed);
    setPreview({ parsed, fresh });
  };

  const commit = () => {
    if (!preview || !preview.fresh || !preview.fresh.length) return;
    const tagged = preview.fresh.map((e) => ({ ...e, account: e.account || account }));
    const withEmails = { ...data, emails: [...tagged, ...data.emails] };
    // Linking straight away is what makes the Companies and People tabs populate.
    const derived = deriveDirectoryFromEmails(withEmails);
    patch({ emails: derived.emails, companies: derived.companies, people: derived.people });
    showToast(`Imported ${tagged.length} email${tagged.length === 1 ? "" : "s"} · ${derived.newCompanies.length} new companies · ${derived.newPeople.length} new people.`, "success");
    onClose();
  };

  return (
    <ModalShell wide title="Sync Email" subtitle="Paste from any of your Gmail accounts" onClose={onClose}>
      {authEnabled && (
        <div style={{ border: "1px solid var(--rule)", borderRadius: 10, padding: 14, marginBottom: 18, background: "var(--panel-raised)" }}>
          <div className="md-mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: ".12em", marginBottom: 8, fontWeight: 700 }}>
            SYNC FROM GOOGLE WORKSPACE
          </div>
          <div style={{ fontSize: 12.5, color: "var(--dim)", marginBottom: 12, lineHeight: 1.55 }}>
            Reads the last 60 days from the mailbox you signed in with
            {signedIn ? <> — <strong style={{ color: "var(--bone)" }}>{signedIn.email}</strong></> : null},
            then builds the companies and people behind it.
          </div>
          <button className="md-btn md-btn-primary" disabled={googleState === "running"}
            onClick={async () => {
              setGoogleState("running");
              setGoogleError("");
              try {
                const result = await syncFromGoogle("gmail", { account: signedIn ? signedIn.email : "", getToken });
                const fresh = dedupeEmails(data.emails, result.emails || []);
                const withEmails = { ...data, emails: [...fresh, ...data.emails] };
                const derived = deriveDirectoryFromEmails(withEmails);
                patch({ emails: derived.emails, companies: derived.companies, people: derived.people });
                showToast(
                  `Gmail: ${fresh.length} new · ${derived.newCompanies.length} companies · ${derived.newPeople.length} people.`,
                  "success"
                );
                onClose();
              } catch (err) {
                setGoogleError(err.message || "Sync failed.");
                setGoogleState("idle");
              }
            }}>
            <RefreshCw size={13} className={googleState === "running" ? "md-spin" : ""} />
            {googleState === "running" ? "Syncing…" : "Sync my Gmail"}
          </button>
          {googleError && (
            <div style={{ fontSize: 12, color: "var(--red)", marginTop: 10, lineHeight: 1.55 }}>{googleError}</div>
          )}
        </div>
      )}

      <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 16, lineHeight: 1.55 }}>
        Or paste instead: open a Gmail thread (or your inbox list), select all, and paste it below.
      </div>

      <Field label="WHICH ACCOUNT IS THIS FROM" hint="Mail from these addresses is treated as sent by us, everything else as received.">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
          {accounts.map((a) => (
            <div key={a.id} className={"md-chip" + (account === a.address ? " active" : "")} role="button" tabIndex={0}
              onClick={() => setAccount(a.address)} onKeyDown={(e) => { if (e.key === "Enter") setAccount(a.address); }}>{a.address}</div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="md-input" placeholder="Add another Gmail account…" value={newAccount}
            onChange={(e) => setNewAccount(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addAccount(); }} />
          <button className="md-btn" onClick={addAccount}><Plus size={13} /> Add</button>
        </div>
      </Field>

      <Field label="PASTE EMAIL">
        <textarea className="md-textarea" rows={9} value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }}
          placeholder={"From: David Sterling <d.sterling@a24films.com>\nTo: elena@matriarch-studios.com\nSubject: Obsidian Echo — deal memo\nDate: Mon, 3 Aug 2026 10:00:00\n\nGreat call today…"} />
      </Field>

      {preview && preview.error && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 12 }}>{preview.error}</div>}

      {preview && preview.parsed && (
        <div style={{ border: "1px solid var(--rule)", borderRadius: 10, padding: 12, marginBottom: 14, background: "var(--panel-raised)" }}>
          <div className="md-mono" style={{ fontSize: 11, color: "var(--accent)", marginBottom: 8 }}>
            FOUND {preview.parsed.length} MESSAGE{preview.parsed.length === 1 ? "" : "S"} · {preview.fresh.length} NEW
          </div>
          {preview.fresh.slice(0, 6).map((e) => (
            <div key={e.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, padding: "4px 0" }}>
              {e.direction === "out" ? <ArrowUpRight size={12} color="var(--accent)" /> : <ArrowDownLeft size={12} color="var(--sage)" />}
              <span className="md-mono" style={{ color: "var(--dim)", width: 170, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.from}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.subject}</span>
              <span className="md-mono" style={{ color: "var(--dim)" }}>{formatShort(e.sentAt)}</span>
            </div>
          ))}
          {preview.fresh.length === 0 && <div style={{ fontSize: 12, color: "var(--dim)" }}>Every message in that paste is already on the board.</div>}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button className="md-btn" style={{ flex: 1, justifyContent: "center" }} onClick={scan} disabled={!text.trim()}>Scan Paste</button>
        <button className="md-btn md-btn-primary" style={{ flex: 1, justifyContent: "center", opacity: preview && preview.fresh && preview.fresh.length ? 1 : 0.5 }}
          onClick={commit} disabled={!preview || !preview.fresh || !preview.fresh.length}>
          Import {preview && preview.fresh ? preview.fresh.length : ""} Email{preview && preview.fresh && preview.fresh.length === 1 ? "" : "s"}
        </button>
      </div>
    </ModalShell>
  );
}

export function LogEmailModal({ onClose, prefill }) {
  const { data, add, currentUser } = useStore();
  const [form, setForm] = useState({
    to: (prefill && prefill.to) || "",
    subject: (prefill && prefill.subject) || "",
    body: (prefill && prefill.body) || "",
    projectId: (prefill && prefill.projectId) || "",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    const recipients = parseEmailList(form.to);
    if (!recipients.length || !form.subject.trim()) return;
    const account = (data.settings.emailAccounts[0] || {}).address || (currentUser && currentUser.email) || "";
    const first = recipients[0].email;
    const person = data.people.find((p) => (p.email || "").toLowerCase() === first);
    const company = person ? data.companies.find((c) => c.id === person.companyId) : null;
    add("emails", {
      direction: "out",
      account,
      from: account,
      to: recipients.map((r) => r.email),
      subject: form.subject.trim(),
      body: form.body,
      snippet: form.body.slice(0, 180),
      sentAt: Date.now(),
      status: "Sent",
      openCount: 0,
      lastOpened: null,
      personId: person ? person.id : null,
      companyId: company ? company.id : null,
      projectId: form.projectId || null,
    });
    onClose();
  };

  return (
    <ModalShell title="Log an Email" onClose={onClose}>
      <Field label="TO"><input className="md-input" autoFocus value={form.to} onChange={set("to")} placeholder="name@company.com, second@company.com" /></Field>
      <Field label="SUBJECT"><input className="md-input" value={form.subject} onChange={set("subject")} placeholder="Subject line" /></Field>
      <Field label="PROJECT">
        <select className="md-select" value={form.projectId} onChange={set("projectId")}>
          <option value="">No project</option>
          {data.projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
      </Field>
      <Field label="BODY / NOTES"><textarea className="md-textarea" rows={4} value={form.body} onChange={set("body")} /></Field>
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>Log Email</button>
    </ModalShell>
  );
}

/**
 * The threshold lives outside the alert list on purpose: it stays reachable after you
 * widen the window and the alerts disappear, so you can always narrow it again.
 */
function FollowUpControl({ count }) {
  const { data, updateSettings } = useStore();
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: count ? 10 : 22,
      padding: "10px 14px", border: "1px solid var(--rule)", borderRadius: 10, background: "var(--panel)",
    }}>
      <AlertTriangle size={14} color={count ? "var(--red)" : "var(--dim)"} />
      <span className="md-mono" style={{ fontSize: 11, letterSpacing: ".1em", color: count ? "var(--red)" : "var(--dim)", fontWeight: 700 }}>
        {count ? `${count} RELATIONSHIP${count === 1 ? "" : "S"} GONE QUIET` : "EVERY RELATIONSHIP IS INSIDE THE FOLLOW-UP WINDOW"}
      </span>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        <span className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>ALERT AFTER</span>
        <input type="number" min="1" max="365" className="md-input" style={{ width: 72, padding: "4px 8px", fontSize: 12 }}
          value={data.settings.followUpDays}
          onChange={(e) => updateSettings({ followUpDays: Math.min(365, Math.max(1, Number(e.target.value) || 14)) })} />
        <span className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>DAYS OF SILENCE</span>
      </div>
    </div>
  );
}

function FollowUpPanel({ items, onCreateTask }) {
  if (!items.length) return null;
  return (
    <div style={{ border: "1px solid var(--red)", borderRadius: 12, background: "var(--red-soft)", padding: 16, marginBottom: 22 }}>
      {items.slice(0, 8).map((item) => (
        <div key={`${item.kind}-${item.id}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "1px solid var(--rule)" }}>
          <Avatar name={item.name} size={26} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--bone)" }}>{item.name}</div>
            <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>{item.subtitle}</div>
          </div>
          <Badge label={`last contact ${relativeDays(item.lastContactAt)}`} color="var(--red)" />
          <button className="md-btn md-btn-ghost" style={{ fontSize: 11, border: "1px solid var(--rule)" }}
            onClick={() => onCreateTask(item)}>Add follow-up task</button>
        </div>
      ))}
    </div>
  );
}

export default function EmailsView({ searchQuery, onOpenTab }) {
  const { data, update, remove, add, currentUser, companyName, personName, projectName, showToast } = useStore();
  const [direction, setDirection] = useState("all");
  const [showImport, setShowImport] = useState(false);
  const [showLog, setShowLog] = useState(false);

  const stale = useMemo(() => staleFollowUps(data), [data]);

  const rows = useMemo(() => {
    let list = [...data.emails];
    if (direction !== "all") list = list.filter((e) => (e.direction || "out") === direction);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((e) =>
        (e.subject || "").toLowerCase().includes(q) ||
        (e.from || "").toLowerCase().includes(q) ||
        (e.to || []).join(",").toLowerCase().includes(q));
    }
    return list.sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));
  }, [data.emails, direction, searchQuery]);

  const createFollowUpTask = (item) => {
    add("tasks", makeTask({
      title: `Follow up with ${item.name} — no contact in ${daysSince(item.lastContactAt)} days`,
      personId: item.personId || null,
      companyId: item.companyId || null,
      assigneeIds: currentUser ? [currentUser.id] : [],
      priority: "HIGH",
      source: "follow-up",
    }, currentUser && currentUser.id));
    showToast(`Follow-up task created for ${item.name}.`, "success");
  };

  const columns = [
    { key: "dir", label: "", width: 34, render: (e) => (
      e.direction === "in"
        ? <ArrowDownLeft size={14} color="var(--sage)" title="Received" />
        : <ArrowUpRight size={14} color="var(--accent)" title="Sent" />
    ) },
    { key: "who", label: "PERSON / COMPANY", render: (e) => {
      const label = personName(e.personId) || (e.direction === "in" ? e.from : (e.to || [])[0]) || "—";
      return (
        <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
          <Avatar name={label} size={26} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--bone)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
            <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>{companyName(e.companyId) || "—"}</div>
          </div>
        </div>
      );
    } },
    { key: "subject", label: "SUBJECT", cellStyle: { minWidth: 240, maxWidth: 380 }, stopClick: true, render: (e) => (
      <InlineText value={e.subject} style={{ fontWeight: 600 }} onCommit={(v) => update("emails", e.id, { subject: v })} />
    ) },
    { key: "project", label: "PROJECT", stopClick: true, render: (e) => (
      <InlineSelect value={e.projectId} options={data.projects.map((p) => ({ key: p.id, label: p.title }))} placeholder="—"
        onCommit={(v) => update("emails", e.id, { projectId: v })} />
    ) },
    { key: "account", label: "ACCOUNT", render: (e) => <span className="md-mono" style={{ fontSize: 11, color: "var(--dim)" }}>{e.account || "—"}</span> },
    { key: "status", label: "TRACKING", render: (e) => (
      <Badge label={e.status || "—"} color={e.openCount > 0 ? "var(--sage)" : undefined} subtle={!e.openCount} icon={e.openCount > 0 ? <Eye size={10} /> : null} />
    ) },
    { key: "sent", label: "WHEN", render: (e) => (
      <span className="md-mono" style={{ fontSize: 11, color: "var(--dim)" }} title={new Date(e.sentAt || 0).toString()}>{formatShort(e.sentAt)}</span>
    ) },
    { key: "actions", label: "", stopClick: true, render: (e) => (
      <div style={{ display: "flex", gap: 4 }}>
        <button className="md-btn md-btn-ghost" style={{ padding: "3px 7px", fontSize: 11 }} title="Simulate a tracking-pixel open"
          onClick={() => update("emails", e.id, (cur) => {
            const count = (cur.openCount || 0) + 1;
            return { openCount: count, status: `Opened (${count}x)`, lastOpened: Date.now() };
          })}>
          <Zap size={11} />
        </button>
        <ConfirmButton label="" confirmLabel="Sure?" onConfirm={() => remove("emails", e.id)} />
      </div>
    ) },
  ];

  const counts = {
    in: data.emails.filter((e) => e.direction === "in").length,
    out: data.emails.filter((e) => (e.direction || "out") === "out").length,
  };

  return (
    <div>
      <ViewHeader count={rows.length} label="EMAILS ACROSS ALL CONNECTED ACCOUNTS">
        <button className="md-btn md-btn-ghost" style={{ border: "1px solid var(--rule)" }} onClick={() => setShowLog(true)}>
          <Send size={13} /> Log Email
        </button>
        <button className="md-btn md-btn-primary" onClick={() => setShowImport(true)}><Inbox size={14} /> Sync Gmail</button>
      </ViewHeader>

      <FollowUpControl count={stale.length} />
      <FollowUpPanel items={stale} onCreateTask={createFollowUpTask} />

      <div style={{ marginBottom: 18 }}>
        <FilterChips
          options={[{ key: "in", label: "Received", count: counts.in }, { key: "out", label: "Sent", count: counts.out }]}
          value={direction} onChange={setDirection} allLabel="All Mail"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No email synced yet"
          subtitle="Paste a Gmail thread and Dailie logs the messages, then builds the companies and people behind them."
          action={<button className="md-btn md-btn-primary" onClick={() => setShowImport(true)}><Mail size={14} /> Sync Gmail</button>}
        />
      ) : (
        <DataTable columns={columns} rows={rows} />
      )}

      {showImport && <EmailImportModal onClose={() => setShowImport(false)} />}
      {showLog && <LogEmailModal onClose={() => setShowLog(false)} />}
    </div>
  );
}
