import { useMemo, useRef, useState } from "react";
import { Search, Plus, Mail, CheckCircle2, X, Users, Play } from "lucide-react";
import { useStore } from "../lib/store";
import {
  makeTask, makeParticipant, speakerColor, speakersIn, talkTime, participantNames,
} from "../lib/model";
import { formatShort, formatClock, formatDuration, tsFromDateInput } from "../lib/format";
import { ModalShell, Field, Section, Badge, Avatar, InlineText, InlineSelect, ConfirmButton } from "../ui/kit";

export function mediaSrc(call, kind) {
  if (!call) return "";
  if (kind === "video") return call.videoPath ? `/api/files?path=${encodeURIComponent(call.videoPath)}` : call.videoUrl || "";
  return call.audioPath ? `/api/recording?path=${encodeURIComponent(call.audioPath)}` : call.audioUrl || "";
}

function timecode(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(s / 60);
  const rest = s % 60;
  if (m < 60) return `${m}:${String(rest).padStart(2, "0")}`;
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/** Who spoke and for how long — the bar Attio puts above a call transcript. */
function TalkTimeBar({ call }) {
  const shares = talkTime(call);
  if (shares.length < 1) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", background: "var(--panel-raised)" }}>
        {shares.map((s) => (
          <div key={s.speaker} title={`${s.speaker} — ${Math.round(s.share * 100)}%`}
            style={{ width: `${s.share * 100}%`, background: speakerColor(s.speaker) }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
        {shares.map((s) => (
          <span key={s.speaker} className="md-mono" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, color: "var(--dim)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: speakerColor(s.speaker) }} />
            {s.speaker} {Math.round(s.share * 100)}%
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Speaker-labelled transcript. Clicking a line seeks the recording, and a speaker
 * label can be corrected in place — attribution is inferred, so it has to be editable.
 */
function Transcript({ call, onSeek }) {
  const { update } = useStore();
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState(null);

  const segments = call.segments || [];
  const matches = useMemo(() => {
    if (!query.trim()) return segments;
    const q = query.toLowerCase();
    return segments.filter((s) => (s.text || "").toLowerCase().includes(q) || (s.speaker || "").toLowerCase().includes(q));
  }, [segments, query]);

  // Renaming one speaker relabels every line they said.
  const renameSpeaker = (from, to) => {
    const clean = to.trim();
    if (!clean || clean === from) { setRenaming(null); return; }
    update("calls", call.id, (c) => ({
      segments: (c.segments || []).map((s) => (s.speaker === from ? { ...s, speaker: clean } : s)),
    }));
    setRenaming(null);
  };

  const reassign = (index, speaker) => {
    update("calls", call.id, (c) => ({
      segments: (c.segments || []).map((s, i) => (i === index ? { ...s, speaker } : s)),
    }));
  };

  if (!segments.length) {
    return (
      <div>
        <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 8 }}>
          No timed transcript for this call. The raw text is below and can be edited.
        </div>
        <InlineText value={call.transcript} multiline placeholder="No transcript."
          style={{ fontSize: 13, lineHeight: 1.65, color: "var(--dim)" }}
          onCommit={(v) => update("calls", call.id, { transcript: v })} />
      </div>
    );
  }

  const speakers = speakersIn(call);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 200px" }}>
          <Search size={13} color="var(--dim)" style={{ position: "absolute", left: 11, top: 10 }} />
          <input className="md-input" style={{ paddingLeft: 32, fontSize: 12 }} placeholder="Search the transcript…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <span className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>
          {query ? `${matches.length} of ${segments.length}` : `${segments.length} lines`}
        </span>
      </div>

      {speakers.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {speakers.map((sp) => (
            renaming === sp ? (
              <input key={sp} autoFocus className="md-input" defaultValue={sp} style={{ width: 150, fontSize: 12, padding: "4px 8px" }}
                onBlur={(e) => renameSpeaker(sp, e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") renameSpeaker(sp, e.target.value); if (e.key === "Escape") setRenaming(null); }} />
            ) : (
              <button key={sp} className="md-btn md-btn-ghost" onClick={() => setRenaming(sp)}
                title="Rename this speaker everywhere in the transcript"
                style={{ fontSize: 11, padding: "3px 9px", border: `1px solid ${speakerColor(sp)}`, color: speakerColor(sp) }}>
                {sp}
              </button>
            )
          ))}
        </div>
      )}

      <div className="md-scroll" style={{ maxHeight: 380, overflowY: "auto", paddingRight: 6 }}>
        {matches.map((seg) => {
          const index = segments.indexOf(seg);
          const color = speakerColor(seg.speaker);
          return (
            <div key={index} style={{ display: "flex", gap: 10, padding: "8px 0", borderBottom: "1px solid var(--rule)" }}>
              <button className="md-btn md-btn-ghost md-mono" onClick={() => onSeek(seg.start)}
                title="Jump to this moment"
                style={{ padding: "1px 5px", fontSize: 10, color: "var(--accent)", flexShrink: 0, alignSelf: "flex-start" }}>
                {timecode(seg.start)}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: color, flexShrink: 0 }} />
                  <select value={seg.speaker || ""} onChange={(e) => reassign(index, e.target.value)}
                    title="Who said this"
                    style={{
                      background: "transparent", border: "none", color, font: "inherit", fontSize: 11,
                      fontWeight: 700, fontFamily: "var(--font-mono)", cursor: "pointer", padding: 0,
                    }}>
                    <option value="">Unattributed</option>
                    {[...new Set([...speakers, ...participantNames(call)])].map((sp) => (
                      <option key={sp} value={sp}>{sp}</option>
                    ))}
                  </select>
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--bone)" }}>{seg.text}</div>
              </div>
            </div>
          );
        })}
        {matches.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--dim)", padding: "20px 0", textAlign: "center" }}>Nothing matches “{query}”.</div>
        )}
      </div>

      <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 10, lineHeight: 1.5 }}>
        Speaker labels are inferred from the conversation, not from separate audio channels.
        Correct one from the dropdown, or rename a speaker above to change every line at once.
      </div>
    </div>
  );
}

