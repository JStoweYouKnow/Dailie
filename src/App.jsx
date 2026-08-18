import { useState, useEffect, useMemo, useRef } from "react";
import {
  Search, Command, Sparkles, Sun, Moon, RefreshCw, Download, Upload, Info, Mic, Mail,
  Calendar as CalendarIcon, Settings, ExternalLink,
} from "lucide-react";
import { StoreProvider, useBoardStore } from "./lib/store";
import { normalizeData, staleFollowUps } from "./lib/model";
import { parseDocumentFile } from "./documentParser";
import { parseSyncPayload, isICalendarFeed } from "./calendarSync";
import { LoadingState, Stat, Avatar, ModalShell, Field } from "./ui/kit";
import {
  DailieBrandLogo, Toast, NotificationCenter, LiveCallBanner, CommandPalette, AIAssistantDrawer, InfoModal,
} from "./views/shell";
import HomeView from "./views/HomeView";
import ProjectsView from "./views/ProjectsView";
import ProjectDetail from "./views/ProjectDetail";
import NewProjectModal from "./views/NewProjectModal";
import TasksView from "./views/TasksView";
import TeamView from "./views/TeamView";
import CalendarView from "./views/CalendarView";
import MeetingsView, { NewMeetingModal } from "./views/MeetingsView";
import CallsView from "./views/CallsView";
import CallRecorder from "./views/CallRecorder";
import EmailsView from "./views/EmailsView";
import CompaniesView from "./views/CompaniesView";
import PeopleView from "./views/PeopleView";
import ContractsView from "./views/ContractsView";
import FinanceView from "./views/FinanceView";
import TimelineView from "./views/TimelineView";
import SyncModal from "./views/SyncModal";
import SettingsModal from "./views/SettingsModal";
import SchedulerAgent from "./views/SchedulerAgent";

const TABS = [
  { key: "home", label: "HOME" },
  { key: "projects", label: "PROJECTS" },
  { key: "tasks", label: "TASKS & NOTES" },
  { key: "calendar", label: "CALENDAR" },
  { key: "meetings", label: "MEETINGS" },
  { key: "calls", label: "CALLS" },
  { key: "emails", label: "EMAILS" },
  { key: "companies", label: "COMPANIES" },
  { key: "people", label: "PEOPLE" },
  { key: "team", label: "TEAM" },
  { key: "vendors", label: "VENDORS" },
  { key: "aitools", label: "AI TOOLS" },
  { key: "contracts", label: "NDAs & CONTRACTS" },
  { key: "finance", label: "INVOICES" },
  { key: "timeline", label: "TIMELINE" },
];

function ImportDocumentModal({ fileInfo, onClose, onProject, onMeeting, onNote }) {
  return (
    <ModalShell title={`Imported: ${fileInfo.fileName}`} onClose={onClose}>
      <div style={{ fontSize: 13, color: "var(--dim)", marginBottom: 14 }}>
        Extracted {fileInfo.extractedText.length.toLocaleString()} characters. What should Dailie do with it?
      </div>
      <div className="md-scroll" style={{ maxHeight: 200, overflowY: "auto", padding: 12, background: "var(--panel-raised)", border: "1px solid var(--rule)", borderRadius: 8, fontSize: 12, color: "var(--dim)", whiteSpace: "pre-wrap", marginBottom: 18 }}>
        {fileInfo.extractedText.slice(0, 1200)}
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        <button className="md-btn md-btn-primary" style={{ justifyContent: "center" }} onClick={onProject}>Create a project from it</button>
        <button className="md-btn" style={{ justifyContent: "center" }} onClick={onMeeting}>Create a meeting note from it</button>
        <button className="md-btn md-btn-ghost" style={{ justifyContent: "center", border: "1px solid var(--rule)" }} onClick={onNote}>Log it to the timeline</button>
      </div>
    </ModalShell>
  );
}

