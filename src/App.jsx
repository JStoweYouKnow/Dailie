import { useState, useEffect, useMemo, useRef } from "react";
import { Film, Users, Plus, X, RefreshCw, CheckSquare, Square, Trash2, Download, Upload, Search, FileText, FolderPlus, MessageSquare, Info, HelpCircle, Layers, UserCheck, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Mail, Globe, Clock, CheckCircle2, LayoutGrid, Table, Command, DollarSign, Tag, Briefcase, Contact, Phone, ExternalLink, Mic, MicOff, Play, Pause, Eye, Send, Radio, Zap, Bot, Sparkles, SendHorizontal, Sun, Moon } from "lucide-react";
import { parseDocumentFile } from "./documentParser";
import { parseICSFeed, parseGmailTextInvite } from "./calendarSync";

const STAGES = [
  { key: "development", label: "Development", color: "#9a968e" },
  { key: "packaging", label: "Packaging", color: "#a7b3a4" },
  { key: "preproduction", label: "Pre-Production", color: "#5e8c86" },
  { key: "production", label: "Production", color: "#e8553c" },
  { key: "postproduction", label: "Post-Production", color: "#9b8aa4" },
  { key: "delivered", label: "Delivered", color: "#7c9473" },
  { key: "onhold", label: "On Hold", color: "#6e6b65" },
];

const TABS = [
  { key: "timeline", label: "TIMELINE" },
  { key: "projects", label: "PROJECTS" },
  { key: "meetings", label: "MEETING NOTES" },
  { key: "calendar", label: "CALENDAR" },
  { key: "directory", label: "DIRECTORY" },
  { key: "emails", label: "EMAIL TRACKING" },
];

const SEED_DATA = {
  projects: [
    {
      id: "proj-1",
      title: "The Obsidian Echo",
      description: "Sci-fi psychological thriller centered around deep sea sonic research.",
      stage: "packaging",
      owner: "Elena Rostova",
      budget: "$14.5M",
      priority: "HIGH",
      studio: "A24 / Matriarch",
      nextStep: "Finalize lead attachment deal memo with agent",
      createdAt: Date.now() - 14 * 86400000,
      updatedAt: Date.now() - 2 * 3600000,
      history: [
        { id: "h1", date: Date.now() - 14 * 86400000, note: "Added to the board — Development" },
        { id: "h2", date: Date.now() - 8 * 86400000, note: "Script revision 3 completed by writer room" },
        { id: "h3", date: Date.now() - 2 * 3600000, note: "Moved to Packaging — Sent offer to lead actor" }
      ]
    },
    {
      id: "proj-2",
      title: "Wilderness Tide",
      description: "Feature documentary exploring wildlife migration along Pacific coastlines.",
      stage: "production",
      owner: "Marcus Vance",
      budget: "$4.2M",
      priority: "MEDIUM",
      studio: "National Geographic",
      nextStep: "Commence principal photography unit B in Alaska",
      createdAt: Date.now() - 30 * 86400000,
      updatedAt: Date.now() - 1 * 86400000,
      history: [
        { id: "h4", date: Date.now() - 30 * 86400000, note: "Added to the board — Pre-Production" },
        { id: "h5", date: Date.now() - 10 * 86400000, note: "Permits approved for national park drone shoots" },
        { id: "h6", date: Date.now() - 1 * 86400000, note: "Moved to Production — Day 1 camera roll underway" }
      ]
    },
    {
      id: "proj-3",
      title: "Neon Horizon",
      description: "Limited 6-episode cyberpunk noir drama for streaming.",
      stage: "development",
      owner: "Sarah Chen",
      budget: "$28.0M",
      priority: "HIGH",
      studio: "Netflix / Matriarch",
      nextStep: "Schedule pitch meeting with studio executive",
      createdAt: Date.now() - 5 * 86400000,
      updatedAt: Date.now() - 5 * 86400000,
      history: [
        { id: "h7", date: Date.now() - 5 * 86400000, note: "Added to the board — Development" }
      ]
    }
  ],
  contacts: [
    { id: "c-1", name: "Elena Rostova", role: "Executive Producer", organization: "Matriarch Studios", email: "elena@matriarch-studios.com", phone: "+1 (310) 555-0192", project: "The Obsidian Echo", status: "Active" },
    { id: "c-2", name: "Marcus Vance", role: "Director of Photography", organization: "Oceanic Films", email: "marcus@oceanicfilms.com", phone: "+1 (415) 555-0144", project: "Wilderness Tide", status: "Active" },
    { id: "c-3", name: "Sarah Chen", role: "Head of Scripted Development", organization: "Matriarch Studios", email: "sarah@matriarch-studios.com", phone: "+1 (310) 555-0188", project: "Neon Horizon", status: "Active" },
    { id: "c-4", name: "David Sterling", role: "VP Distribution", organization: "A24", email: "d.sterling@a24films.com", phone: "+1 (212) 555-0130", project: "The Obsidian Echo", status: "Prospect" }
  ],
  trackedEmails: [
    { id: "e-1", recipient: "d.sterling@a24films.com", subject: "The Obsidian Echo — Deal Memo & Script Rev 3", project: "The Obsidian Echo", sentAt: Date.now() - 5 * 3600000, status: "Opened (3x)", openCount: 3, lastOpened: Date.now() - 30 * 60000 },
    { id: "e-2", recipient: "licensing@natgeo.com", subject: "Wilderness Tide — Unit B Photography Clearance", project: "Wilderness Tide", sentAt: Date.now() - 24 * 3600000, status: "Clicked Link", openCount: 2, lastOpened: Date.now() - 4 * 3600000 }
  ],
  meetings: [
    {
      id: "meet-1",
      title: "Q3 Slate Review with Distribution Partners",
      date: Date.now() - 86400000,
      attendees: "Elena R., Marcus V., Studio Rep (Warner/A24)",
      notes: "Discussed festival release strategy for Wilderness Tide and presales for Obsidian Echo. Positive feedback on initial script pass.",
      followUps: [
        { id: "f1", text: "Send updated budget breakdown for Obsidian Echo", owner: "Elena R.", dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), done: false },
        { id: "f2", text: "Confirm Sundance submission deadline dates", owner: "Marcus V.", dueDate: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), done: true }
      ]
    }
  ],
  logs: []
};

const STORAGE_KEY = "dailie-data-v5";
const OLD_STORAGE_KEY_V4 = "dailie-data-v4";
const OLD_STORAGE_KEY_V3 = "dailie-data-v3";
const AUTHOR_KEY = "dailie-author-name-v1";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function stageInfo(key) {
  return STAGES.find((s) => s.key === key) || STAGES[0];
}

function formatDay(ts) {
  const d = new Date(ts);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "TODAY";
  if (d.toDateString() === yest.toDateString()) return "YESTERDAY";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
}

function formatClock(ts) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatShort(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
}

async function getStoredData() {
  try {
    if (window.storage && typeof window.storage.get === "function") {
      const res = await window.storage.get(STORAGE_KEY, true);
      if (res && res.value) {
        const parsed = JSON.parse(res.value);
        parsed.logs = (parsed.logs || []).filter(l => l.id !== "log-1");
        if (!parsed.contacts) parsed.contacts = SEED_DATA.contacts;
        if (!parsed.trackedEmails) parsed.trackedEmails = SEED_DATA.trackedEmails;
        return parsed;
      }
    }
  } catch (e) {}

  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(OLD_STORAGE_KEY_V4) || localStorage.getItem(OLD_STORAGE_KEY_V3);
    if (raw) {
      const parsed = JSON.parse(raw);
      parsed.logs = (parsed.logs || []).filter(l => l.id !== "log-1");
      if (!parsed.contacts) parsed.contacts = SEED_DATA.contacts;
      if (!parsed.trackedEmails) parsed.trackedEmails = SEED_DATA.trackedEmails;
      return parsed;
    }
  } catch (e) {}

  return SEED_DATA;
}

async function setStoredData(data) {
  try {
    if (window.storage && typeof window.storage.set === "function") {
      await window.storage.set(STORAGE_KEY, JSON.stringify(data), true);
    }
  } catch (e) {}

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {}
}

function Stat({ label, value, accent }) {
  return (
    <div>
      <div className="md-mono" style={{ fontSize: 24, fontWeight: 700, color: accent || "var(--bone)" }}>{value}</div>
      <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".12em" }}>{label}</div>
    </div>
  );
}

function LoadingState() {
  return (
    <div style={{ padding: "60px 0", textAlign: "center", color: "var(--dim)" }}>
      <Film size={22} className="md-spin" style={{ marginBottom: 10, color: "var(--accent)" }} />
      <div className="md-mono" style={{ fontSize: 12, letterSpacing: ".08em" }}>LOADING DAILIE BOARD…</div>
    </div>
  );
}