function ParticipantsPanel({ call }) {
  const { data, update } = useStore();
  const [draft, setDraft] = useState("");

  const known = [
    ...data.people.map((p) => ({ label: p.name, email: p.email, personId: p.id })),
    ...data.team.map((m) => ({ label: m.name, email: m.email, teamMemberId: m.id })),
    ...(data.talent || []).map((t) => ({ label: t.name, email: t.email })),
  ];

  const add = () => {
    const raw = draft.trim();
    if (!raw) return;
    const hit = known.find((k) => k.label.toLowerCase() === raw.toLowerCase());
    update("calls", call.id, (c) => ({
      participants: [...(c.participants || []), makeParticipant({
        name: hit ? hit.label : (raw.includes("@") ? raw.split("@")[0] : raw),
        email: hit ? hit.email || "" : (raw.includes("@") ? raw.toLowerCase() : ""),
        personId: hit ? hit.personId || null : null,
        teamMemberId: hit ? hit.teamMemberId || null : null,
      })],
    }));
    setDraft("");
  };

  const remove = (id) => update("calls", call.id, (c) => ({
    participants: (c.participants || []).filter((p) => p.id !== id),
  }));

  const list = call.participants || [];

  return (
    <div>
      {list.length === 0 && <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 10 }}>No one recorded on this call yet.</div>}
      {list.map((p) => {
        const person = data.people.find((x) => x.id === p.personId);
        const company = person ? data.companies.find((c) => c.id === person.companyId) : null;
        return (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--rule)" }}>
            <Avatar name={p.name || p.email} size={28} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--bone)" }}>{p.name || p.email}</div>
              <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {[p.email, company && company.name].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
            {p.teamMemberId && <Badge label="TEAM" color="var(--accent)" />}
            {person && <Badge label="IN CRM" color="var(--sage)" />}
            <button className="md-btn md-btn-ghost" style={{ padding: 4 }} onClick={() => remove(p.id)}><X size={12} /></button>
          </div>
        );
      })}
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        <input className="md-input" list="dailie-call-detail-people" value={draft}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="Add a participant…" />
        <button className="md-btn" onClick={add}><Plus size={13} /></button>
      </div>
      <datalist id="dailie-call-detail-people">
        {known.map((k, i) => <option key={`${k.label}-${i}`} value={k.label} />)}
      </datalist>
    </div>
  );
}

