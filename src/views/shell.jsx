import { useState, useEffect, useRef, useMemo } from "react";
import {
  Bell, X, Search, Command, Sparkles, SendHorizontal, AlertTriangle, CheckCircle2,
  Mail, FileText, Receipt, Video, Info, Clock, UserPlus, Clapperboard, CheckSquare,
} from "lucide-react";
import { useStore } from "../lib/store";
import { staleFollowUps, alertsFor, recordTypeInfo, makeTask, isBusyOn, ndaFor, unreadFor, isRepresentationKind } from "../lib/model";
import { formatShort, formatClock, relativeDays, daysSince, formatMoney } from "../lib/format";
import { ModalShell, Badge, Avatar, EmptyState, Section } from "../ui/kit";
import { safeHref } from "../lib/safeUrl";

export function DailieBrandLogo({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0, display: "block" }}>
      <rect x="3" y="11" width="30" height="22" rx="5" fill="var(--panel-raised)" stroke="var(--accent)" strokeWidth="2" />
      <path d="M3 12C3 9.79086 4.79086 8 7 8H29C31.2091 8 33 9.79086 33 12V15H3V12Z" fill="var(--accent)" />
      <path d="M8 8L12 15" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M16 8L20 15" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M24 8L28 15" stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="10" cy="22" r="2" fill="var(--bone)" />
      <circle cx="18" cy="22" r="2" fill="var(--bone)" />
      <circle cx="26" cy="22" r="2" fill="var(--bone)" />
      <line x1="8" y1="27" x2="28" y2="27" stroke="var(--rule-bright)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function Toast({ toast }) {
  if (!toast) return null;
  const color = toast.tone === "success" ? "var(--sage)" : toast.tone === "error" ? "var(--red)" : "var(--accent)";
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 90,
      background: "var(--panel-raised)", border: `1px solid ${color}`, borderRadius: 100,
      padding: "11px 20px", boxShadow: "var(--shadow-lg)", display: "flex", alignItems: "center", gap: 9,
      fontSize: 13, color: "var(--bone)", maxWidth: "90vw",
    }}>
      <CheckCircle2 size={15} color={color} />
      {toast.message}
    </div>
  );
}

/**
 * Everything that has gone quiet or needs signing / paying, in one place. The badge
 * count is what tells you a relationship has been left too long.
 */