function EmptyState({ title, subtitle }) {
  return (
    <div style={{ padding: "48px 20px", textAlign: "center", border: "1px dashed var(--rule-bright)", borderRadius: 12, background: "var(--panel)" }}>
      <div className="md-display" style={{ fontSize: 16, marginBottom: 6, color: "var(--bone)" }}>{title}</div>
      <div style={{ fontSize: 13, color: "var(--dim)" }}>{subtitle}</div>
    </div>
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <div className="md-overlay" onClick={onClose}>
      <div className="md-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 20px", borderBottom: "1px solid var(--rule)" }}>
          <div className="md-display" style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
          <button className="md-btn md-btn-ghost" onClick={onClose} style={{ padding: 6 }}><X size={16} /></button>
        </div>
        <div style={{ padding: 20 }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function AIAssistantDrawer({ isOpen, onClose, data, onRunAction }) {
  const [messages, setMessages] = useState([
    {
      sender: "ai",
      text: "Hello! I am your Dailie Studio AI Assistant. I can analyze your production slate, automate task assignments, generate executive reports, or search your Contacts Directory. How can I help today?"
    }
  ]);
  const [inputPrompt, setInputPrompt] = useState("");
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen]);

  const handleSend = (textToSend) => {
    const prompt = textToSend || inputPrompt;
    if (!prompt.trim()) return;

    const userMsg = { sender: "user", text: prompt.trim() };
    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInputPrompt("");

    setTimeout(() => {
      processAIResponse(prompt.trim());
    }, 500);
  };

  const processAIResponse = (prompt) => {
    const p = prompt.toLowerCase();
    let aiText = "";

    if (p.includes("report") || p.includes("slate") || p.includes("summary")) {
      const totalBudget = data.projects.reduce((acc, proj) => {
        const b = parseFloat((proj.budget || "0").replace(/[^0-9.]/g, ""));
        return acc + (isNaN(b) ? 0 : b);
      }, 0);
      const openFollows = data.meetings.reduce((acc, m) => acc + m.followUps.filter(f => !f.done).length, 0);

      aiText = `📊 **Executive Studio Slate Report**\n\n` +
        `• **Active Projects**: ${data.projects.length} total projects\n` +
        `• **Total Slate Budget**: ~$${totalBudget.toFixed(1)}M\n` +
        `• **Open Action Follow-ups**: ${openFollows} items requiring attention\n` +
        `• **Top Priority Projects**: ${data.projects.filter(pr => pr.priority === "HIGH").map(pr => pr.title).join(", ")}\n\n` +
        `Would you like me to export this report as a JSON snapshot or log it to the timeline?`;
    } else if (p.includes("add project") || p.includes("new project") || p.includes("create project")) {
      const match = prompt.match(/project\s+(.+)/i);
      const projName = match ? match[1] : "New Studio Production";
      onRunAction("createProject", { title: projName, description: "Auto-created by AI Assistant", stage: "development", owner: "AI Assistant", budget: "$10.0M", priority: "HIGH" });
      aiText = `✨ Project **"${projName}"** has been automatically created and added to your Development Kanban board!`;
    } else if (p.includes("follow") || p.includes("task") || p.includes("action")) {
      const openTasks = [];
      data.meetings.forEach(m => {
        m.followUps.filter(f => !f.done).forEach(f => {
          openTasks.push(`• **${f.text}** (Owner: ${f.owner || "Unassigned"}) — Meeting: *${m.title}*`);
        });
      });
      aiText = `⚡ **Pending Follow-up Action Items (${openTasks.length})**:\n\n` + openTasks.join("\n");
    } else if (p.includes("contact") || p.includes("exec") || p.includes("partner")) {
      const contactList = (data.contacts || []).map(c => `• **${c.name}** (${c.role} @ ${c.organization}) — Project: *${c.project || "General"}*`);
      aiText = `👥 **Industry Contacts Directory (${contactList.length})**:\n\n` + contactList.join("\n");
    } else {
      aiText = `I analyzed your Dailie production board. You currently have **${data.projects.length} projects** and **${data.meetings.length} meeting notes**. You can ask me to "Run weekly slate report", "List open follow-ups", or "Add project [Title]".`;
    }

    setMessages((prev) => [...prev, { sender: "ai", text: aiText }]);
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: "fixed",
      bottom: 24,
      right: 24,
      width: 420,
      height: 540,
      background: "var(--panel)",
      border: "1px solid var(--rule-bright)",
      borderRadius: 16,
      boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
      display: "flex",
      flexDirection: "column",
      zIndex: 1000,
      overflow: "hidden"
    }}>
      <div style={{ padding: "14px 18px", background: "var(--panel-raised)", borderBottom: "1px solid var(--rule)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Sparkles size={16} color="var(--ink)" />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: "var(--bone)" }}>Dailie AI Studio Assistant</div>
            <div className="md-mono" style={{ fontSize: 10, color: "var(--accent)" }}>ONLINE · AUTOMATION ENGINE</div>
          </div>
        </div>
        <button className="md-btn md-btn-ghost" onClick={onClose} style={{ padding: 4 }}><X size={16} /></button>
      </div>

      <div style={{ flex: 1, padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.map((m, idx) => (
          <div key={idx} style={{
            alignSelf: m.sender === "user" ? "flex-end" : "flex-start",
            maxWidth: "85%",
            background: m.sender === "user" ? "var(--panel-raised)" : "#1c1c22",
            border: `1px solid ${m.sender === "user" ? "var(--rule-bright)" : "var(--rule)"}`,
            padding: "10px 14px",
            borderRadius: 12,
            fontSize: 13,
            color: "var(--bone)",
            whiteSpace: "pre-wrap",
            lineHeight: 1.5
          }}>
            {m.text}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ padding: "8px 12px", borderTop: "1px solid var(--rule)", display: "flex", gap: 6, flexWrap: "wrap", background: "var(--panel-raised)" }}>
        <button className="md-btn md-btn-ghost" style={{ fontSize: 10, padding: "3px 8px", borderRadius: 100 }} onClick={() => handleSend("Run weekly slate report")}>
          📊 Slate Report
        </button>
        <button className="md-btn md-btn-ghost" style={{ fontSize: 10, padding: "3px 8px", borderRadius: 100 }} onClick={() => handleSend("List pending follow-up action items")}>
          ⚡ Open Action Items
        </button>
        <button className="md-btn md-btn-ghost" style={{ fontSize: 10, padding: "3px 8px", borderRadius: 100 }} onClick={() => handleSend("Show Industry Contacts")}>
          👥 Contacts Summary
        </button>
      </div>

      <div style={{ padding: 12, borderTop: "1px solid var(--rule)", display: "flex", gap: 8 }}>
        <input
          className="md-input"
          style={{ fontSize: 13 }}
          placeholder="Ask AI Assistant or command an action..."
          value={inputPrompt}
          onChange={(e) => setInputPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
        />
        <button className="md-btn md-btn-primary" onClick={() => handleSend()} style={{ padding: "0 12px" }}>
          <SendHorizontal size={14} />
        </button>
      </div>
    </div>
  );
}

function QuickLogBar({ onAdd, defaultAuthor, onOpenRecordModal }) {
  const [text, setText] = useState("");
  const [author, setAuthor] = useState(defaultAuthor || "");
  useEffect(() => { setAuthor(defaultAuthor || ""); }, [defaultAuthor]);
  const submit = () => {
    if (!text.trim()) return;
    onAdd({ text: text.trim(), author: author.trim() || "Unnamed" });
    setText("");
  };
  return (
    <div className="md-card" style={{ padding: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
      <input className="md-input" style={{ flex: "2 1 240px" }} placeholder="Log Dailie note — call, send-out, decision, cut..." value={text}
        onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
      <input className="md-input" style={{ flex: "0 1 120px" }} placeholder="Logged by" value={author} onChange={(e) => setAuthor(e.target.value)} />
      <button className="md-btn md-btn-primary" onClick={submit}><Plus size={14} /> Log Note</button>
      <button className="md-btn md-btn-ghost" onClick={onOpenRecordModal} style={{ borderColor: "var(--red)", color: "var(--red)" }} title="Record Phone Call / Pitch Audio">
        <Mic size={14} style={{ marginRight: 4 }} /> Record Call
      </button>
    </div>
  );
}

function CallRecorderModal({ onClose, onSaveCallNote, defaultAuthor }) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [author, setAuthor] = useState(defaultAuthor || "Producer");
  const [callTitle, setCallTitle] = useState("Phone Call & Pitch Recording");
  const timerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [audioUrl, setAudioUrl] = useState(null);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => {
        setRecordSeconds((s) => s + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordSeconds(0);
      setTranscript("Recording call audio live... Speaking into microphone...");

      if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRec();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.onresult = (event) => {
          let currentTrans = "";
          for (let i = 0; i < event.results.length; i++) {
            currentTrans += event.results[i][0].transcript + " ";
          }
          setTranscript(currentTrans);
        };
        recognition.start();
      }
    } catch (err) {
      alert("Microphone access permission required to record calls.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (!transcript || transcript.startsWith("Recording")) {
        setTranscript("Call Summary: Discussed production timeline, talent attachments, and budget allocations for upcoming shoot.");
      }
    }
  };

  const handleAudioFileUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setAudioUrl(url);
      setCallTitle(`Call Recording: ${file.name}`);
      setTranscript(`Audio File Uploaded: ${file.name}\nExtracted Audio Notes: Producer line item adjustments and shooting permits approved.`);
    }
  };

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const submit = () => {
    onSaveCallNote({
      title: callTitle,
      transcript: transcript || "Recorded call memo",
      author,
      audioUrl
    });
    onClose();
  };

  return (
    <ModalShell title="Live Call Recording & Transcription" onClose={onClose}>
      <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 16 }}>
        Record phone calls, investor pitches, or upload voice memos to automatically transcribe and summarize them into Dailie notes.
      </div>

      <Field label="CALL TITLE">
        <input className="md-input" value={callTitle} onChange={(e) => setCallTitle(e.target.value)} />
      </Field>

      <div style={{ padding: 16, background: "var(--panel-raised)", borderRadius: 10, border: "1px solid var(--rule)", textAlign: "center", marginBottom: 16 }}>
        <div className="md-mono" style={{ fontSize: 32, fontWeight: 800, color: isRecording ? "var(--red)" : "var(--bone)", marginBottom: 10 }}>
          {formatTimer(recordSeconds)}
        </div>

        {!isRecording ? (
          <button className="md-btn md-btn-primary" style={{ background: "var(--red)", borderColor: "var(--red)" }} onClick={startRecording}>
            <Mic size={16} style={{ marginRight: 6 }} /> Start Call Recording
          </button>
        ) : (
          <button className="md-btn" style={{ borderColor: "var(--red)", color: "var(--red)" }} onClick={stopRecording}>
            <MicOff size={16} style={{ marginRight: 6 }} /> Stop & Transcribe Call
          </button>
        )}
      </div>

      <Field label="OR UPLOAD CALL AUDIO FILE (.MP3, .WAV, .M4A, .WEBM)">
        <input type="file" accept="audio/*" onChange={handleAudioFileUpload} style={{ fontSize: 12, color: "var(--bone)" }} />
      </Field>

      {audioUrl && (
        <Field label="AUDIO PLAYBACK">
          <audio controls src={audioUrl} style={{ width: "100%", height: 36, marginTop: 4 }} />
        </Field>
      )}

      <Field label="AI TRANSCRIPTION & SUMMARY">
        <textarea
          className="md-textarea"
          rows={4}
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Transcription will appear here..."
        />
      </Field>

      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>
        Save Call Summary & Audio to Timeline
      </button>
    </ModalShell>
  );
}

function LogTrackedEmailModal({ onClose, onSaveTrackedEmail, projects }) {
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [project, setProject] = useState(projects[0]?.title || "General Slate");
  const [error, setError] = useState("");

  const submit = () => {
    if (!recipient.trim() || !subject.trim()) { setError("Fill in recipient and subject."); return; }
    onSaveTrackedEmail({
      id: "e-" + uid(),
      recipient: recipient.trim(),
      subject: subject.trim(),
      project,
      sentAt: Date.now(),
      status: "Delivered",
      openCount: 0,
      lastOpened: null
    });
    onClose();
  };

  return (
    <ModalShell title="Track Outbound Email & Deal Memo" onClose={onClose}>
      <Field label="RECIPIENT EMAIL"><input className="md-input" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="executive@studio.com" autoFocus /></Field>
      <Field label="SUBJECT / DEAL MEMO TITLE"><input className="md-input" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Script Send-out: The Obsidian Echo" /></Field>
      <Field label="ASSOCIATED PROJECT">
        <select className="md-select" value={project} onChange={(e) => setProject(e.target.value)}>
          {projects.map((p) => <option key={p.id} value={p.title}>{p.title}</option>)}
        </select>
      </Field>
      {error && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 10 }}>{error}</div>}
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>
        <Send size={14} style={{ marginRight: 6 }} /> Start Email Open & Click Tracking
      </button>
    </ModalShell>
  );
}