export default function CallDetail({ call, onClose, onOpenEmail }) {
  const { data, update, remove, add, currentUser, showToast } = useStore();
  const [tab, setTab] = useState("transcript");
  const mediaRef = useRef(null);

  const video = mediaSrc(call, "video");
  const audio = mediaSrc(call, "audio");
  const linkedTasks = data.tasks.filter((t) => t.callId === call.id);

  const seek = (seconds) => {
    const el = mediaRef.current;
    if (!el) return;
    el.currentTime = Math.max(0, seconds - 0.4);
    el.play().catch(() => { /* autoplay blocked — the position still moved */ });
  };

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

  const tabs = [
    ["transcript", `Transcript${(call.segments || []).length ? ` · ${(call.segments || []).length}` : ""}`],
    ["summary", "Summary & next steps"],
    ["people", `Participants · ${(call.participants || []).length}`],
  ];

  return (
    <ModalShell
      wide
      title={call.title}
      subtitle={`${formatShort(call.startedAt)} · ${formatClock(call.startedAt)} · ${formatDuration(call.durationSec)}`}
      onClose={onClose}
    >
      {video ? (
        <video ref={mediaRef} controls src={video} style={{ width: "100%", maxHeight: 340, borderRadius: 10, background: "#000", marginBottom: 14 }} />
      ) : audio ? (
        <audio ref={mediaRef} controls src={audio} style={{ width: "100%", height: 38, marginBottom: 14 }} />
      ) : (
        <div style={{ padding: 14, border: "1px dashed var(--rule-bright)", borderRadius: 10, marginBottom: 14, fontSize: 12, color: "var(--dim)" }}>
          No recording is stored for this call — only the transcript below.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        {(call.participants || []).slice(0, 6).map((p) => (
          <span key={p.id} title={p.email || p.name} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--bone)" }}>
            <Avatar name={p.name || p.email} size={22} />{p.name || p.email}
          </span>
        ))}
        {(call.participants || []).length > 6 && (
          <span className="md-mono" style={{ fontSize: 11, color: "var(--dim)" }}>+{(call.participants || []).length - 6}</span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          {video && <Badge label="VIDEO KEPT" color="var(--info)" />}
          {call.emailSent && <Badge label="FOLLOW-UP SENT" color="var(--sage)" icon={<CheckCircle2 size={10} />} />}
        </div>
      </div>

      <TalkTimeBar call={call} />

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {tabs.map(([key, label]) => (
          <div key={key} className={"md-chip" + (tab === key ? " active" : "")} role="button" tabIndex={0}
            onClick={() => setTab(key)} onKeyDown={(e) => { if (e.key === "Enter") setTab(key); }}>{label}</div>
        ))}
      </div>

      {tab === "transcript" && <Transcript call={call} onSeek={seek} />}

      {tab === "people" && <ParticipantsPanel call={call} />}

      {tab === "summary" && (
        <div>
          <Field label="AI SUMMARY">
            <InlineText value={call.summary} multiline placeholder="No summary was generated."
              style={{ fontSize: 14, lineHeight: 1.6 }} onCommit={(v) => update("calls", call.id, { summary: v })} />
          </Field>

          <Section title={`NEXT STEPS · ${(call.nextSteps || []).length}`}>
            {(call.nextSteps || []).length === 0 && (
              <div style={{ fontSize: 12, color: "var(--dim)" }}>No action items were committed to on this call.</div>
            )}
            {(call.nextSteps || []).map((s, i) => {
              const tracked = linkedTasks.some((t) => t.title === s.text);
              return (
                <div key={s.id || i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13 }}>
                  <span style={{ flex: 1 }}>
                    {s.text}
                    {s.owner && <span className="md-mono" style={{ color: "var(--dim)", fontSize: 11 }}> — {s.owner}</span>}
                    {s.dueDate && <span className="md-mono" style={{ color: "var(--dim)", fontSize: 11 }}> · due {s.dueDate}</span>}
                  </span>
                  {tracked
                    ? <Badge label="TASK CREATED" color="var(--sage)" />
                    : <button className="md-btn md-btn-ghost" style={{ fontSize: 11, border: "1px solid var(--rule)" }} onClick={() => flagAsTask(s)}>
                        <Plus size={11} /> Flag as task
                      </button>}
                </div>
              );
            })}
          </Section>

          <Field label="LINKED PROJECT">
            <InlineSelect value={call.projectId} options={data.projects.map((p) => ({ key: p.id, label: p.title }))} placeholder="No project"
              onCommit={(v) => update("calls", call.id, { projectId: v })} />
          </Field>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", borderTop: "1px solid var(--rule)", paddingTop: 14, marginTop: 20 }}>
        <button className="md-btn md-btn-primary" onClick={() => onOpenEmail(call)}>
          <Mail size={13} /> {call.emailSent ? "Send another follow-up" : "Draft follow-up email"}
        </button>
        <span style={{ marginLeft: "auto" }}>
          <ConfirmButton label="Delete call" confirmLabel="Yes, delete" onConfirm={() => { remove("calls", call.id); onClose(); }} />
        </span>
      </div>
    </ModalShell>
  );
}
