import { useMemo, useState } from "react";
import { Mic, Video, FileText, Sparkles, Send, CheckCircle2, Clock, Plus, Mail } from "lucide-react";
import { useStore } from "../lib/store";
import { makeTask } from "../lib/model";
import { formatShort, formatClock, formatDuration, relativeDays, uid, parseEmailList, tsFromDateInput } from "../lib/format";
import { fileSrc } from "../lib/files";
import { ViewHeader, EmptyState, Badge, Section, ModalShell, Field, ConfirmButton, InlineText, InlineSelect } from "../ui/kit";

function mediaSrc(call, kind) {
  if (!call) return "";
  if (kind === "video") return call.videoPath ? `/api/files?path=${encodeURIComponent(call.videoPath)}` : call.videoUrl || "";
  return call.audioPath ? `/api/recording?path=${encodeURIComponent(call.audioPath)}` : call.audioUrl || "";
}

/**
 * Drafts the follow-up email from the call's summary and next steps, shows it for
 * approval, and only then sends. Nothing leaves the app without an explicit approval.
 */
export function FollowUpEmailModal({ call, onClose }) {
  const { data, add, update, currentUser, showToast } = useStore();
  const project = data.projects.find((p) => p.id === call.projectId);

  const suggestedRecipients = useMemo(() => {
    const fromParticipants = parseEmailList(call.participants || "").map((p) => p.email);
    if (fromParticipants.length) return fromParticipants.join(", ");
    const linkedPeople = data.people.filter((p) => (p.projectIds || []).includes(call.projectId)).map((p) => p.email).filter(Boolean);
    return linkedPeople.join(", ");
  }, [call, data.people]);

  const [to, setTo] = useState(suggestedRecipients);
  const [subject, setSubject] = useState(call.emailDraft ? call.emailDraft.subject : "");
  const [body, setBody] = useState(call.emailDraft ? call.emailDraft.body : "");
  const [state, setState] = useState(call.emailDraft ? "drafted" : "idle");
  const [error, setError] = useState("");

  const draft = async () => {
    setState("drafting");
    setError("");
    try {
      const res = await fetch("/api/draft-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callTitle: call.title,
          summary: call.summary,
          nextSteps: call.nextSteps || [],
          recipients: parseEmailList(to).map((r) => r.email),
          sender: currentUser ? currentUser.name : "",
          project: project ? project.title : "",
        }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || `Drafting failed (${res.status}).`);
      }
      const payload = await res.json();
      setSubject(payload.subject || "");
      setBody(payload.body || "");
      setState("drafted");
      update("calls", call.id, { emailDraft: { subject: payload.subject, body: payload.body, draftedAt: Date.now() } });
    } catch (err) {
      setState("idle");
      setError(err.message || "Could not draft the email.");
    }
  };

  const logEmail = (sentVia) => {
    const recipients = parseEmailList(to).map((r) => r.email);
    const account = (data.settings.emailAccounts[0] || {}).address || (currentUser && currentUser.email) || "";
    const first = recipients[0];
    const person = data.people.find((p) => (p.email || "").toLowerCase() === first);
    add("emails", {
      direction: "out",
      account,
      from: account,
      to: recipients,
      subject,
      body,
      snippet: body.slice(0, 180),
      sentAt: Date.now(),
      status: sentVia === "provider" ? "Sent" : "Sent via mail client",
      openCount: 0,
      lastOpened: null,
      personId: person ? person.id : null,
      companyId: person ? person.companyId : null,
      projectId: call.projectId || null,
      callId: call.id,
    });
    update("calls", call.id, { emailSent: true, emailSentAt: Date.now() });
  };

  const approveAndSend = async () => {
    const recipients = parseEmailList(to).map((r) => r.email);
    if (!recipients.length) { setError("Add at least one recipient."); return; }
    if (!subject.trim() || !body.trim()) { setError("The email needs a subject and a body."); return; }

    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: recipients, subject, body, replyTo: currentUser && currentUser.email }),
      });
      if (res.ok) {
        logEmail("provider");
        showToast(`Follow-up sent to ${recipients.join(", ")}.`, "success");
        onClose();
        return;
      }
      const payload = await res.json().catch(() => ({}));
      // No provider connected — hand the approved draft to the user's own mail client.
      if (res.status === 501 || res.status === 404) {
        const mailto = `mailto:${encodeURIComponent(recipients.join(","))}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(mailto, "_blank");
        logEmail("mailto");
        showToast("No email provider is connected — the draft opened in your mail client and was logged.", "info");
        onClose();
        return;
      }
      throw new Error(payload.error || `Sending failed (${res.status}).`);
    } catch (err) {
      setState("drafted");
      setError(err.message || "Could not send the email.");
    }
  };

  return (
    <ModalShell wide title="Follow-Up Email" subtitle={call.title} onClose={onClose}>
      <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 16, lineHeight: 1.55 }}>
        Drafted from the call summary and the next steps agreed on the call. Nothing is sent until you approve it.
      </div>

      <Field label="TO"><input className="md-input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@company.com, second@company.com" /></Field>

      {(call.nextSteps || []).length > 0 && (
        <div style={{ padding: 12, background: "var(--panel-raised)", border: "1px solid var(--rule)", borderRadius: 8, marginBottom: 16 }}>
          <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", marginBottom: 8 }}>NEXT STEPS GOING INTO THE DRAFT</div>
          {(call.nextSteps || []).map((s) => (
            <div key={s.id || s.text} style={{ fontSize: 12, color: "var(--bone)", padding: "2px 0" }}>
              • {s.text}{s.owner ? ` — ${s.owner}` : ""}{s.dueDate ? ` (due ${s.dueDate})` : ""}
            </div>
          ))}
        </div>
      )}

      <button className="md-btn" style={{ width: "100%", justifyContent: "center", marginBottom: 16 }} onClick={draft} disabled={state === "drafting" || state === "sending"}>
        <Sparkles size={14} /> {state === "drafting" ? "Drafting…" : state === "drafted" ? "Re-draft with AI" : "Draft with AI"}
      </button>

      <Field label="SUBJECT"><input className="md-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line" /></Field>
      <Field label="MESSAGE" hint="Edit anything before approving — this is exactly what will be sent.">
        <textarea className="md-textarea" rows={11} value={body} onChange={(e) => setBody(e.target.value)} placeholder="The drafted message appears here." />
      </Field>

      {error && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 12 }}>{error}</div>}

      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center", opacity: subject.trim() && body.trim() ? 1 : 0.5 }}
        onClick={approveAndSend} disabled={state === "sending" || !subject.trim() || !body.trim()}>
        <Send size={14} /> {state === "sending" ? "Sending…" : "Approve & Send"}
      </button>
    </ModalShell>
  );
}

function CallCard({ call, onOpenEmail }) {
  const { data, update, remove, add, currentUser, projectName, memberName, showToast } = useStore();
  const [showTranscript, setShowTranscript] = useState(false);
  const video = mediaSrc(call, "video");
  const audio = mediaSrc(call, "audio");
  const linkedTasks = data.tasks.filter((t) => t.callId === call.id);

  const flagAsTask = (step) => {
    add("tasks", makeTask({
      title: step.text,
      dueDate: step.dueDate ? tsFromDateInput(step.dueDate) : null,
      projectId: call.projectId || null,
      callId: call.id,
      source: "call",
      priority: "HIGH",
      assigneeIds: currentUser ? [currentUser.id] : [],
    }, currentUser && currentUser.id));
    showToast("Next step flagged as a task.", "success");
  };

  return (
    <div className="md-card" style={{ padding: 18, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: "1 1 240px" }}>
          <div className="md-mono" style={{ fontSize: 11, color: "var(--accent)", marginBottom: 4, fontWeight: 600 }}>
            {formatShort(call.startedAt)} · {formatClock(call.startedAt)} · {formatDuration(call.durationSec)}
          </div>
          <InlineText value={call.title} style={{ fontSize: 16, fontWeight: 700 }} onCommit={(v) => update("calls", call.id, { title: v })} />
          {call.participants && <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 4 }}>{call.participants}</div>}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {video && <Badge label="VIDEO" color="#8aa4c4" icon={<Video size={10} />} />}
          {call.emailSent && <Badge label="FOLLOW-UP SENT" color="var(--sage)" icon={<CheckCircle2 size={10} />} />}
          <InlineSelect value={call.projectId} options={data.projects.map((p) => ({ key: p.id, label: p.title }))} placeholder="Link project"
            onCommit={(v) => update("calls", call.id, { projectId: v })} />
        </div>
      </div>

      {video ? (
        <video controls src={video} style={{ width: "100%", maxHeight: 320, borderRadius: 8, background: "#000", marginBottom: 14 }} />
      ) : audio ? (
        <audio controls src={audio} style={{ width: "100%", maxWidth: 380, height: 34, marginBottom: 14 }} />
      ) : null}

      {call.summary && (
        <div style={{ marginBottom: 14 }}>
          <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", marginBottom: 6 }}>AI SUMMARY</div>
          <InlineText value={call.summary} multiline style={{ fontSize: 14, lineHeight: 1.55 }} onCommit={(v) => update("calls", call.id, { summary: v })} />
        </div>
      )}

      {(call.nextSteps || []).length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", marginBottom: 8 }}>
            SUGGESTED NEXT STEPS · {(call.nextSteps || []).length}
          </div>
          {(call.nextSteps || []).map((s, i) => {
            const tracked = linkedTasks.some((t) => t.title === s.text);
            return (
              <div key={s.id || i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", fontSize: 13 }}>
                <span style={{ flex: 1, color: "var(--bone)" }}>
                  {s.text}
                  {s.owner && <span className="md-mono" style={{ color: "var(--dim)", fontSize: 11 }}> — {s.owner}</span>}
                  {s.dueDate && <span className="md-mono" style={{ color: "var(--dim)", fontSize: 11 }}> · due {s.dueDate}</span>}
                </span>
                {tracked ? (
                  <Badge label="TASK CREATED" color="var(--sage)" />
                ) : (
                  <button className="md-btn md-btn-ghost" style={{ fontSize: 11, border: "1px solid var(--rule)" }} onClick={() => flagAsTask(s)}>
                    <Plus size={11} /> Flag as task
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid var(--rule)", paddingTop: 12 }}>
        <button className="md-btn md-btn-primary" onClick={() => onOpenEmail(call)}>
          <Mail size={13} /> {call.emailSent ? "Send another follow-up" : "Draft follow-up email"}
        </button>
        {call.transcript && (
          <button className="md-btn md-btn-ghost" style={{ border: "1px solid var(--rule)" }} onClick={() => setShowTranscript((s) => !s)}>
            <FileText size={13} /> {showTranscript ? "Hide transcript" : "Transcript"}
          </button>
        )}
        <span style={{ marginLeft: "auto" }}>
          <ConfirmButton label="Delete call" confirmLabel="Yes, delete" onConfirm={() => remove("calls", call.id)} />
        </span>
      </div>

      {showTranscript && (
        <div className="md-scroll" style={{ marginTop: 12, maxHeight: 260, overflowY: "auto", padding: 12, background: "var(--panel-raised)", border: "1px solid var(--rule)", borderRadius: 8, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", color: "var(--dim)" }}>
          {call.transcript}
        </div>
      )}
    </div>
  );
}

export default function CallsView({ searchQuery, onStartRecording }) {
  const { data, updateSettings } = useStore();
  const [emailCall, setEmailCall] = useState(null);

  const calls = useMemo(() => {
    let list = [...data.calls].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((c) =>
        (c.title || "").toLowerCase().includes(q) ||
        (c.summary || "").toLowerCase().includes(q) ||
        (c.transcript || "").toLowerCase().includes(q));
    }
    return list;
  }, [data.calls, searchQuery]);

  const upcoming = useMemo(() => {
    const soon = Date.now() + 60 * 60 * 1000;
    return data.meetings
      .filter((m) => m.meetingLink && m.date > Date.now() - 30 * 60 * 1000 && m.date < soon)
      .sort((a, b) => a.date - b.date);
  }, [data.meetings]);

  return (
    <div>
      <ViewHeader count={calls.length} label="RECORDED CALLS">
        <label style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: "var(--dim)", cursor: "pointer" }}>
          <input type="checkbox" checked={!!data.settings.autoArmRecording} onChange={(e) => updateSettings({ autoArmRecording: e.target.checked })} />
          Auto-prompt when a call starts
        </label>
        <button className="md-btn md-btn-primary" style={{ background: "var(--red)", borderColor: "var(--red)", color: "#fff" }} onClick={() => onStartRecording(null)}>
          <Mic size={14} /> Record a Call
        </button>
      </ViewHeader>

      {upcoming.length > 0 && (
        <Section title="STARTING NOW">
          {upcoming.map((m) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, border: "1px solid var(--accent)", borderRadius: 10, marginBottom: 8, background: "var(--panel-raised)", flexWrap: "wrap" }}>
              <Clock size={15} color="var(--accent)" />
              <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{m.title}</div>
                <div className="md-mono" style={{ fontSize: 11, color: "var(--dim)" }}>{formatClock(m.date)} · {/zoom\.us/i.test(m.meetingLink) ? "Zoom" : "Google Meet"}</div>
              </div>
              <a className="md-btn md-btn-ghost" href={m.meetingLink} target="_blank" rel="noreferrer" style={{ textDecoration: "none", border: "1px solid var(--rule)" }}>Join</a>
              <button className="md-btn md-btn-primary" style={{ background: "var(--red)", borderColor: "var(--red)", color: "#fff" }} onClick={() => onStartRecording(m)}>
                <Video size={13} /> Record
              </button>
            </div>
          ))}
        </Section>
      )}

      {calls.length === 0 ? (
        <EmptyState
          title="No calls recorded yet"
          subtitle="Record a Zoom or Meet call from its browser tab and Dailie captures the video, transcribes it, summarises it and turns the agreed next steps into tasks."
          action={
            <button className="md-btn md-btn-primary" style={{ background: "var(--red)", borderColor: "var(--red)", color: "#fff" }} onClick={() => onStartRecording(null)}>
              <Mic size={14} /> Record a Call
            </button>
          }
        />
      ) : (
        calls.map((c) => <CallCard key={c.id} call={c} onOpenEmail={setEmailCall} />)
      )}

      {emailCall && <FollowUpEmailModal call={data.calls.find((c) => c.id === emailCall.id) || emailCall} onClose={() => setEmailCall(null)} />}
    </div>
  );
}