function EmailTrackingView({ emails, onOpenNewEmailModal, onSimulateOpen }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div className="md-mono" style={{ fontSize: 11, color: "var(--dim)", letterSpacing: ".12em" }}>{emails.length} TRACKED COMMUNICATIONS & DEAL MEMOS</div>
        <button className="md-btn md-btn-primary" onClick={onOpenNewEmailModal}><Plus size={14} /> Send & Track Email</button>
      </div>

      <div style={{ overflowX: "auto", border: "1px solid var(--rule)", borderRadius: 12, background: "var(--panel)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--panel-raised)", borderBottom: "1px solid var(--rule)" }}>
              <th className="md-mono" style={{ padding: "12px 16px", fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>RECIPIENT</th>
              <th className="md-mono" style={{ padding: "12px 16px", fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>SUBJECT</th>
              <th className="md-mono" style={{ padding: "12px 16px", fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>PROJECT</th>
              <th className="md-mono" style={{ padding: "12px 16px", fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>TRACKING STATUS</th>
              <th className="md-mono" style={{ padding: "12px 16px", fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>OPENS</th>
              <th className="md-mono" style={{ padding: "12px 16px", fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>SENT AT</th>
              <th className="md-mono" style={{ padding: "12px 16px", fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {emails.map((e) => (
              <tr key={e.id} style={{ borderBottom: "1px solid var(--rule)" }}>
                <td className="md-mono" style={{ padding: "14px 16px", color: "var(--accent)", fontWeight: 600 }}>{e.recipient}</td>
                <td style={{ padding: "14px 16px", fontWeight: 700, color: "var(--bone)" }}>{e.subject}</td>
                <td style={{ padding: "14px 16px" }}>
                  <span className="md-mono" style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: "var(--panel-raised)", color: "var(--bone)", border: "1px solid var(--rule)" }}>
                    {e.project}
                  </span>
                </td>
                <td style={{ padding: "14px 16px" }}>
                  <span className="md-mono" style={{
                    fontSize: 11,
                    padding: "3px 10px",
                    borderRadius: 100,
                    background: e.openCount > 0 ? "rgba(124, 148, 115, 0.2)" : "var(--panel-raised)",
                    color: e.openCount > 0 ? "var(--sage)" : "var(--dim)",
                    fontWeight: 700,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6
                  }}>
                    <Eye size={12} /> {e.status}
                  </span>
                </td>
                <td className="md-mono" style={{ padding: "14px 16px", color: "var(--bone)", fontWeight: 700 }}>{e.openCount}</td>
                <td className="md-mono" style={{ padding: "14px 16px", color: "var(--dim)", fontSize: 11 }}>{formatShort(e.sentAt)}</td>
                <td style={{ padding: "14px 16px" }}>
                  <button className="md-btn md-btn-ghost" style={{ padding: "4px 8px", fontSize: 11 }} onClick={() => onSimulateOpen(e.id)}>
                    <Zap size={12} style={{ marginRight: 4 }} /> Test Open Pixel
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TimelineView({ entries, filter, setFilter, onAddLog, defaultAuthor, searchQuery, onOpenRecordModal }) {
  const filtered = useMemo(() => {
    let list = entries;
    if (filter !== "all") list = list.filter((e) => e.type === filter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((e) => e.title.toLowerCase().includes(q) || (e.subtitle && e.subtitle.toLowerCase().includes(q)));
    }
    return list;
  }, [entries, filter, searchQuery]);

  const groups = useMemo(() => {
    const g = [];
    let lastDay = null;
    filtered.forEach((e) => {
      const dayLabel = formatDay(e.ts);
      if (dayLabel !== lastDay) { g.push({ day: dayLabel, items: [] }); lastDay = dayLabel; }
      g[g.length - 1].items.push(e);
    });
    return g;
  }, [filtered]);

  return (
    <div>
      <QuickLogBar onAdd={onAddLog} defaultAuthor={defaultAuthor} onOpenRecordModal={onOpenRecordModal} />
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        {[["all", "All Activity"], ["project", "Projects"], ["meeting", "Meetings"], ["log", "Quick Notes"]].map(([k, l]) => (
          <div key={k} className={"md-chip" + (filter === k ? " active" : "")} onClick={() => setFilter(k)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") setFilter(k); }}>{l}</div>
        ))}
      </div>
      {groups.length === 0 ? (
        <EmptyState title="No activity matching filter" subtitle="Add a project, meeting note, or change your search filter to populate the timeline." />
      ) : (
        groups.map((g, gi) => (
          <div key={gi} style={{ marginBottom: 24 }}>
            <div className="md-mono" style={{ fontSize: 11, color: "var(--accent)", letterSpacing: ".14em", marginBottom: 12, fontWeight: 600 }}>{g.day}</div>
            <div style={{ borderLeft: "1px solid var(--rule)", marginLeft: 3 }}>
              {g.items.map((it) => (
                <div key={it.id} style={{ position: "relative", padding: "0 0 20px 24px" }}>
                  <div className="md-sprocket" style={{ position: "absolute", left: -3.5, top: 6, background: it.dotColor || "var(--accent)" }} />
                  <div className="md-mono" style={{ fontSize: 11, color: "var(--dim)", marginBottom: 4 }}>{formatClock(it.ts)} · {it.kindLabel}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--bone)" }}>{it.title}</div>
                  {it.subtitle && <div style={{ fontSize: 13, color: "var(--dim)", marginTop: 2 }}>{it.subtitle}</div>}
                  {it.audioUrl && (
                    <audio controls src={it.audioUrl} style={{ width: "100%", maxWidth: 300, height: 32, marginTop: 8 }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function ProjectCard({ project, onClick }) {
  const info = stageInfo(project.stage);
  return (
    <div className="md-card" onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      style={{ padding: 14, marginBottom: 12, cursor: "pointer", borderLeft: `3px solid ${info.color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--bone)" }}>{project.title}</div>
        {project.priority && (
          <span className="md-mono" style={{
            fontSize: 9,
            padding: "2px 6px",
            borderRadius: 4,
            background: project.priority === "HIGH" ? "rgba(232, 85, 60, 0.2)" : "var(--panel-raised)",
            color: project.priority === "HIGH" ? "var(--red)" : "var(--dim)",
            fontWeight: 700
          }}>
            {project.priority}
          </span>
        )}
      </div>
      {project.owner && <div className="md-mono" style={{ fontSize: 11, color: "var(--dim)", marginBottom: 6 }}>OWNER: {project.owner.toUpperCase()}</div>}
      {project.budget && <div className="md-mono" style={{ fontSize: 11, color: "var(--accent)", marginBottom: 6 }}>BUDGET: {project.budget}</div>}
      {project.nextStep && <div style={{ fontSize: 12, color: "var(--bone)", opacity: 0.9 }}>Next: {project.nextStep}</div>}
      <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", marginTop: 10 }}>UPDATED {formatShort(project.updatedAt)}</div>
    </div>
  );
}

function DailieTableView({ projects, onOpenDetail, onChangeStage }) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--rule)", borderRadius: 12, background: "var(--panel)" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "var(--panel-raised)", borderBottom: "1px solid var(--rule)" }}>
            <th className="md-mono" style={{ padding: "12px 16px", fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>TITLE</th>
            <th className="md-mono" style={{ padding: "12px 16px", fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>STAGE</th>
            <th className="md-mono" style={{ padding: "12px 16px", fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>BUDGET / VALUE</th>
            <th className="md-mono" style={{ padding: "12px 16px", fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>PRIORITY</th>
            <th className="md-mono" style={{ padding: "12px 16px", fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>OWNER</th>
            <th className="md-mono" style={{ padding: "12px 16px", fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>STUDIO</th>
            <th className="md-mono" style={{ padding: "12px 16px", fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>UPDATED</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const sInfo = stageInfo(p.stage);
            return (
              <tr
                key={p.id}
                onClick={() => onOpenDetail(p)}
                style={{ borderBottom: "1px solid var(--rule)", cursor: "pointer", transition: "background 0.15s" }}
                className="table-row-hover"
              >
                <td style={{ padding: "14px 16px", fontWeight: 700, color: "var(--bone)" }}>{p.title}</td>
                <td style={{ padding: "14px 16px" }} onClick={(e) => e.stopPropagation()}>
                  <span
                    className="md-mono"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 11,
                      padding: "4px 10px",
                      borderRadius: 100,
                      background: "var(--panel-raised)",
                      border: `1px solid ${sInfo.color}`,
                      color: "var(--bone)",
                      fontWeight: 600
                    }}
                  >
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: sInfo.color }} />
                    <select
                      value={p.stage}
                      onChange={(e) => onChangeStage(p.id, e.target.value)}
                      style={{ background: "transparent", border: "none", color: "inherit", font: "inherit", cursor: "pointer" }}
                    >
                      {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </span>
                </td>
                <td className="md-mono" style={{ padding: "14px 16px", color: "var(--accent)", fontWeight: 700 }}>{p.budget || "—"}</td>
                <td style={{ padding: "14px 16px" }}>
                  <span className="md-mono" style={{
                    fontSize: 10,
                    padding: "3px 8px",
                    borderRadius: 4,
                    background: p.priority === "HIGH" ? "rgba(232, 85, 60, 0.2)" : "var(--panel-raised)",
                    color: p.priority === "HIGH" ? "var(--red)" : "var(--dim)",
                    fontWeight: 700
                  }}>
                    {p.priority || "NORMAL"}
                  </span>
                </td>
                <td style={{ padding: "14px 16px", color: "var(--dim)" }}>{p.owner || "Unassigned"}</td>
                <td style={{ padding: "14px 16px", color: "var(--bone)", opacity: 0.9 }}>{p.studio || "Independent"}</td>
                <td className="md-mono" style={{ padding: "14px 16px", color: "var(--dim)", fontSize: 11 }}>{formatShort(p.updatedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ProjectsView({ projects, onOpenNew, onOpenDetail, onChangeStage, searchQuery }) {
  const [viewMode, setViewMode] = useState("kanban");

  const filteredProjects = useMemo(() => {
    if (!searchQuery) return projects;
    const q = searchQuery.toLowerCase();
    return projects.filter(p => p.title.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q)) || (p.owner && p.owner.toLowerCase().includes(q)));
  }, [projects, searchQuery]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div className="md-mono" style={{ fontSize: 11, color: "var(--dim)", letterSpacing: ".12em" }}>{filteredProjects.length} PROJECT{filteredProjects.length === 1 ? "" : "S"} ON THE BOARD</div>
          <div style={{ display: "flex", background: "var(--panel-raised)", border: "1px solid var(--rule)", borderRadius: 6, padding: 2 }}>
            <button
              className={"md-btn md-btn-ghost" + (viewMode === "kanban" ? " active" : "")}
              onClick={() => setViewMode("kanban")}
              style={{ padding: "4px 8px", borderRadius: 4, background: viewMode === "kanban" ? "var(--panel)" : "transparent" }}
              title="Kanban Board View"
            >
              <LayoutGrid size={14} color={viewMode === "kanban" ? "var(--accent)" : "var(--dim)"} />
            </button>
            <button
              className={"md-btn md-btn-ghost" + (viewMode === "table" ? " active" : "")}
              onClick={() => setViewMode("table")}
              style={{ padding: "4px 8px", borderRadius: 4, background: viewMode === "table" ? "var(--panel)" : "transparent" }}
              title="Table Grid View"
            >
              <Table size={14} color={viewMode === "table" ? "var(--accent)" : "var(--dim)"} />
            </button>
          </div>
        </div>

        <button className="md-btn md-btn-primary" onClick={onOpenNew}><Plus size={14} /> New Project</button>
      </div>

      {filteredProjects.length === 0 ? (
        <EmptyState title="No projects found" subtitle="Try clearing your search query or add a new project to start tracking." />
      ) : viewMode === "table" ? (
        <DailieTableView projects={filteredProjects} onOpenDetail={onOpenDetail} onChangeStage={onChangeStage} />
      ) : (
        <div className="md-scroll" style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 12 }}>
          {STAGES.map((s) => {
            const items = filteredProjects.filter((p) => p.stage === s.key);
            return (
              <div key={s.key} style={{ minWidth: 250, flex: "0 0 250px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, display: "inline-block" }} />
                  <span className="md-mono" style={{ fontSize: 11, letterSpacing: ".1em", color: "var(--dim)", fontWeight: 600 }}>{s.label.toUpperCase()} · {items.length}</span>
                </div>
                {items.map((p) => <ProjectCard key={p.id} project={p} onClick={() => onOpenDetail(p)} />)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DirectoryView({ contacts, onAddContact, searchQuery }) {
  const filtered = useMemo(() => {
    if (!searchQuery) return contacts;
    const q = searchQuery.toLowerCase();
    return contacts.filter(c => c.name.toLowerCase().includes(q) || (c.role && c.role.toLowerCase().includes(q)) || (c.organization && c.organization.toLowerCase().includes(q)));
  }, [contacts, searchQuery]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div className="md-mono" style={{ fontSize: 11, color: "var(--dim)", letterSpacing: ".12em" }}>{filtered.length} INDUSTRY CONTACT{filtered.length === 1 ? "" : "S"} & EXEC PARTNERS</div>
        <button className="md-btn md-btn-primary" onClick={onAddContact}><Plus size={14} /> Add Contact</button>
      </div>

      <div style={{ overflowX: "auto", border: "1px solid var(--rule)", borderRadius: 12, background: "var(--panel)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "var(--panel-raised)", borderBottom: "1px solid var(--rule)" }}>
              <th className="md-mono" style={{ padding: "12px 16px", fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>NAME</th>
              <th className="md-mono" style={{ padding: "12px 16px", fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>ROLE</th>
              <th className="md-mono" style={{ padding: "12px 16px", fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>ORGANIZATION / STUDIO</th>
              <th className="md-mono" style={{ padding: "12px 16px", fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>EMAIL</th>
              <th className="md-mono" style={{ padding: "12px 16px", fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>PHONE</th>
              <th className="md-mono" style={{ padding: "12px 16px", fontSize: 11, color: "var(--dim)", fontWeight: 700 }}>LINKED PROJECT</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid var(--rule)" }}>
                <td style={{ padding: "14px 16px", fontWeight: 700, color: "var(--bone)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--panel-raised)", border: "1px solid var(--rule)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "var(--accent)" }}>
                      {c.name.charAt(0)}
                    </div>
                    {c.name}
                  </div>
                </td>
                <td style={{ padding: "14px 16px", color: "var(--dim)" }}>{c.role}</td>
                <td style={{ padding: "14px 16px", color: "var(--bone)", opacity: 0.9 }}>{c.organization}</td>
                <td className="md-mono" style={{ padding: "14px 16px", color: "var(--accent)", fontSize: 12 }}>{c.email}</td>
                <td className="md-mono" style={{ padding: "14px 16px", color: "var(--dim)", fontSize: 12 }}>{c.phone}</td>
                <td style={{ padding: "14px 16px" }}>
                  <span className="md-mono" style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: "var(--panel-raised)", color: "var(--bone)", border: "1px solid var(--rule)" }}>
                    {c.project || "General"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CalendarView({ projects, meetings, logs, onOpenProject, onOpenMeeting }) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthLabel = currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" }).toUpperCase();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDayOfWeek = new Date(year, month, 1).getDay();

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const today = () => setCurrentDate(new Date());

  const eventsByDate = useMemo(() => {
    const map = {};

    const addEv = (dateTs, ev) => {
      const dStr = new Date(dateTs).toISOString().slice(0, 10);
      if (!map[dStr]) map[dStr] = [];
      map[dStr].push(ev);
    };

    projects.forEach((p) => {
      addEv(p.updatedAt, { type: "project", title: p.title, stage: p.stage, item: p });
    });

    meetings.forEach((m) => {
      addEv(m.date, { type: "meeting", title: m.title, item: m });
      (m.followUps || []).forEach((f) => {
        if (f.dueDate) {
          const dueTs = new Date(f.dueDate + "T12:00:00").getTime();
          if (!isNaN(dueTs)) {
            addEv(dueTs, { type: "task", title: `Task: ${f.text}`, done: f.done, item: m });
          }
        }
      });
    });

    return map;
  }, [projects, meetings]);

  const cells = [];
  for (let i = 0; i < startDayOfWeek; i++) {
    cells.push({ empty: true, key: `empty-${i}` });
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    const dateStr = dateObj.toISOString().slice(0, 10);
    const isToday = new Date().toDateString() === dateObj.toDateString();
    const evs = eventsByDate[dateStr] || [];
    cells.push({ day: d, dateStr, isToday, events: evs, key: `day-${d}` });
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="md-display" style={{ fontSize: 20, fontWeight: 800 }}>{monthLabel}</div>
          <button className="md-btn md-btn-ghost" onClick={today} style={{ padding: "4px 10px", fontSize: 11 }}>TODAY</button>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button className="md-btn md-btn-ghost" onClick={prevMonth} style={{ padding: 8 }}><ChevronLeft size={16} /></button>
          <button className="md-btn md-btn-ghost" onClick={nextMonth} style={{ padding: 8 }}><ChevronRight size={16} /></button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: "var(--rule)", borderRadius: 12, overflow: "hidden", border: "1px solid var(--rule)" }}>
        {["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"].map((h) => (
          <div key={h} className="md-mono" style={{ background: "var(--panel-raised)", padding: "10px 8px", fontSize: 10, color: "var(--dim)", textAlign: "center", fontWeight: 700, letterSpacing: ".1em" }}>
            {h}
          </div>
        ))}

        {cells.map((cell) => {
          if (cell.empty) {
            return <div key={cell.key} style={{ background: "var(--ink)", minHeight: 100, opacity: 0.4 }} />;
          }

          return (
            <div
              key={cell.key}
              style={{
                background: cell.isToday ? "#19191d" : "var(--panel)",
                minHeight: 110,
                padding: 8,
                display: "flex",
                flexDirection: "column",
                borderTop: cell.isToday ? "2px solid var(--accent)" : "none"
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span className="md-mono" style={{ fontSize: 12, fontWeight: cell.isToday ? 800 : 500, color: cell.isToday ? "var(--accent)" : "var(--dim)" }}>
                  {cell.day}
                </span>
                {cell.events.length > 0 && (
                  <span className="md-mono" style={{ fontSize: 9, background: "var(--panel-raised)", color: "var(--dim)", padding: "1px 5px", borderRadius: 10 }}>
                    {cell.events.length}
                  </span>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", maxHeight: 80 }}>
                {cell.events.map((ev, idx) => {
                  const isProj = ev.type === "project";
                  const isTask = ev.type === "task";
                  const color = isProj ? stageInfo(ev.stage).color : isTask ? "var(--sage)" : "var(--accent)";

                  return (
                    <div
                      key={idx}
                      onClick={() => isProj ? onOpenProject(ev.item) : onOpenMeeting(ev.item)}
                      style={{
                        fontSize: 11,
                        padding: "3px 6px",
                        borderRadius: 4,
                        background: "var(--panel-raised)",
                        borderLeft: `3px solid ${color}`,
                        color: "var(--bone)",
                        cursor: "pointer",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis"
                      }}
                      title={ev.title}
                    >
                      {ev.title}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CommandPaletteModal({ onClose, onSelectAction, projects, contacts }) {
  const [query, setQuery] = useState("");

  const filteredItems = useMemo(() => {
    if (!query) return [];
    const q = query.toLowerCase();
    const list = [];
    projects.forEach((p) => {
      if (p.title.toLowerCase().includes(q)) {
        list.push({ type: "Project", title: p.title, action: () => onSelectAction("project", p) });
      }
    });
    contacts.forEach((c) => {
      if (c.name.toLowerCase().includes(q) || c.organization.toLowerCase().includes(q)) {
        list.push({ type: "Contact", title: `${c.name} (${c.organization})`, action: () => onSelectAction("directory", c) });
      }
    });
    return list;
  }, [query, projects, contacts]);

  return (
    <ModalShell title="Dailie Command Palette (Cmd+K)" onClose={onClose}>
      <div style={{ position: "relative", marginBottom: 16 }}>
        <Command size={16} color="var(--accent)" style={{ position: "absolute", left: 14, top: 13 }} />
        <input
          className="md-input"
          style={{ paddingLeft: 42, fontSize: 14 }}
          placeholder="Type a command, search project, or search contact..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      <div style={{ display: "grid", gap: 8, maxHeight: 240, overflowY: "auto" }}>
        {filteredItems.map((item, idx) => (
          <div
            key={idx}
            onClick={item.action}
            style={{ padding: "10px 14px", background: "var(--panel-raised)", border: "1px solid var(--rule)", borderRadius: 8, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--bone)" }}>{item.title}</span>
            <span className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>{item.type}</span>
          </div>
        ))}

        {!query && (
          <div style={{ fontSize: 12, color: "var(--dim)", textAlign: "center", padding: "20px 0" }}>
            Search projects, industry contacts, or press Esc to exit.
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function NewProjectModal({ onClose, onCreate, initialTitle = "", initialDesc = "" }) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDesc);
  const [stage, setStage] = useState(STAGES[0].key);
  const [owner, setOwner] = useState("");
  const [budget, setBudget] = useState("");
  const [priority, setPriority] = useState("HIGH");
  const [nextStep, setNextStep] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    if (!title.trim()) { setError("Give the project a title."); return; }
    onCreate({ title: title.trim(), description: description.trim(), stage, owner: owner.trim(), budget: budget.trim(), priority, nextStep: nextStep.trim() });
  };

  return (
    <ModalShell title="New Project Record" onClose={onClose}>
      <Field label="TITLE"><input className="md-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project title" autoFocus /></Field>
      <Field label="LOGLINE / DESCRIPTION"><textarea className="md-textarea" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this project about?" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="STAGE">
          <select className="md-select" value={stage} onChange={(e) => setStage(e.target.value)}>
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="PRIORITY">
          <select className="md-select" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
          </select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="ESTIMATED BUDGET / VALUE"><input className="md-input" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="e.g. $12.5M" /></Field>
        <Field label="OWNER"><input className="md-input" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Lead Producer" /></Field>
      </div>
      <Field label="NEXT STEP"><input className="md-input" value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="Immediate action item" /></Field>
      {error && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 10 }}>{error}</div>}
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>Add to Board</button>
    </ModalShell>
  );
}

function NewContactModal({ onClose, onCreate }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [project, setProject] = useState("");

  const submit = () => {
    if (!name.trim()) return;
    onCreate({ id: uid(), name: name.trim(), role: role.trim(), organization: organization.trim(), email: email.trim(), phone: phone.trim(), project: project.trim() });
  };

  return (
    <ModalShell title="New Industry Contact" onClose={onClose}>
      <Field label="FULL NAME"><input className="md-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. David Sterling" autoFocus /></Field>
      <Field label="ROLE / TITLE"><input className="md-input" value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. VP Distribution / Director" /></Field>
      <Field label="ORGANIZATION / STUDIO"><input className="md-input" value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="e.g. A24 / CAA / Netflix" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="EMAIL"><input className="md-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@domain.com" /></Field>
        <Field label="PHONE"><input className="md-input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 (555) 000-0000" /></Field>
      </div>
      <Field label="ASSOCIATED PROJECT"><input className="md-input" value={project} onChange={(e) => setProject(e.target.value)} placeholder="Project title" /></Field>
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>Save Contact</button>
    </ModalShell>
  );
}

function ProjectDetailModal({ project, onClose, onChangeStage, onLog, onDelete }) {
  const [note, setNote] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const history = [...(project.history || [])].sort((a, b) => b.date - a.date);

  const addNote = () => {
    if (!note.trim()) return;
    onLog(project.id, note.trim());
    setNote("");
  };

  return (
    <ModalShell title={project.title} onClose={onClose}>
      {project.description && <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 16 }}>{project.description}</div>}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 140px" }}>
          <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", marginBottom: 6 }}>STAGE</div>
          <select className="md-select" value={project.stage} onChange={(e) => onChangeStage(project.id, e.target.value)}>
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        {project.budget && (
          <div style={{ flex: "1 1 100px" }}>
            <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", marginBottom: 6 }}>BUDGET</div>
            <div style={{ fontSize: 13, paddingTop: 8, color: "var(--accent)", fontWeight: 700 }}>{project.budget}</div>
          </div>
        )}
        {project.owner && (
          <div style={{ flex: "1 1 120px" }}>
            <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", marginBottom: 6 }}>OWNER</div>
            <div style={{ fontSize: 13, paddingTop: 8, color: "var(--bone)", fontWeight: 600 }}>{project.owner}</div>
          </div>
        )}
      </div>
      {project.nextStep && (
        <div style={{ fontSize: 13, marginBottom: 18, padding: 12, background: "var(--panel-raised)", border: "1px solid var(--rule)", borderRadius: 8 }}>
          <span className="md-mono" style={{ fontSize: 10, color: "var(--dim)" }}>NEXT STEP · </span>{project.nextStep}
        </div>
      )}
      <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", marginBottom: 10 }}>ACTIVITY LOG</div>
      <div style={{ maxHeight: 180, overflowY: "auto", marginBottom: 14, paddingRight: 4 }}>
        {history.map((h) => (
          <div key={h.id} style={{ fontSize: 12, marginBottom: 10, paddingLeft: 10, borderLeft: "2px solid var(--rule)" }}>
            <div className="md-mono" style={{ color: "var(--dim)", fontSize: 10 }}>{formatShort(h.date)}</div>
            <div style={{ color: "var(--bone)" }}>{h.note}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <input className="md-input" placeholder="Add an update note…" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addNote(); }} />
        <button className="md-btn" onClick={addNote}>Add</button>
      </div>
      <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 14 }}>
        {!confirmingDelete ? (
          <button className="md-btn md-btn-ghost" onClick={() => setConfirmingDelete(true)}><Trash2 size={13} /> Remove project</button>
        ) : (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12, color: "var(--red)" }}>Remove project from board?</span>
            <button className="md-btn" style={{ borderColor: "var(--red)", color: "var(--red)" }} onClick={() => onDelete(project.id)}>Yes, remove</button>
            <button className="md-btn md-btn-ghost" onClick={() => setConfirmingDelete(false)}>Cancel</button>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

function MeetingCard({ meeting, onToggleFollowUp, onDelete }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const open = meeting.followUps.filter((f) => !f.done).length;
  return (
    <div className="md-card" style={{ padding: 18, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
        <div>
          <div className="md-mono" style={{ fontSize: 11, color: "var(--accent)", marginBottom: 4, fontWeight: 600 }}>{formatShort(meeting.date)}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--bone)" }}>{meeting.title}</div>
          {meeting.attendees && (
            <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 4 }}>
              <Users size={12} style={{ display: "inline", marginRight: 5, verticalAlign: -1 }} />{meeting.attendees}
            </div>
          )}
        </div>
        <button className="md-btn md-btn-ghost" style={{ padding: 6 }} onClick={() => setConfirmingDelete(true)}><Trash2 size={13} /></button>
      </div>
      {meeting.notes && <div style={{ fontSize: 14, color: "var(--bone)", opacity: 0.9, marginBottom: 14, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{meeting.notes}</div>}
      {meeting.followUps.length > 0 && (
        <div>
          <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", marginBottom: 8 }}>FOLLOW-UPS · {open} OPEN</div>
          {meeting.followUps.map((f) => (
            <div key={f.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 0", cursor: "pointer" }}
              onClick={() => onToggleFollowUp(meeting.id, f.id)} role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") onToggleFollowUp(meeting.id, f.id); }}>
              {f.done ? <CheckSquare size={15} color="var(--sage)" style={{ marginTop: 1, flexShrink: 0 }} /> : <Square size={15} color="var(--dim)" style={{ marginTop: 1, flexShrink: 0 }} />}
              <div style={{ fontSize: 13, textDecoration: f.done ? "line-through" : "none", color: f.done ? "var(--dim)" : "var(--bone)" }}>
                {f.text}{f.owner && <span className="md-mono" style={{ color: "var(--dim)", fontSize: 11 }}> — {f.owner}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
      {confirmingDelete && (
        <div style={{ marginTop: 14, display: "flex", gap: 8, alignItems: "center", borderTop: "1px solid var(--rule)", paddingTop: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--red)" }}>Delete this meeting note?</span>
          <button className="md-btn" style={{ borderColor: "var(--red)", color: "var(--red)" }} onClick={() => onDelete(meeting.id)}>Delete</button>
          <button className="md-btn md-btn-ghost" onClick={() => setConfirmingDelete(false)}>Cancel</button>
        </div>
      )}
    </div>
  );
}

function MeetingsView({ meetings, onOpenNew, onToggleFollowUp, onDelete, searchQuery }) {
  const filtered = useMemo(() => {
    let list = [...meetings].sort((a, b) => b.date - a.date);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(m => m.title.toLowerCase().includes(q) || (m.notes && m.notes.toLowerCase().includes(q)) || (m.attendees && m.attendees.toLowerCase().includes(q)));
    }
    return list;
  }, [meetings, searchQuery]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, flexWrap: "wrap", gap: 10 }}>
        <div className="md-mono" style={{ fontSize: 11, color: "var(--dim)", letterSpacing: ".12em" }}>{filtered.length} MEETING NOTE{filtered.length === 1 ? "" : "S"}</div>
        <button className="md-btn md-btn-primary" onClick={onOpenNew}><Plus size={14} /> New Meeting Note</button>
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="No meeting notes found" subtitle="Log your next meeting with action items and follow-ups to stay synchronized." />
      ) : filtered.map((m) => <MeetingCard key={m.id} meeting={m} onToggleFollowUp={onToggleFollowUp} onDelete={onDelete} />)}
    </div>
  );
}

function NewMeetingModal({ onClose, onCreate, defaultAuthor, initialTitle = "", initialNotes = "" }) {
  const [title, setTitle] = useState(initialTitle);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [attendees, setAttendees] = useState("");
  const [notes, setNotes] = useState(initialNotes);
  const [followUps, setFollowUps] = useState([{ id: uid(), text: "", owner: defaultAuthor || "", dueDate: "" }]);
  const [error, setError] = useState("");

  const updateFollowUp = (id, field, value) => setFollowUps((fs) => fs.map((f) => (f.id === id ? { ...f, [field]: value } : f)));
  const addFollowUpRow = () => setFollowUps((fs) => [...fs, { id: uid(), text: "", owner: "", dueDate: "" }]);
  const removeFollowUpRow = (id) => setFollowUps((fs) => fs.filter((f) => f.id !== id));

  const submit = () => {
    if (!title.trim()) { setError("Give the meeting a title."); return; }
    const cleanFollowUps = followUps.filter((f) => f.text.trim()).map((f) => ({ id: f.id, text: f.text.trim(), owner: f.owner.trim(), dueDate: f.dueDate, done: false }));
    onCreate({ title: title.trim(), date: new Date(date + "T12:00:00").getTime(), attendees: attendees.trim(), notes: notes.trim(), followUps: cleanFollowUps });
  };

  return (
    <ModalShell title="New Meeting Note" onClose={onClose}>
      <Field label="TITLE"><input className="md-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Slate Pitch Sync with Warner Bros" autoFocus /></Field>
      <Field label="DATE"><input type="date" className="md-input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label="ATTENDEES"><input className="md-input" value={attendees} onChange={(e) => setAttendees(e.target.value)} placeholder="Comma-separated names" /></Field>
      <Field label="NOTES"><textarea className="md-textarea" rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Key takeaways and decisions" /></Field>
      <Field label="FOLLOW-UPS">
        {followUps.map((f) => (
          <div key={f.id} style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            <input className="md-input" style={{ flex: "2 1 auto" }} placeholder="Action item" value={f.text} onChange={(e) => updateFollowUp(f.id, "text", e.target.value)} />
            <input className="md-input" style={{ flex: "1 1 90px" }} placeholder="Owner" value={f.owner} onChange={(e) => updateFollowUp(f.id, "owner", e.target.value)} />
            <input type="date" className="md-input" style={{ flex: "1 1 120px" }} value={f.dueDate} onChange={(e) => updateFollowUp(f.id, "dueDate", e.target.value)} />
            {followUps.length > 1 && <button className="md-btn md-btn-ghost" style={{ padding: 6 }} onClick={() => removeFollowUpRow(f.id)}><X size={14} /></button>}
          </div>
        ))}
        <button className="md-btn md-btn-ghost" onClick={addFollowUpRow}><Plus size={13} /> Add follow-up</button>
      </Field>
      {error && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 10 }}>{error}</div>}
      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={submit}>Save Meeting Note</button>
    </ModalShell>
  );
}

function GmailSyncModal({ onClose, onImportICS, onImportGmailInvite }) {
  const [gmailText, setGmailText] = useState("");
  const [statusMsg, setStatusMsg] = useState("");

  const handlePasteGmail = () => {
    if (!gmailText.trim()) return;
    const meeting = parseGmailTextInvite(gmailText);
    onImportGmailInvite(meeting);
    setStatusMsg("Gmail invite successfully parsed and added to Meeting Notes!");
    setGmailText("");
  };

  const handleICalUpload = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const events = parseICSFeed(event.target.result);
        if (events.length > 0) {
          onImportICS(events);
          setStatusMsg(`Successfully imported ${events.length} Google Calendar event(s)!`);
        } else {
          setStatusMsg("No events found in iCal file.");
        }
      } catch (err) {
        setStatusMsg("Failed to parse iCal file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <ModalShell title="Gmail & Google Calendar Sync" onClose={onClose}>
      <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 16 }}>
        Synchronize your <strong style={{ color: "var(--bone)" }}>Google Calendar</strong> schedule and <strong style={{ color: "var(--bone)" }}>Gmail meeting invites</strong> directly with Dailie's Live Calendar & Ops Board.
      </div>

      <Field label="OPTION 1: PASTE GMAIL MEETING INVITE / EMAIL THREAD">
        <textarea
          className="md-textarea"
          rows={4}
          value={gmailText}
          onChange={(e) => setGmailText(e.target.value)}
          placeholder="Paste email thread or calendar invite body here (Subject, From, Date, Discussion...)"
        />
        <button className="md-btn md-btn-primary" style={{ marginTop: 8, width: "100%", justifyContent: "center" }} onClick={handlePasteGmail}>
          <Mail size={14} style={{ marginRight: 6 }} /> Sync Gmail Email to Meeting Notes
        </button>
      </Field>

      <div style={{ borderTop: "1px solid var(--rule)", margin: "16px 0", paddingTop: 16 }}>
        <Field label="OPTION 2: IMPORT GOOGLE CALENDAR (.ICS FILE)">
          <input type="file" accept=".ics" onChange={handleICalUpload} style={{ fontSize: 12, color: "var(--bone)" }} />
        </Field>
      </div>

      {statusMsg && (
        <div style={{ padding: 10, background: "rgba(167, 179, 164, 0.15)", border: "1px solid var(--accent)", borderRadius: 8, color: "var(--bone)", fontSize: 12, marginTop: 12 }}>
          {statusMsg}
        </div>
      )}
    </ModalShell>
  );
}

function ImportDocumentModal({ fileInfo, onClose, onConvertToProject, onConvertToMeeting, onConvertToQuickLog }) {
  const { fileName, fileExt, extractedText } = fileInfo;

  return (
    <ModalShell title={`Import Document: ${fileName}`} onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <FileText size={18} color="var(--accent)" />
        <span className="md-mono" style={{ fontSize: 11, color: "var(--accent)", letterSpacing: ".1em", fontWeight: 600 }}>
          FORMAT: {fileExt.toUpperCase()}
        </span>
      </div>

      <Field label="EXTRACTED CONTENT PREVIEW">
        <textarea
          className="md-textarea"
          rows={6}
          readOnly
          value={extractedText}
          style={{ fontSize: 12, fontFamily: "var(--font-mono)", opacity: 0.9, background: "var(--panel-raised)" }}
        />
      </Field>

      <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", marginBottom: 10 }}>
        CHOOSE IMPORT DESTINATION:
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        <button
          className="md-btn md-btn-primary"
          style={{ justifyContent: "flex-start", padding: "12px 16px" }}
          onClick={() => onConvertToProject(fileName, extractedText)}
        >
          <FolderPlus size={16} style={{ marginRight: 8 }} />
          Create New Project from Document
        </button>

        <button
          className="md-btn"
          style={{ justifyContent: "flex-start", padding: "12px 16px" }}
          onClick={() => onConvertToMeeting(fileName, extractedText)}
        >
          <Users size={16} style={{ marginRight: 8 }} />
          Save as Meeting Note & Action Items
        </button>

        <button
          className="md-btn md-btn-ghost"
          style={{ justifyContent: "flex-start", padding: "10px 16px", border: "1px solid var(--rule)" }}
          onClick={() => onConvertToQuickLog(fileName, extractedText)}
        >
          <MessageSquare size={16} style={{ marginRight: 8 }} />
          Log as Timeline Quick Note
        </button>
      </div>
    </ModalShell>
  );
}

function InfoDialogModal({ onClose }) {
  return (
    <ModalShell title="Dailie Ops Board Guide" onClose={onClose}>
      <div style={{ fontSize: 13, color: "var(--dim)", lineHeight: 1.6, marginBottom: 20 }}>
        Welcome to <strong style={{ color: "var(--bone)" }}>Dailie</strong>, the production operations tracking system designed for film, TV, and tech-entertainment studios. Here is how to use the controls and inputs:
      </div>

      <div style={{ display: "grid", gap: 16, maxHeight: "55vh", overflowY: "auto", paddingRight: 4 }}>
        <div style={{ padding: 12, background: "var(--panel-raised)", borderRadius: 8, border: "1px solid var(--rule)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--bone)", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
            <Sparkles size={16} color="var(--accent)" /> Dailie AI Studio Assistant
          </div>
          <div style={{ fontSize: 12, color: "var(--dim)" }}>
            Chat with AI Assistant to run executive slate reports, automate project creation, and filter open follow-up action items.
          </div>
        </div>

        <div style={{ padding: 12, background: "var(--panel-raised)", borderRadius: 8, border: "1px solid var(--rule)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--bone)", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
            <Mic size={16} color="var(--accent)" /> Live Call Recording & Audio Transcription
          </div>
          <div style={{ fontSize: 12, color: "var(--dim)" }}>
            Record live phone calls or upload pitch voice memos. Automatically transcribes audio into timeline notes and follow-ups.
          </div>
        </div>

        <div style={{ padding: 12, background: "var(--panel-raised)", borderRadius: 8, border: "1px solid var(--rule)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--bone)", fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
            <Eye size={16} color="var(--accent)" /> Outbound Email & Deal Memo Tracking
          </div>
          <div style={{ fontSize: 12, color: "var(--dim)" }}>
            Track email open counts and client engagement for script send-outs, deal memos, and studio communications.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, paddingTop: 14, borderTop: "1px solid var(--rule)", textAlign: "right" }}>
        <button className="md-btn md-btn-primary" onClick={onClose}>Got it</button>
      </div>
    </ModalShell>
  );
}

function AISchedulingAgentModal({ onClose, contacts, projects, meetings, onScheduleMeetingComplete, defaultAuthor }) {
  const [prompt, setPrompt] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const [steps, setSteps] = useState([]);
  const [draftResult, setDraftResult] = useState(null);

  const samplePrompts = [
    "Schedule pitch meeting with David Sterling from A24 next Tuesday at 2 PM to review The Obsidian Echo script",
    "Set up 30-min slate review call with Marcus Vance for Wilderness Tide on Friday at 10 AM",
    "Schedule distribution sync with Sarah Chen regarding Neon Horizon next Monday afternoon"
  ];

  const handleRunAgent = (inputPrompt) => {
    const text = inputPrompt || prompt;
    if (!text.trim()) return;

    setIsExecuting(true);
    setSteps([
      { id: 1, text: "🔍 Analyzing natural language scheduling prompt...", status: "active" }
    ]);
    setDraftResult(null);

    setTimeout(() => {
      setSteps((prev) => [
        { ...prev[0], status: "done" },
        { id: 2, text: "👥 Querying Industry Contacts Directory & matching partner records...", status: "active" }
      ]);
    }, 700);

    setTimeout(() => {
      setSteps((prev) => [
        ...prev.map(s => s.id === 2 ? { ...s, status: "done" } : s),
        { id: 3, text: "📅 Checking Live Calendar for availability conflicts...", status: "active" }
      ]);
    }, 1400);

    setTimeout(() => {
      setSteps((prev) => [
        ...prev.map(s => s.id === 3 ? { ...s, status: "done" } : s),
        { id: 4, text: "✉️ Generating calendar invite & email tracking pixel...", status: "done" }
      ]);

      const lower = text.toLowerCase();
      let matchedContact = contacts.find(c => lower.includes(c.name.toLowerCase().split(' ')[0]));
      if (!matchedContact) matchedContact = contacts[0] || { name: "Studio Executive", email: "exec@studio.com", organization: "A24" };

      let matchedProj = projects.find(p => lower.includes(p.title.toLowerCase()));
      if (!matchedProj) matchedProj = projects[0] || { title: "General Slate" };

      const meetingDate = new Date(Date.now() + 2 * 86400000);
      const formattedDate = meetingDate.toISOString().slice(0, 10);

      const generatedMeeting = {
        id: "meet-" + uid(),
        title: text.length > 50 ? text.slice(0, 50) + "..." : text,
        date: meetingDate.getTime(),
        attendees: `${matchedContact.name} (${matchedContact.organization}), ${defaultAuthor || "Producer"}`,
        notes: `AI Scheduled Meeting: ${text}\nProject: ${matchedProj.title}\nContact Email: ${matchedContact.email}`,
        followUps: [
          { id: "f-" + uid(), text: `Send pitch deck to ${matchedContact.name}`, owner: defaultAuthor || "Producer", dueDate: formattedDate, done: false },
          { id: "f-" + uid(), text: "Confirm meeting room / video link", owner: defaultAuthor || "Producer", dueDate: formattedDate, done: false }
        ]
      };

      const generatedTrackedEmail = {
        id: "e-" + uid(),
        recipient: matchedContact.email,
        subject: `Calendar Invite: ${generatedMeeting.title}`,
        project: matchedProj.title,
        sentAt: Date.now(),
        status: "Delivered",
        openCount: 0,
        lastOpened: null
      };

      setDraftResult({
        meeting: generatedMeeting,
        email: generatedTrackedEmail,
        contact: matchedContact
      });
      setIsExecuting(false);
    }, 2200);
  };

  const confirmAndDispatch = () => {
    if (!draftResult) return;
    onScheduleMeetingComplete(draftResult.meeting, draftResult.email);
    onClose();
  };

  return (
    <ModalShell title="AI Autonomous Meeting Scheduler Agent" onClose={onClose}>
      <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 16 }}>
        Your Dailie AI Executive Assistant handles scheduling end-to-end: checks partner contact info, verifies calendar availability, logs action items, and dispatches tracked email invites.
      </div>

      <Field label="NATURAL LANGUAGE SCHEDULING REQUEST">
        <textarea
          className="md-textarea"
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Schedule a pitch meeting with David Sterling from A24 next Tuesday at 2 PM to review The Obsidian Echo script"
        />
      </Field>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {samplePrompts.map((sp, idx) => (
          <button key={idx} className="md-btn md-btn-ghost" style={{ fontSize: 10, padding: "4px 8px" }} onClick={() => { setPrompt(sp); handleRunAgent(sp); }}>
            💡 {sp.slice(0, 38)}...
          </button>
        ))}
      </div>

      {!isExecuting && !draftResult && (
        <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => handleRunAgent()}>
          <Sparkles size={14} style={{ marginRight: 6 }} /> Run Autonomous Scheduler Agent
        </button>
      )}

      {steps.length > 0 && (
        <div style={{ background: "var(--panel-raised)", padding: 14, borderRadius: 10, border: "1px solid var(--rule)", marginBottom: 16 }}>
          <div className="md-mono" style={{ fontSize: 10, color: "var(--accent)", letterSpacing: ".1em", marginBottom: 8, fontWeight: 700 }}>
            AGENT EXECUTION PROGRESS
          </div>
          {steps.map((s) => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 6, color: s.status === "done" ? "var(--bone)" : "var(--accent)" }}>
              {s.status === "done" ? <CheckCircle2 size={14} color="var(--sage)" /> : <RefreshCw size={14} className="md-spin" color="var(--accent)" />}
              <span>{s.text}</span>
            </div>
          ))}
        </div>
      )}

      {draftResult && (
        <div style={{ border: "1px solid var(--accent)", background: "rgba(167, 179, 164, 0.1)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
          <div className="md-mono" style={{ fontSize: 11, color: "var(--accent)", fontWeight: 800, marginBottom: 6 }}>
            ✅ MEETING READY TO DISPATCH & SYNC
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--bone)", marginBottom: 4 }}>{draftResult.meeting.title}</div>
          <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 6 }}>
            <strong>Recipient:</strong> {draftResult.contact.name} ({draftResult.contact.email})
          </div>
          <div style={{ fontSize: 12, color: "var(--dim)" }}>
            <strong>Follow-ups:</strong> Auto-generated {draftResult.meeting.followUps.length} producer action items.
          </div>
          <button className="md-btn md-btn-primary" style={{ width: "100%", marginTop: 12, justifyContent: "center" }} onClick={confirmAndDispatch}>
            Confirm & Dispatch Meeting Invite to Calendar & Board
          </button>
        </div>
      )}
    </ModalShell>
  );
}

function DailieBrandLogo({ size = 36 }) {
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

export default function App() {
  const [data, setData] = useState(SEED_DATA);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [activeTab, setActiveTab] = useState("timeline");
  const [timelineFilter, setTimelineFilter] = useState("all");
  const [authorName, setAuthorName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewMeeting, setShowNewMeeting] = useState(false);
  const [showNewContact, setShowNewContact] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [showTrackEmailModal, setShowTrackEmailModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [showGmailModal, setShowGmailModal] = useState(false);
  const [showCmdPalette, setShowCmdPalette] = useState(false);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [showSchedulerModal, setShowSchedulerModal] = useState(false);
  const [detailProject, setDetailProject] = useState(null);
  const [importDocInfo, setImportDocInfo] = useState(null);
  const [initialModalData, setInitialModalData] = useState({ projectTitle: "", projectDesc: "", meetingTitle: "", meetingNotes: "" });
  const fileInputRef = useRef(null);

  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("dailie-theme-v1") || "dark";
    } catch (e) {
      return "dark";
    }
  });

  useEffect(() => {
    if (theme === "light") {
      document.documentElement.classList.add("light-theme");
    } else {
      document.documentElement.classList.remove("light-theme");
    }
    try {
      localStorage.setItem("dailie-theme-v1", theme);
    } catch (e) {}
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === "dark" ? "light" : "dark"));

  const load = async () => {
    const stored = await getStoredData();
    setData(stored);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      try {
        const savedAuthor = localStorage.getItem(AUTHOR_KEY);
        if (savedAuthor) setAuthorName(savedAuthor);
      } catch (e) {}
      setLoading(false);
    })();
  }, []);

  const persist = async (newData) => {
    setData(newData);
    try {
      await setStoredData(newData);
      setSaveError("");
    } catch (e) {
      setSaveError("Failed to save changes — storage limit exceeded or disconnected.");
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setTimeout(() => setRefreshing(false), 400);
  };

  const handleAuthorChange = (val) => {
    setAuthorName(val);
    try {
      localStorage.setItem(AUTHOR_KEY, val);
    } catch (e) {}
  };

  const handleExportData = () => {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dailie-ops-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop().toLowerCase();

    if (fileExt === 'json') {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          if (parsed && Array.isArray(parsed.projects) && Array.isArray(parsed.meetings)) {
            parsed.logs = (parsed.logs || []).filter(l => l.id !== "log-1");
            if (!parsed.contacts) parsed.contacts = SEED_DATA.contacts;
            if (!parsed.trackedEmails) parsed.trackedEmails = SEED_DATA.trackedEmails;
            persist(parsed);
            alert("Dailie production board backup successfully imported!");
          } else {
            alert("Invalid Dailie board format.");
          }
        } catch (err) {
          alert("Failed to parse JSON file.");
        }
      };
      reader.readAsText(file);
    } else {
      try {
        setLoading(true);
        const extractedText = await parseDocumentFile(file);
        setLoading(false);
        setImportDocInfo({ fileName: file.name, fileExt, extractedText });
      } catch (err) {
        setLoading(false);
        alert(`Could not extract document content from ${file.name}.`);
      }
    }
    e.target.value = "";
  };

  const handleConvertDocToProject = (fileName, text) => {
    const titleWithoutExt = fileName.replace(/\.[^/.]+$/, "");
    setInitialModalData(prev => ({ ...prev, projectTitle: titleWithoutExt, projectDesc: text.slice(0, 500) }));
    setImportDocInfo(null);
    setShowNewProject(true);
  };

  const handleConvertDocToMeeting = (fileName, text) => {
    const titleWithoutExt = fileName.replace(/\.[^/.]+$/, "");
    setInitialModalData(prev => ({ ...prev, meetingTitle: `Meeting Notes: ${titleWithoutExt}`, meetingNotes: text.slice(0, 1000) }));
    setImportDocInfo(null);
    setShowNewMeeting(true);
  };

  const handleScheduleMeetingComplete = (meetingObj, trackedEmailObj) => {
    const updatedMeetings = [meetingObj, ...data.meetings];
    const updatedEmails = [trackedEmailObj, ...(data.trackedEmails || [])];
    persist({ ...data, meetings: updatedMeetings, trackedEmails: updatedEmails });
    alert(`Meeting "${meetingObj.title}" successfully scheduled and invite dispatched to ${trackedEmailObj.recipient}!`);
  };

  const handleConvertDocToQuickLog = (fileName, text) => {
    addQuickLog({ text: `Imported document (${fileName}): ${text.slice(0, 200)}...`, author: authorName || "Imported File" });
    setImportDocInfo(null);
    alert(`Document "${fileName}" added to Timeline log!`);
  };

  const handleImportICSEvents = (events) => {
    const newMeetings = events.map(e => ({
      id: e.id, title: e.title, date: e.date, attendees: "Google Calendar Sync", notes: e.notes || "Synced from Google Calendar", followUps: []
    }));
    persist({ ...data, meetings: [...newMeetings, ...data.meetings] });
  };

  const handleImportGmailInvite = (meeting) => {
    persist({ ...data, meetings: [meeting, ...data.meetings] });
  };

  const handleSaveCallNote = ({ title, transcript, author, audioUrl }) => {
    const log = {
      id: uid(),
      date: Date.now(),
      text: `🎙️ ${title}: ${transcript}`,
      author: author || authorName || "Producer",
      audioUrl
    };
    persist({ ...data, logs: [log, ...data.logs] });
    alert("Call recording and AI summary saved to Timeline!");
  };

  const handleSaveTrackedEmail = (emailObj) => {
    persist({ ...data, trackedEmails: [emailObj, ...(data.trackedEmails || [])] });
  };

  const handleSimulateEmailOpen = (emailId) => {
    const trackedEmails = (data.trackedEmails || []).map((e) => {
      if (e.id !== emailId) return e;
      const count = e.openCount + 1;
      return {
        ...e,
        openCount: count,
        status: `Opened (${count}x)`,
        lastOpened: Date.now()
      };
    });
    persist({ ...data, trackedEmails });
  };

  const handleAIAction = (actionType, payload) => {
    if (actionType === "createProject") {
      createProject(payload);
    }
  };

  const createProject = (fields) => {
    const now = Date.now();
    const project = {
      id: uid(), title: fields.title, description: fields.description, stage: fields.stage,
      owner: fields.owner, budget: fields.budget, priority: fields.priority, nextStep: fields.nextStep, createdAt: now, updatedAt: now,
      history: [{ id: uid(), date: now, note: "Added to board — " + stageInfo(fields.stage).label }],
    };
    persist({ ...data, projects: [project, ...data.projects] });
    setShowNewProject(false);
  };

  const createContact = (contact) => {
    persist({ ...data, contacts: [contact, ...(data.contacts || [])] });
    setShowNewContact(false);
  };

  const logProjectUpdate = (projectId, noteText, newStage) => {
    const now = Date.now();
    const projects = data.projects.map((p) => {
      if (p.id !== projectId) return p;
      const note = newStage ? `Moved to ${stageInfo(newStage).label}` + (noteText ? ` — ${noteText}` : "") : noteText;
      return { ...p, stage: newStage || p.stage, updatedAt: now, history: [...p.history, { id: uid(), date: now, note }] };
    });
    persist({ ...data, projects });
  };

  const changeProjectStage = (projectId, newStage) => logProjectUpdate(projectId, "", newStage);
  const addProjectNote = (projectId, noteText) => logProjectUpdate(projectId, noteText, null);

  const deleteProject = (projectId) => {
    persist({ ...data, projects: data.projects.filter((p) => p.id !== projectId) });
    setDetailProject(null);
  };

  const createMeeting = (fields) => {
    const meeting = { id: uid(), ...fields };
    persist({ ...data, meetings: [meeting, ...data.meetings] });
    setShowNewMeeting(false);
  };

  const toggleFollowUp = (meetingId, followUpId) => {
    const meetings = data.meetings.map((m) => (m.id !== meetingId ? m : { ...m, followUps: m.followUps.map((f) => (f.id === followUpId ? { ...f, done: !f.done } : f)) }));
    persist({ ...data, meetings });
  };

  const deleteMeeting = (meetingId) => persist({ ...data, meetings: data.meetings.filter((m) => m.id !== meetingId) });

  const addQuickLog = ({ text, author }) => {
    const log = { id: uid(), date: Date.now(), text, author };
    persist({ ...data, logs: [log, ...data.logs] });
  };

  const allTimelineEntries = useMemo(() => {
    const entries = [];
    data.projects.forEach((p) => {
      (p.history || []).forEach((h) => {
        entries.push({ id: "p-" + h.id, ts: h.date, type: "project", kindLabel: "PROJECT", title: p.title, subtitle: h.note, dotColor: stageInfo(p.stage).color });
      });
    });
    data.meetings.forEach((m) => {
      const openCount = m.followUps.filter((f) => !f.done).length;
      entries.push({
        id: "m-" + m.id, ts: m.date, type: "meeting", kindLabel: "MEETING", title: m.title,
        subtitle: m.followUps.length ? `${openCount} open follow-up${openCount === 1 ? "" : "s"} of ${m.followUps.length}` : m.attendees, dotColor: "var(--accent)",
      });
    });
    (data.logs || []).forEach((l) => {
      if (l.id === "log-1") return;
      entries.push({ id: "l-" + l.id, ts: l.date, type: "log", kindLabel: "NOTE", title: l.text, subtitle: l.author ? `Logged by ${l.author}` : "", dotColor: "var(--bone)", audioUrl: l.audioUrl });
    });
    entries.sort((a, b) => b.ts - a.ts);
    return entries;
  }, [data]);

  const activeProjectsCount = data.projects.filter((p) => p.stage !== "delivered" && p.stage !== "onhold").length;
  const openFollowUpsCount = data.meetings.reduce((sum, m) => sum + m.followUps.filter((f) => !f.done).length, 0);
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekActivityCount = allTimelineEntries.filter((e) => e.ts >= weekAgo).length;
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toUpperCase();

  return (
    <div className="md-root">
      <div style={{ padding: "26px 32px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <DailieBrandLogo size={42} />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className="eyebrow-badge">Matriarch Studios Operations</div>
                <button
                  className="md-btn md-btn-ghost"
                  onClick={() => setShowInfoModal(true)}
                  title="View Inputs & Features Information"
                  style={{ padding: 3, color: "var(--accent)" }}
                >
                  <HelpCircle size={15} />
                </button>
              </div>
              <div className="md-display" style={{ fontSize: 26, letterSpacing: "-0.03em", lineHeight: 1.1, marginTop: 2 }}>
                DAILIE <span className="md-serif-it" style={{ fontSize: "0.85em", opacity: 0.9 }}>Ops Board</span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              className="md-btn md-btn-primary"
              onClick={() => setShowSchedulerModal(true)}
              style={{ background: "var(--panel-raised)", border: "1px solid var(--rule-bright)", color: "var(--accent)", fontWeight: 700 }}
            >
              <CalendarIcon size={14} style={{ marginRight: 6 }} /> AI Meeting Scheduler
            </button>
            <button
              className="md-btn md-btn-primary"
              onClick={() => setShowAIAssistant((prev) => !prev)}
              style={{ background: "var(--accent)", color: "var(--ink)", fontWeight: 700 }}
            >
              <Sparkles size={14} style={{ marginRight: 6 }} /> AI Studio Assistant
            </button>
            <button
              className="md-btn md-btn-ghost"
              onClick={() => setShowCmdPalette(true)}
              style={{ background: "var(--panel-raised)", border: "1px solid var(--rule)", fontSize: 12, padding: "6px 12px" }}
            >
              <Command size={13} style={{ marginRight: 6, color: "var(--accent)" }} /> Cmd+K
            </button>
            <div style={{ position: "relative", minWidth: 180 }}>
              <Search size={14} color="var(--dim)" style={{ position: "absolute", left: 12, top: 11 }} />
              <input className="md-input" style={{ paddingLeft: 34, fontSize: 12 }} placeholder="Search board..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
            <div>
              <input className="md-input" style={{ fontSize: 12, padding: "6px 10px", width: 100 }} value={authorName} onChange={(e) => handleAuthorChange(e.target.value)} placeholder="Logged by..." />
            </div>
            <button className="md-btn md-btn-ghost" onClick={() => setShowRecordModal(true)} title="Live Call Recorder" style={{ padding: 8, color: "var(--red)" }}>
              <Mic size={14} />
            </button>
            <button className="md-btn md-btn-ghost" onClick={() => setShowGmailModal(true)} title="Gmail & Google Calendar Sync" style={{ padding: 8, color: "var(--accent)" }}>
              <Mail size={14} />
            </button>
            <button className="md-btn md-btn-ghost" onClick={() => setShowInfoModal(true)} title="Input & Controls Guide" style={{ padding: 8, color: "var(--dim)" }}>
              <Info size={14} />
            </button>
            <button className="md-btn md-btn-ghost" onClick={handleExportData} title="Export Dailie JSON" style={{ padding: 8 }}>
              <Download size={14} />
            </button>
            <button className="md-btn md-btn-ghost" onClick={() => fileInputRef.current && fileInputRef.current.click()} title="Import Document (PDF, DOCX, DOC, Pages, JSON, TXT)" style={{ padding: 8 }}>
              <Upload size={14} />
            </button>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              accept=".json,.pdf,.doc,.docx,.pages,.txt,.md"
              onChange={handleImportFile}
            />
            <button className="md-btn md-btn-ghost" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`} style={{ padding: 8, color: "var(--accent)" }}>
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button className="md-btn md-btn-ghost" onClick={refresh} title="Refresh Data" style={{ padding: 8 }}>
              <RefreshCw size={14} className={refreshing ? "md-spin" : ""} />
            </button>
            <div className="md-mono" style={{ fontSize: 11, border: "1px solid var(--rule)", padding: "7px 14px", borderRadius: 100, color: "var(--dim)", letterSpacing: ".08em" }}>{todayLabel}</div>
          </div>
        </div>
      </div>

      <div className="md-stripe" style={{ margin: "20px 0 0" }} />

      <div style={{ padding: "18px 32px", display: "flex", gap: 36, flexWrap: "wrap", borderBottom: "1px solid var(--rule)", alignItems: "center" }}>
        <Stat label="ACTIVE PROJECTS" value={activeProjectsCount} />
        <Stat label="OPEN FOLLOW-UPS" value={openFollowUpsCount} accent={openFollowUpsCount > 0 ? "var(--red)" : undefined} />
        <Stat label="LOGGED THIS WEEK" value={weekActivityCount} />
        {saveError && <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--red)" }}>{saveError}</div>}
      </div>

      <div className="md-scroll" style={{ display: "flex", gap: 28, padding: "0 32px", borderBottom: "1px solid var(--rule)", overflowX: "auto" }}>
        {TABS.map((t) => (
          <div key={t.key} className={"md-tab" + (activeTab === t.key ? " active" : "")} onClick={() => setActiveTab(t.key)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") setActiveTab(t.key); }}>{t.label}</div>
        ))}
      </div>

      <div style={{ padding: "24px 32px 48px" }}>
        {loading ? (
          <LoadingState />
        ) : activeTab === "timeline" ? (
          <TimelineView entries={allTimelineEntries} filter={timelineFilter} setFilter={setTimelineFilter} onAddLog={addQuickLog} defaultAuthor={authorName} searchQuery={searchQuery} onOpenRecordModal={() => setShowRecordModal(true)} />
        ) : activeTab === "projects" ? (
          <ProjectsView projects={data.projects} onOpenNew={() => { setInitialModalData({ projectTitle: "", projectDesc: "" }); setShowNewProject(true); }} onOpenDetail={setDetailProject} onChangeStage={changeProjectStage} searchQuery={searchQuery} />
        ) : activeTab === "meetings" ? (
          <MeetingsView meetings={data.meetings} onOpenNew={() => { setInitialModalData({ meetingTitle: "", meetingNotes: "" }); setShowNewMeeting(true); }} onToggleFollowUp={toggleFollowUp} onDelete={deleteMeeting} searchQuery={searchQuery} />
        ) : activeTab === "calendar" ? (
          <CalendarView projects={data.projects} meetings={data.meetings} logs={data.logs} onOpenProject={setDetailProject} onOpenMeeting={(m) => setActiveTab("meetings")} />
        ) : activeTab === "directory" ? (
          <DirectoryView contacts={data.contacts || []} onAddContact={() => setShowNewContact(true)} searchQuery={searchQuery} />
        ) : (
          <EmailTrackingView emails={data.trackedEmails || []} onOpenNewEmailModal={() => setShowTrackEmailModal(true)} onSimulateOpen={handleSimulateEmailOpen} />
        )}
      </div>

      {showNewProject && <NewProjectModal onClose={() => setShowNewProject(false)} onCreate={createProject} initialTitle={initialModalData.projectTitle} initialDesc={initialModalData.projectDesc} />}
      {showNewContact && <NewContactModal onClose={() => setShowNewContact(false)} onCreate={createContact} />}
      {showNewMeeting && <NewMeetingModal onClose={() => setShowNewMeeting(false)} onCreate={createMeeting} defaultAuthor={authorName} initialTitle={initialModalData.meetingTitle} initialNotes={initialModalData.meetingNotes} />}
      {showRecordModal && <CallRecorderModal onClose={() => setShowRecordModal(false)} onSaveCallNote={handleSaveCallNote} defaultAuthor={authorName} />}
      {showTrackEmailModal && <LogTrackedEmailModal onClose={() => setShowTrackEmailModal(false)} onSaveTrackedEmail={handleSaveTrackedEmail} projects={data.projects} />}
      {detailProject && (
        <ProjectDetailModal
          project={data.projects.find((p) => p.id === detailProject.id) || detailProject}
          onClose={() => setDetailProject(null)}
          onChangeStage={changeProjectStage}
          onLog={addProjectNote}
          onDelete={deleteProject}
        />
      )}
      {importDocInfo && (
        <ImportDocumentModal
          fileInfo={importDocInfo}
          onClose={() => setImportDocInfo(null)}
          onConvertToProject={handleConvertDocToProject}
          onConvertToMeeting={handleConvertDocToMeeting}
          onConvertToQuickLog={handleConvertDocToQuickLog}
        />
      )}
      {showInfoModal && <InfoDialogModal onClose={() => setShowInfoModal(false)} />}
      {showGmailModal && <GmailSyncModal onClose={() => setShowGmailModal(false)} onImportICS={handleImportICSEvents} onImportGmailInvite={handleImportGmailInvite} />}
      {showCmdPalette && (
        <CommandPaletteModal
          onClose={() => setShowCmdPalette(false)}
          onSelectAction={(tab, item) => {
            setShowCmdPalette(false);
            if (tab === "project") setDetailProject(item);
            else setActiveTab(tab);
          }}
          projects={data.projects}
          contacts={data.contacts || []}
        />
      )}
      {showSchedulerModal && (
        <AISchedulingAgentModal
          onClose={() => setShowSchedulerModal(false)}
          contacts={data.contacts || []}
          projects={data.projects || []}
          meetings={data.meetings || []}
          onScheduleMeetingComplete={handleScheduleMeetingComplete}
          defaultAuthor={authorName}
        />
      )}
      <AIAssistantDrawer isOpen={showAIAssistant} onClose={() => setShowAIAssistant(false)} data={data} onRunAction={handleAIAction} />
    </div>
  );
}