function Board() {
  const store = useBoardStore();
  const { data, patch, add, currentUser, loading, saveError, reload, toast, showToast } = store;

  const [activeTab, setActiveTab] = useState("home");
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [detailProject, setDetailProject] = useState(null);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showNewMeeting, setShowNewMeeting] = useState(false);
  const [showSync, setShowSync] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [recorder, setRecorder] = useState(null);
  const [importDoc, setImportDoc] = useState(null);
  const [docSeed, setDocSeed] = useState({ title: "", body: "" });
  const [dismissedCalls, setDismissedCalls] = useState([]);
  const fileInputRef = useRef(null);

  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("dailie-theme-v1") || "dark"; } catch (e) { return "dark"; }
  });

  useEffect(() => {
    document.documentElement.classList.toggle("light-theme", theme === "light");
    try { localStorage.setItem("dailie-theme-v1", theme); } catch (e) { /* private mode */ }
  }, [theme]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowPalette((s) => !s);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /**
   * A browser will not start a screen capture without a click, so "recording comes on
   * automatically" is a prompt the moment a call with a join link begins, not a silent start.
   */
  const liveMeeting = useMemo(() => {
    if (!data.settings.autoArmRecording) return null;
    const alreadyRecorded = new Set(data.calls.map((c) => c.meetingId).filter(Boolean));
    return data.meetings.find((m) =>
      m.meetingLink &&
      !alreadyRecorded.has(m.id) &&
      !dismissedCalls.includes(m.id) &&
      Math.abs(m.date - Date.now()) < 5 * 60 * 1000) || null;
  }, [data.meetings, data.calls, data.settings.autoArmRecording, dismissedCalls]);

  // Re-pull every subscribed Google Calendar on load so meetings are current.
  const syncedOnce = useRef(false);
  useEffect(() => {
    if (loading || syncedOnce.current) return;
    const feeds = data.settings.calendarFeeds || [];
    if (!feeds.length) return;
    syncedOnce.current = true;
    (async () => {
      let added = 0;
      for (const feed of feeds) {
        try {
          const res = await fetch(`/api/calendar?url=${encodeURIComponent(feed.url)}`);
          if (!res.ok) continue;
          const text = await res.text();
          // Never import from a response that is not actually a calendar.
          if (!isICalendarFeed(text)) continue;
          const parsed = parseSyncPayload(text);
          patch((current) => {
            const map = new Map(current.meetings.map((m) => [m.id, m]));
            parsed.meetings.forEach((event) => {
              const prior = map.get(event.id);
              if (prior) map.set(event.id, { ...prior, title: event.title, date: event.date, attendees: event.attendees, meetingLink: event.meetingLink || prior.meetingLink });
              else { map.set(event.id, { ...event, followUps: [], projectId: null }); added += 1; }
            });
            return { meetings: [...map.values()].sort((a, b) => b.date - a.date) };
          });
        } catch (err) { /* offline or the feed moved — the manual sync button reports it */ }
      }
      if (added) showToast(`${added} meeting${added === 1 ? "" : "s"} pulled from Google Calendar.`, "success");
    })();
  }, [loading, data.settings.calendarFeeds, patch, showToast]);

  const refresh = async () => {
    setRefreshing(true);
    await reload();
    setTimeout(() => setRefreshing(false), 400);
  };

  const exportBoard = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dailie-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();

    if (ext === "json") {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          patch(normalizeData(parsed));
          showToast("Board restored from backup.", "success");
        } catch (err) {
          showToast("That file is not a Dailie backup.", "error");
        }
      };
      reader.readAsText(file);
      return;
    }

    try {
      const extractedText = await parseDocumentFile(file);
      setImportDoc({ fileName: file.name, extractedText });
    } catch (err) {
      showToast(`Could not read ${file.name}.`, "error");
    }
  };

  const openTab = (tab) => {
    setActiveTab(tab);
    setSearchQuery("");
  };

  const stale = useMemo(() => staleFollowUps(data), [data]);
  const openTasks = data.tasks.filter((t) => t.status !== "done").length;
  const myOpen = data.tasks.filter((t) => t.status !== "done" && (t.assigneeIds || []).includes(currentUser && currentUser.id)).length;
  const activeProjects = data.projects.filter((p) => p.stage !== "delivered" && p.stage !== "onhold").length;
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toUpperCase();

  const renderTab = () => {
    switch (activeTab) {
      case "home":
        return <HomeView onOpenTab={openTab} onOpenProject={setDetailProject} onRecord={(m) => setRecorder({ meeting: m })} />;
      case "projects":
        return <ProjectsView searchQuery={searchQuery} onOpenDetail={setDetailProject} onOpenNew={() => setShowNewProject(true)} />;
      case "tasks":
        return <TasksView searchQuery={searchQuery} />;
      case "calendar":
        return <CalendarView onOpenProject={setDetailProject} onOpenTab={openTab} onRecord={(m) => setRecorder({ meeting: m })} />;
      case "meetings":
        return <MeetingsView searchQuery={searchQuery} onRecord={(m) => setRecorder({ meeting: m })} onOpenNew={() => setShowNewMeeting(true)} />;
      case "calls":
        return <CallsView searchQuery={searchQuery} onStartRecording={(m) => setRecorder({ meeting: m })} />;
      case "emails":
        return <EmailsView searchQuery={searchQuery} onOpenTab={openTab} />;
      case "companies":
        return <CompaniesView searchQuery={searchQuery} onOpenTab={openTab} title="COMPANIES" />;
      case "people":
        return <PeopleView searchQuery={searchQuery} onOpenTab={openTab} />;
      case "team":
        return <TeamView searchQuery={searchQuery} />;
      case "vendors":
        return <CompaniesView searchQuery={searchQuery} onOpenTab={openTab} lockedType="vendor" title="VENDORS" />;
      case "aitools":
        return <CompaniesView searchQuery={searchQuery} onOpenTab={openTab} lockedType="ai-tool" title="AI TOOL RELATIONSHIPS" />;
      case "contracts":
        return <ContractsView searchQuery={searchQuery} />;
      case "finance":
        return <FinanceView searchQuery={searchQuery} />;
      default:
        return <TimelineView searchQuery={searchQuery} onRecord={(m) => setRecorder({ meeting: m })} />;
    }
  };

  return (
    <StoreProvider value={store}>
      <div className="md-root">
        <div style={{ padding: "26px 32px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <DailieBrandLogo size={42} />
              <div>
                <div className="eyebrow-badge">Matriarch Studios Operations</div>
                <div className="md-display" style={{ fontSize: 26, letterSpacing: "-0.03em", lineHeight: 1.1, marginTop: 2 }}>
                  DAILIE <span className="md-serif-it" style={{ fontSize: "0.85em", opacity: 0.9 }}>Ops Board</span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button className="md-btn md-btn-primary" onClick={() => setShowScheduler(true)}
                style={{ background: "var(--panel-raised)", border: "1px solid var(--rule-bright)", color: "var(--accent)", fontWeight: 700 }}>
                <CalendarIcon size={14} /> Meeting Scheduler
              </button>
              <button className="md-btn md-btn-primary" onClick={() => setShowAssistant((s) => !s)}
                style={{ background: "var(--accent)", color: "var(--ink)", fontWeight: 700 }}>
                <Sparkles size={14} /> Studio Assistant
              </button>
              <button className="md-btn md-btn-ghost" onClick={() => setShowPalette(true)}
                style={{ background: "var(--panel-raised)", border: "1px solid var(--rule)", fontSize: 12, padding: "6px 12px" }}>
                <Command size={13} color="var(--accent)" /> Cmd+K
              </button>
              <div style={{ position: "relative", minWidth: 170 }}>
                <Search size={14} color="var(--dim)" style={{ position: "absolute", left: 12, top: 11 }} />
                <input className="md-input" style={{ paddingLeft: 34, fontSize: 12 }} placeholder="Search board…"
                  value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>

              <NotificationCenter onOpenTab={openTab} />

              <button className="md-btn md-btn-ghost" onClick={() => setRecorder({ meeting: null })} title="Record a call" style={{ padding: 8, color: "var(--red)" }}>
                <Mic size={15} />
              </button>
              <button className="md-btn md-btn-ghost" onClick={() => setShowSync(true)} title="Connect Google Calendar" style={{ padding: 8, color: "var(--accent)" }}>
                <CalendarIcon size={15} />
              </button>
              <button className="md-btn md-btn-ghost" onClick={() => openTab("emails")} title="Emails" style={{ padding: 8, color: "var(--accent)" }}>
                <Mail size={15} />
              </button>
              <button className="md-btn md-btn-ghost" onClick={exportBoard} title="Export backup" style={{ padding: 8 }}><Download size={15} /></button>
              <button className="md-btn md-btn-ghost" onClick={() => fileInputRef.current && fileInputRef.current.click()} title="Import backup or document" style={{ padding: 8 }}>
                <Upload size={15} />
              </button>
              <input type="file" ref={fileInputRef} style={{ display: "none" }} accept=".json,.pdf,.doc,.docx,.pages,.txt,.md" onChange={importFile} />
              <button className="md-btn md-btn-ghost" onClick={() => setShowInfo(true)} title="How Dailie works" style={{ padding: 8 }}><Info size={15} /></button>
              <button className="md-btn md-btn-ghost" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))} title="Toggle theme" style={{ padding: 8, color: "var(--accent)" }}>
                {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              </button>
              <button className="md-btn md-btn-ghost" onClick={refresh} title="Reload from storage" style={{ padding: 8 }}>
                <RefreshCw size={15} className={refreshing ? "md-spin" : ""} />
              </button>

              <button className="md-btn md-btn-ghost" onClick={() => setShowSettings(true)} title="Workspace settings"
                style={{ padding: "5px 10px", border: "1px solid var(--rule)", gap: 8 }}>
                {currentUser ? <Avatar name={currentUser.name} size={22} /> : <Settings size={14} />}
                <span style={{ fontSize: 12, fontWeight: 600 }}>{currentUser ? currentUser.name.split(" ")[0] : "Set up"}</span>
              </button>
              <div className="md-mono" style={{ fontSize: 11, border: "1px solid var(--rule)", padding: "7px 14px", borderRadius: 100, color: "var(--dim)", letterSpacing: ".08em" }}>{todayLabel}</div>
            </div>
          </div>
        </div>

        <div className="md-stripe" style={{ margin: "20px 0 0" }} />

        <LiveCallBanner meeting={liveMeeting} onRecord={(m) => setRecorder({ meeting: m })}
          onDismiss={() => liveMeeting && setDismissedCalls((d) => [...d, liveMeeting.id])} />

        <div style={{ padding: "18px 32px", display: "flex", gap: 34, flexWrap: "wrap", borderBottom: "1px solid var(--rule)", alignItems: "center" }}>
          <Stat label="ACTIVE PROJECTS" value={activeProjects} onClick={() => openTab("projects")} />
          <Stat label="OPEN TASKS" value={openTasks} onClick={() => openTab("tasks")} />
          <Stat label="ASSIGNED TO ME" value={myOpen} accent={myOpen ? "var(--accent)" : undefined} onClick={() => openTab("tasks")} />
          <Stat label="NEEDS FOLLOW-UP" value={stale.length} accent={stale.length ? "var(--red)" : undefined} onClick={() => openTab("emails")} />
          <Stat label="CALLS RECORDED" value={data.calls.length} onClick={() => openTab("calls")} />
          {saveError && <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--red)" }}>{saveError}</div>}
        </div>

        <div className="md-scroll" style={{ display: "flex", gap: 26, padding: "0 32px", borderBottom: "1px solid var(--rule)", overflowX: "auto" }}>
          {TABS.map((t) => (
            <div key={t.key} className={"md-tab" + (activeTab === t.key ? " active" : "")} role="button" tabIndex={0}
              onClick={() => openTab(t.key)} onKeyDown={(e) => { if (e.key === "Enter") openTab(t.key); }}>{t.label}</div>
          ))}
          {/* Cross-zone: /production is served by the Interface microfrontend. */}
          <a className="md-tab" href="/production" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
            PRODUCTION <ExternalLink size={11} />
          </a>
        </div>

        <div style={{ padding: "24px 32px 60px" }}>
          {loading ? <LoadingState /> : renderTab()}
        </div>

        {detailProject && (
          <ProjectDetail
            project={data.projects.find((p) => p.id === detailProject.id) || detailProject}
            onClose={() => setDetailProject(null)}
            onOpenRecord={(tab) => { setDetailProject(null); openTab(tab); }}
          />
        )}
        {showNewProject && (
          <NewProjectModal
            onClose={() => { setShowNewProject(false); setDocSeed({ title: "", body: "" }); }}
            initialTitle={docSeed.title}
            initialDesc={docSeed.body}
            onCreated={(p) => setDetailProject(p)}
          />
        )}
        {showNewMeeting && (
          <NewMeetingModal
            onClose={() => { setShowNewMeeting(false); setDocSeed({ title: "", body: "" }); }}
            initialTitle={docSeed.title}
            initialNotes={docSeed.body}
          />
        )}
        {recorder && (
          <CallRecorder
            meeting={recorder.meeting}
            onClose={() => setRecorder(null)}
            onSaved={() => openTab("calls")}
          />
        )}
        {showScheduler && <SchedulerAgent onClose={() => setShowScheduler(false)} onScheduled={() => openTab("meetings")} />}
        {showSync && <SyncModal onClose={() => setShowSync(false)} />}
        {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        {showInfo && <InfoModal onClose={() => setShowInfo(false)} />}
        {showPalette && (
          <CommandPalette
            onClose={() => setShowPalette(false)}
            onSelect={(result) => {
              setShowPalette(false);
              if (result.type === "project") setDetailProject(result.item);
              else openTab(result.type === "tab" ? result.id : result.type);
            }}
          />
        )}
        {importDoc && (
          <ImportDocumentModal
            fileInfo={importDoc}
            onClose={() => setImportDoc(null)}
            onProject={() => {
              setDocSeed({ title: importDoc.fileName.replace(/\.[^/.]+$/, ""), body: importDoc.extractedText.slice(0, 500) });
              setImportDoc(null);
              setShowNewProject(true);
            }}
            onMeeting={() => {
              setDocSeed({ title: `Meeting notes: ${importDoc.fileName.replace(/\.[^/.]+$/, "")}`, body: importDoc.extractedText.slice(0, 1000) });
              setImportDoc(null);
              setShowNewMeeting(true);
            }}
            onNote={() => {
              add("logs", { date: Date.now(), text: `Imported ${importDoc.fileName}: ${importDoc.extractedText.slice(0, 200)}…`, author: currentUser ? currentUser.name : "Import" });
              setImportDoc(null);
              showToast("Document logged to the timeline.", "success");
            }}
          />
        )}
        <AIAssistantDrawer isOpen={showAssistant} onClose={() => setShowAssistant(false)} />
        <Toast toast={toast} />
      </div>
    </StoreProvider>
  );
}

export default function App() {
  return <Board />;
}