export function NotificationCenter({ onOpenTab }) {
  const { data, add, update, currentUser, showToast, memberName } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const stale = useMemo(() => staleFollowUps(data), [data]);
  const alerts = useMemo(() => alertsFor(data), [data]);
  const overdueTasks = useMemo(
    () => data.tasks.filter((t) => t.status !== "done" && t.dueDate && t.dueDate < Date.now()),
    [data.tasks]
  );
  const mine = useMemo(
    () => unreadFor(data, currentUser && currentUser.id),
    [data.notifications, currentUser]
  );
  const total = stale.length + alerts.length + overdueTasks.length + mine.length;

  const markRead = (n) => update("notifications", n.id, { readAt: Date.now() });

  const openNotice = (n) => {
    markRead(n);
    onOpenTab(n.recordType === "project" ? "projects" : "tasks");
    setOpen(false);
  };

  const wording = (n) => {
    const who = memberName(n.actorId);
    const what = n.recordType === "project"
      ? (n.role === "owner" ? "made you an owner of" : "added you to")
      : "assigned you";
    return `${who || "Someone"} ${what}`;
  };

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const createFollowUpTask = (item) => {
    add("tasks", makeTask({
      title: `Follow up with ${item.name} — quiet for ${daysSince(item.lastContactAt)} days`,
      personId: item.personId || null,
      companyId: item.companyId || null,
      assigneeIds: currentUser ? [currentUser.id] : [],
      priority: "HIGH",
      source: "follow-up",
    }, currentUser && currentUser.id));
    showToast(`Follow-up task created for ${item.name}.`, "success");
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="md-btn md-btn-ghost" onClick={() => setOpen((o) => !o)} title="Notifications" style={{ padding: 8, position: "relative" }}>
        <Bell size={15} color={total ? "var(--red)" : "var(--dim)"} />
        {total > 0 && (
          <span className="md-mono" style={{
            position: "absolute", top: 1, right: 1, minWidth: 15, height: 15, borderRadius: 100,
            background: "var(--red)", color: "#fff", fontSize: 9, fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px",
          }}>{total > 99 ? "99+" : total}</span>
        )}
      </button>

      {open && (
        <div className="md-scroll" style={{
          position: "absolute", right: 0, top: "calc(100% + 6px)", width: 370, maxHeight: 460, overflowY: "auto",
          background: "var(--panel)", border: "1px solid var(--rule-bright)", borderRadius: 12,
          boxShadow: "var(--shadow-lg)", zIndex: 60, padding: 14,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div className="md-display" style={{ fontSize: 15 }}>Notifications</div>
            <button className="md-btn md-btn-ghost" style={{ padding: 4 }} onClick={() => setOpen(false)}><X size={14} /></button>
          </div>

          {total === 0 && (
            <div style={{ fontSize: 13, color: "var(--dim)", padding: "20px 0", textAlign: "center" }}>
              Nothing needs chasing. Everything is current.
            </div>
          )}

          {mine.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div className="md-mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: ".12em", fontWeight: 700 }}>
                  FOR YOU
                </div>
                <button className="md-btn md-btn-ghost" style={{ fontSize: 10, padding: "2px 6px" }}
                  onClick={() => mine.forEach(markRead)}>Mark all read</button>
              </div>
              {mine.slice(0, 8).map((n) => (
                <div key={n.id} role="button" tabIndex={0}
                  onClick={() => openNotice(n)}
                  onKeyDown={(e) => { if (e.key === "Enter") openNotice(n); }}
                  style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", borderBottom: "1px solid var(--rule)", cursor: "pointer" }}>
                  {n.recordType === "project"
                    ? <Clapperboard size={13} color="var(--accent)" />
                    : <CheckSquare size={13} color="var(--accent)" />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {wording(n)} <strong>{n.title || "(untitled)"}</strong>
                    </div>
                    <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>{relativeDays(n.createdAt)}</div>
                  </div>
                  <button className="md-btn md-btn-ghost" style={{ fontSize: 10, padding: "2px 6px" }}
                    onClick={(e) => { e.stopPropagation(); markRead(n); }} title="Mark read">
                    <CheckCircle2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {stale.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div className="md-mono" style={{ fontSize: 10, color: "var(--red)", letterSpacing: ".12em", marginBottom: 8, fontWeight: 700 }}>
                NO CONTACT IN {data.settings.followUpDays}+ DAYS
              </div>
              {stale.slice(0, 6).map((item) => (
                <div key={`${item.kind}-${item.id}`} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", borderBottom: "1px solid var(--rule)" }}>
                  <Avatar name={item.name} size={24} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                    <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>last contact {relativeDays(item.lastContactAt)}</div>
                  </div>
                  <button className="md-btn md-btn-ghost" style={{ fontSize: 10, border: "1px solid var(--rule)", padding: "3px 7px" }}
                    onClick={() => createFollowUpTask(item)}>Task</button>
                </div>
              ))}
            </div>
          )}

          {overdueTasks.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div className="md-mono" style={{ fontSize: 10, color: "var(--warn)", letterSpacing: ".12em", marginBottom: 8, fontWeight: 700 }}>OVERDUE TASKS</div>
              {overdueTasks.slice(0, 5).map((t) => (
                <div key={t.id} role="button" tabIndex={0}
                  onClick={() => { onOpenTab("tasks"); setOpen(false); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { onOpenTab("tasks"); setOpen(false); } }}
                  style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", borderBottom: "1px solid var(--rule)", cursor: "pointer" }}>
                  <Clock size={13} color="var(--warn)" />
                  <div style={{ flex: 1, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                  <span className="md-mono" style={{ fontSize: 10, color: "var(--red)" }}>{formatShort(t.dueDate)}</span>
                </div>
              ))}
            </div>
          )}

          {alerts.length > 0 && (
            <div>
              <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".12em", marginBottom: 8, fontWeight: 700 }}>PAPERWORK & MONEY</div>
              {alerts.slice(0, 8).map((a) => (
                <div key={a.id} role="button" tabIndex={0}
                  onClick={() => { onOpenTab(a.tab); setOpen(false); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { onOpenTab(a.tab); setOpen(false); } }}
                  style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", borderBottom: "1px solid var(--rule)", cursor: "pointer" }}>
                  {a.kind === "contract" ? <FileText size={13} color="var(--warn)" /> : <Receipt size={13} color={a.severity === "high" ? "var(--red)" : "var(--warn)"} />}
                  <div style={{ flex: 1, fontSize: 12 }}>{a.text}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Banner that appears when a calendar call with a join link is starting right now. */
export function LiveCallBanner({ onRecord, onDismiss, meeting }) {
  if (!meeting) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 32px", flexWrap: "wrap",
      background: "var(--red-soft)", borderBottom: "1px solid var(--red)",
    }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--red)", flexShrink: 0 }} />
      <div style={{ flex: "1 1 200px", minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--bone)" }}>
          {meeting.title} is starting — {formatClock(meeting.date)}
        </div>
        <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>
          Recording needs one click: browsers will not start a screen capture on their own.
        </div>
      </div>
      {safeHref(meeting.meetingLink) && (
        <a className="md-btn md-btn-ghost" href={safeHref(meeting.meetingLink)} target="_blank" rel="noreferrer" style={{ textDecoration: "none", border: "1px solid var(--rule)", fontSize: 12 }}>Join</a>
      )}
      <button className="md-btn md-btn-primary" style={{ background: "var(--red)", borderColor: "var(--red)", color: "#fff" }} onClick={() => onRecord(meeting)}>
        <Video size={13} /> Record this call
      </button>
      <button className="md-btn md-btn-ghost" style={{ padding: 6 }} onClick={onDismiss}><X size={14} /></button>
    </div>
  );
}

export function CommandPalette({ onClose, onSelect }) {
  const { data, companyName } = useStore();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.toLowerCase().trim();
    const out = [];
    const push = (type, id, label, sub, item, badge) => out.push({ type, id, label, sub, item, badge: badge || type });
    const hit = (...fields) => q && fields.some((f) => String(f || "").toLowerCase().includes(q));

    data.projects.forEach((p) => { if (!q || hit(p.title, p.contactName, p.contactEmail, p.contactPhone, p.driveUrl, p.externalUrl)) push("project", p.id, p.title, recordTypeInfo(p.recordType).short, p); });
    data.people.forEach((p) => { if (q && (p.name.toLowerCase().includes(q) || (p.email || "").includes(q))) push("people", p.id, p.name, p.organization || p.email, p); });
    data.companies.forEach((c) => { if (q && hit(c.name, c.domain, c.contactName, c.contactEmail, c.contactPhone)) push("companies", c.id, c.name, c.contactName || c.domain, c); });
    data.tasks.forEach((t) => { if (q && t.title.toLowerCase().includes(q)) push("tasks", t.id, t.title, "Task", t); });
    (data.events || []).forEach((e) => { if (q && (e.name || "").toLowerCase().includes(q)) push("events", e.id, e.name, e.venue || "Event", e); });
    (data.press || []).forEach((r) => { if (q && ((r.title || "").toLowerCase().includes(q) || (r.outlet || "").toLowerCase().includes(q))) push("press", r.id, r.title, r.outlet || "Press", r); });
    (data.slate || []).forEach((s) => { if (q && hit(s.title, s.logline, s.synopsis, s.notes)) push("slate", s.id, s.title || "Pitch package", "Slate", s); });
    (data.social || []).forEach((s) => { if (q && hit(s.title, s.copy, s.venue, s.notes)) push("social", s.id, s.title || "Social", s.kind === "event" ? "Social event" : "Social post", s); });
    (data.legal || []).forEach((l) => {
      if (q && ((l.name || "").toLowerCase().includes(q) || (l.firm || "").toLowerCase().includes(q))) {
        const tab = isRepresentationKind(l.kind) ? "representation" : "legal";
        push(tab, l.id, l.name, l.firm || (tab === "representation" ? "Representation" : "Legal"), l);
      }
    });

    // These live on tabs whose key differs from the collection name, so the tab key is
    // what goes in `type` and the badge is set separately.
    data.meetings.forEach((m) => { if (hit(m.title)) push("meetings", m.id, m.title, "Meeting", m); });
    (data.calls || []).forEach((c) => { if (hit(c.title)) push("calls", c.id, c.title, "Call", c); });
    data.emails.forEach((e) => { if (hit(e.subject, e.from, e.fromName)) push("emails", e.id, e.subject || "(no subject)", e.from || "Email", e); });
    data.contracts.forEach((c) => { if (hit(c.title)) push("contracts", c.id, c.title, companyName(c.companyId) || "Agreement", c); });
    (data.invoices || []).forEach((i) => { if (hit(i.number, i.notes)) push("finance", i.id, i.number || "Invoice", companyName(i.companyId) || "Invoice", i, "invoice"); });
    (data.talent || []).forEach((t) => { if (hit(t.name, t.discipline, ...(t.disciplines || []))) push("team", t.id, t.name, t.discipline || "Roster", t, "roster"); });
    (data.notes || []).forEach((n) => { if (hit(n.title, n.body)) push("tasks", n.id, n.title || "Note", "Note", n, "note"); });

    const tabs = [
      ["home", "Home dashboard"], ["projects", "Projects"], ["slate", "Slate"], ["tasks", "Tasks & Notes"], ["calendar", "Calendar"],
      ["meetings", "Meetings"], ["calls", "Calls"], ["events", "Events & Speaking"], ["emails", "Emails"], ["companies", "Companies"],
      ["people", "People"], ["team", "Team & Roster"], ["vendors", "Vendors"], ["aitools", "AI Tools"],
      ["press", "Press & PR"], ["social", "Social calendar"], ["contracts", "NDAs & Contracts"],
      ["representation", "Representation"], ["legal", "Legal & Counsel"],
      ["finance", "Invoices & Payments"], ["timeline", "Timeline"],
    ];
    tabs.forEach(([key, label]) => { if (!q || label.toLowerCase().includes(q)) push("tab", key, `Go to ${label}`, "Navigation", null); });

    return out.slice(0, 12);
  }, [query, data, companyName]);

  return (
    <div className="md-overlay" onClick={onClose} style={{ alignItems: "flex-start", paddingTop: "12vh" }}>
      <div className="md-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--rule)" }}>
          <Search size={16} color="var(--dim)" />
          <input autoFocus className="md-input" style={{ border: "none", background: "transparent", padding: 0, fontSize: 15 }}
            placeholder="Search projects, people, tasks, meetings, mail, agreements…" value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && results[0]) onSelect(results[0]);
            }} />
          <span className="md-mono" style={{ fontSize: 10, color: "var(--dim-2)" }}>ESC</span>
        </div>
        <div className="md-scroll" style={{ maxHeight: 380, overflowY: "auto", padding: 8 }}>
          {results.length === 0 && <div style={{ padding: 20, textAlign: "center", fontSize: 13, color: "var(--dim)" }}>Nothing found.</div>}
          {results.map((r) => (
            <div key={`${r.type}-${r.id}`} role="button" tabIndex={0}
              onClick={() => onSelect(r)} onKeyDown={(e) => { if (e.key === "Enter") onSelect(r); }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 8, cursor: "pointer" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--panel-raised)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--bone)" }}>{r.label}</div>
                {r.sub && <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>{r.sub}</div>}
              </div>
              <Badge label={String(r.badge || r.type).toUpperCase()} subtle />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Reads the board and answers questions about it — no network call, no invention. */
export function AIAssistantDrawer({ isOpen, onClose }) {
  const { data, memberName, companyName } = useStore();
  const [messages, setMessages] = useState([{
    sender: "ai",
    text: "I can read the whole board. Ask me for a slate report, open tasks by person, what has gone quiet, unsigned paperwork, or money owed.",
  }]);
  const [input, setInput] = useState("");
  const endRef = useRef(null);

  useEffect(() => { if (isOpen) endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isOpen]);

  const answer = (prompt) => {
    const p = prompt.toLowerCase();

    if (/quiet|follow.?up|stale|chase/.test(p)) {
      const stale = staleFollowUps(data);
      if (!stale.length) return "Nothing has gone quiet — every relationship with email traffic is inside your follow-up window.";
      return `**${stale.length} relationship${stale.length === 1 ? "" : "s"} need chasing:**\n\n` +
        stale.slice(0, 10).map((s) => `• **${s.name}** — last contact ${relativeDays(s.lastContactAt)}`).join("\n");
    }

    if (/task|to.?do|action/.test(p)) {
      const open = data.tasks.filter((t) => t.status !== "done");
      const byPerson = data.team.map((m) => ({ name: m.name, count: open.filter((t) => (t.assigneeIds || []).includes(m.id)).length }));
      const overdue = open.filter((t) => t.dueDate && t.dueDate < Date.now());
      return `**${open.length} open task${open.length === 1 ? "" : "s"}** (${overdue.length} overdue)\n\n` +
        byPerson.map((b) => `• ${b.name}: ${b.count}`).join("\n") +
        (overdue.length ? `\n\n**Overdue:**\n${overdue.slice(0, 6).map((t) => `• ${t.title} — was due ${formatShort(t.dueDate)}`).join("\n")}` : "");
    }

    if (/nda|contract|sign|paperwork/.test(p)) {
      const unsigned = data.contracts.filter((c) => c.status !== "signed" && c.status !== "expired");
      const ndas = data.contracts.filter((c) => c.kind === "nda");
      return `**Paperwork**\n\n• NDAs on file: ${ndas.length} (${ndas.filter((c) => c.status === "signed").length} signed)\n` +
        `• Agreements awaiting signature: ${unsigned.length}\n` +
        (unsigned.length ? `\n${unsigned.slice(0, 8).map((c) => `• ${c.title} — ${companyName(c.companyId) || "no counterparty"}`).join("\n")}` : "");
    }

    if (/invoice|money|paid|payment|owe/.test(p)) {
      const receivable = data.invoices.filter((i) => i.direction === "incoming" && i.status !== "paid").reduce((s, i) => s + (i.amount || 0), 0);
      const payable = data.invoices.filter((i) => i.direction === "outgoing" && i.status !== "paid").reduce((s, i) => s + (i.amount || 0), 0);
      const vendorDue = data.payments.filter((x) => x.status !== "paid").reduce((s, x) => s + (x.amount || 0), 0);
      const overdue = data.invoices.filter((i) => i.status !== "paid" && i.dueAt && i.dueAt < Date.now());
      return `**Money**\n\n• Receivable outstanding: ${formatMoney(receivable)}\n• Payable outstanding: ${formatMoney(payable)}\n` +
        `• Vendor payments due: ${formatMoney(vendorDue)}\n• Overdue invoices: ${overdue.length}`;
    }

    if (/roster|crew|artist|talent|available|capacity|book/.test(p)) {
      const roster = data.talent || [];
      const free = roster.filter((t) => !isBusyOn(t, Date.now()));
      const noNda = roster.filter((t) => !ndaFor(data, t));
      return `**Roster: ${roster.length}**\n\n` +
        `• Signed: ${roster.filter((t) => t.status === "signed").length}\n` +
        `• Free today: ${free.length}${free.length ? ` — ${free.slice(0, 6).map((t) => t.name).join(", ")}` : ""}\n` +
        `• No NDA on file: ${noNda.length}${noNda.length ? ` — ${noNda.slice(0, 6).map((t) => t.name).join(", ")}` : ""}`;
    }

    if (/company|companies|vendor|client|relationship/.test(p)) {
      const byType = {};
      data.companies.forEach((c) => { byType[c.type] = (byType[c.type] || 0) + 1; });
      return `**${data.companies.length} companies on the board**\n\n` +
        Object.entries(byType).map(([k, v]) => `• ${k}: ${v}`).join("\n");
    }

    if (/report|slate|summary|overview/.test(p)) {
      const open = data.tasks.filter((t) => t.status !== "done").length;
      const byType = {};
      data.projects.forEach((x) => { byType[x.recordType] = (byType[x.recordType] || 0) + 1; });
      return `**Slate report**\n\n` +
        `• Projects: ${data.projects.length} (${Object.entries(byType).map(([k, v]) => `${recordTypeInfo(k).short} ${v}`).join(", ")})\n` +
        `• Open tasks: ${open}\n• Calls recorded: ${data.calls.length}\n• People: ${data.people.length} · Companies: ${data.companies.length}\n` +
        `• Relationships gone quiet: ${staleFollowUps(data).length}`;
    }

    return `You have **${data.projects.length} projects**, **${data.tasks.filter((t) => t.status !== "done").length} open tasks**, ` +
      `**${data.companies.length} companies** and **${data.calls.length} recorded calls**. ` +
      `Try: "slate report", "open tasks", "what has gone quiet", "unsigned NDAs", or "who owes us money".`;
  };

  const send = () => {
    const prompt = input.trim();
    if (!prompt) return;
    setMessages((m) => [...m, { sender: "user", text: prompt }]);
    setInput("");
    setTimeout(() => setMessages((m) => [...m, { sender: "ai", text: answer(prompt) }]), 220);
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: "fixed", bottom: 24, right: 24, width: 380, maxWidth: "calc(100vw - 32px)", height: 520, maxHeight: "80vh",
      background: "var(--panel)", border: "1px solid var(--rule-bright)", borderRadius: 16, boxShadow: "var(--shadow-lg)",
      display: "flex", flexDirection: "column", zIndex: 70,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "14px 16px", borderBottom: "1px solid var(--rule)" }}>
        <Sparkles size={16} color="var(--accent)" />
        <div className="md-display" style={{ flex: 1, fontSize: 15 }}>Studio Assistant</div>
        <button className="md-btn md-btn-ghost" style={{ padding: 5 }} onClick={onClose}><X size={15} /></button>
      </div>
      <div className="md-scroll" style={{ flex: 1, overflowY: "auto", padding: 14 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: 12, display: "flex", justifyContent: m.sender === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "86%", padding: "9px 13px", borderRadius: 12, fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap",
              background: m.sender === "user" ? "var(--accent)" : "var(--panel-raised)",
              color: m.sender === "user" ? "var(--ink)" : "var(--bone)",
              border: m.sender === "user" ? "none" : "1px solid var(--rule)",
            }}>
              {m.text.split("**").map((part, idx) => (idx % 2 ? <strong key={idx}>{part}</strong> : part))}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid var(--rule)" }}>
        <input className="md-input" placeholder="Ask about the board…" value={input}
          onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") send(); }} />
        <button className="md-btn md-btn-primary" style={{ padding: "8px 12px" }} onClick={send}><SendHorizontal size={15} /></button>
      </div>
    </div>
  );
}

export function InfoModal({ onClose }) {
  const items = [
    ["Home", "Every person's task list side by side, your projects, and the meetings coming out of Google Calendar."],
    ["Projects", "Service Production, Original IP, Outside IP, Training / Consultancy, Events Production and Keynote / Presentation on one board — each with its own editable pipeline. Add start, delivery, a Google Drive folder, an external link, and any extra dates (wrap, premiere, a pitch) so they show on the calendar. Everything on a project is editable in place: owner, team, image, next step, custom fields."],
    ["Slate", "Pitch packages for each project: title, log line, synopsis, deck, trailer, and notes on option or life rights, so anyone can send a package out."],
    ["Social", "Posts and public dates on one calendar — Instagram, TikTok, a premiere, a live — so the week ahead is not a thread of DMs."],
    ["Events", "Keynotes, panels, hosting and pitches. Click a row to open the full event — date, venue, who's speaking, the linked project."],
    ["Tasks & Notes", "Shared, assignable tasks and notes. Call and meeting action items land here automatically."],
    ["Calls", "Record a Zoom or Meet tab with video, get a transcript, a summary, and suggested next steps that become tasks. Then draft a follow-up email and approve it before it sends."],
    ["Emails", "Paste from any Gmail account. Dailie logs the messages and flags relationships that have gone quiet."],
    ["Companies & People", "Built from your mail traffic. Label each company a Client, Vendor, Platform or AI Tool and filter on it."],
    ["NDAs & Contracts", "Who you have signed with, what is still open, with the documents attached."],
    ["Representation", "Agents, managers and business affairs — who represents the roster, separate from counsel."],
    ["Invoices & Payments", "What clients owe, what vendors billed, and what you still have to pay out."],
  ];
  return (
    <ModalShell wide title="How Dailie Works" onClose={onClose}>
      <div className="md-scroll" style={{ display: "grid", gap: 12, maxHeight: "60vh", overflowY: "auto", paddingRight: 4 }}>
        {items.map(([title, body]) => (
          <div key={title} style={{ padding: 13, background: "var(--panel-raised)", borderRadius: 8, border: "1px solid var(--rule)" }}>
            <div style={{ color: "var(--bone)", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>{title}</div>
            <div style={{ fontSize: 12, color: "var(--dim)", lineHeight: 1.55 }}>{body}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 18, textAlign: "right" }}>
        <button className="md-btn md-btn-primary" onClick={onClose}>Got it</button>
      </div>
    </ModalShell>
  );
}
