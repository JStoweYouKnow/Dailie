import { useState, useEffect, useMemo, useRef } from "react";
import {
  Search, Sparkles, Sun, Moon, RefreshCw, Download, Upload, Info, Mic, Mail,
  Calendar as CalendarIcon, Settings, ExternalLink, Home, Clapperboard, CheckSquare,
  Users, Building2, Contact, UserCheck, Truck, FileText, Receipt, History,
  MoreHorizontal, ChevronLeft, ChevronRight, Plus,
} from "lucide-react";
import { StoreProvider, useBoardStore } from "./lib/store";
import { AuthGate, useAccount } from "./lib/auth";
import { normalizeData, staleFollowUps } from "./lib/model";
import { parseDocumentFile } from "./documentParser";
import { parseSyncPayload, isICalendarFeed } from "./calendarSync";
import { LoadingState, Stat, Avatar, ModalShell, Field } from "./ui/kit";
import Markdown from "./ui/Markdown";
import { IMPORT_FORMATS, pickFormat } from "./lib/textFormats";
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

/**
 * Fifteen destinations in one scrolling row asked you to read every label to find
 * anything. Grouped in a sidebar they stay one click away without competing.
 */
const NAV = [
  {
    group: null,
    items: [{ key: "home", label: "Home", icon: Home }],
  },
  {
    group: "Work",
    items: [
      { key: "projects", label: "Projects", icon: Clapperboard },
      { key: "tasks", label: "Tasks & Notes", icon: CheckSquare },
      { key: "calendar", label: "Calendar", icon: CalendarIcon },
      { key: "meetings", label: "Meetings", icon: Users },
      { key: "calls", label: "Calls", icon: Mic },
    ],
  },
  {
    group: "Relationships",
    items: [
      { key: "emails", label: "Emails", icon: Mail },
      { key: "companies", label: "Companies", icon: Building2 },
      { key: "people", label: "People", icon: Contact },
      { key: "team", label: "Team", icon: UserCheck },
      { key: "vendors", label: "Vendors", icon: Truck },
      { key: "aitools", label: "AI Tools", icon: Sparkles },
    ],
  },
  {
    group: "Business",
    items: [
      { key: "contracts", label: "NDAs & Contracts", icon: FileText },
      { key: "finance", label: "Invoices", icon: Receipt },
      { key: "timeline", label: "Timeline", icon: History },
    ],
  },
];

const ALL_TABS = NAV.flatMap((g) => g.items);

function Sidebar({ activeTab, onSelect, collapsed, onToggle, counts }) {
  return (
    <nav className={"md-sidebar" + (collapsed ? " collapsed" : "")} aria-label="Sections">
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px 20px" }}>
        <DailieBrandLogo size={26} />
        {!collapsed && (
          <div style={{ minWidth: 0 }}>
            <div className="md-display" style={{ fontSize: 15, letterSpacing: "-0.02em", lineHeight: 1 }}>DAILIE</div>
            <div className="md-mono" style={{ fontSize: 8.5, color: "var(--dim-2)", letterSpacing: ".14em", marginTop: 2 }}>MATRIARCH STUDIOS</div>
          </div>
        )}
      </div>

      {NAV.map((section, i) => (
        <div key={section.group || `s-${i}`} className="md-nav-group">
          {section.group && !collapsed && <div className="md-nav-label">{section.group}</div>}
          {section.items.map((item) => {
            const Icon = item.icon;
            const count = counts[item.key];
            return (
              <div key={item.key} role="button" tabIndex={0}
                className={"md-nav-item" + (activeTab === item.key ? " active" : "")}
                title={item.label}
                onClick={() => onSelect(item.key)}
                onKeyDown={(e) => { if (e.key === "Enter") onSelect(item.key); }}>
                <Icon size={15} style={{ flexShrink: 0 }} />
                {!collapsed && <span className="md-nav-text">{item.label}</span>}
                {!collapsed && count ? <span className="md-nav-count">{count}</span> : null}
              </div>
            );
          })}
        </div>
      ))}

      <button className="md-btn md-btn-ghost" onClick={onToggle}
        style={{ marginTop: 6, width: "100%", justifyContent: collapsed ? "center" : "flex-start", fontSize: 12 }}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
        {collapsed ? <ChevronRight size={14} /> : <><ChevronLeft size={14} /> Collapse</>}
      </button>
    </nav>
  );
}

/** Everything that used to be an icon in the header, folded into one menu. */
function OverflowMenu({ actions }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="md-btn md-btn-ghost" style={{ padding: 8 }} title="More" aria-label="More actions"
        onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="md-menu">
          {actions.map((a, i) => (
            a.divider
              ? <div key={`d-${i}`} style={{ height: 1, background: "var(--rule)", margin: "5px 2px" }} />
              : <button key={a.label} className="md-menu-item" onClick={() => { setOpen(false); a.onClick(); }}>
                  <a.icon size={14} style={{ color: "var(--dim)", flexShrink: 0 }} /> {a.label}
                </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ImportDocumentModal({ fileInfo, onClose, onImport }) {
  const formats = fileInfo.formats;
  // Nothing to preserve in a flat source, so do not offer a choice that does nothing.
  const [format, setFormat] = useState(formats.hasFormatting ? "markdown" : "text");
  const body = pickFormat(formats, format);

  const options = IMPORT_FORMATS.filter((o) => o.key !== "markdown" || formats.hasFormatting);

  return (
    <ModalShell
      wide
      title={`Import: ${fileInfo.fileName}`}
      subtitle={`${body.length.toLocaleString()} characters`}
      onClose={onClose}
    >
      <Field label="HOW SHOULD THE TEXT COME IN">
        <div style={{ display: "grid", gap: 8 }}>
          {options.map((o) => (
            <label key={o.key}
              style={{
                display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", cursor: "pointer",
                border: `1px solid ${format === o.key ? "var(--accent)" : "var(--rule)"}`,
                borderRadius: 9, background: format === o.key ? "var(--panel-raised)" : "transparent",
              }}>
              <input type="radio" name="import-format" checked={format === o.key} onChange={() => setFormat(o.key)} style={{ marginTop: 3 }} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--bone)" }}>{o.label}</span>
                <span style={{ display: "block", fontSize: 11.5, color: "var(--dim)", marginTop: 2 }}>{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
        {!formats.hasFormatting && (
          <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 9, lineHeight: 1.5 }}>
            This file carries no formatting to keep — {/\.(txt)$/i.test(fileInfo.fileName)
              ? "plain text files have none to begin with."
              : "only loose text could be recovered from it."}
          </div>
        )}
      </Field>

      <Field label="PREVIEW">
        <div className="md-scroll" style={{ maxHeight: 260, overflowY: "auto", padding: 13, background: "var(--panel-raised)", border: "1px solid var(--rule)", borderRadius: 8 }}>
          {format === "markdown"
            ? <Markdown source={body.slice(0, 4000)} />
            : <div style={{ fontSize: 12.5, color: "var(--dim)", whiteSpace: format === "compact" ? "normal" : "pre-wrap", lineHeight: 1.6 }}>
                {body.slice(0, 4000) || "Nothing was extracted from this file."}
              </div>}
        </div>
      </Field>

      <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", marginBottom: 8 }}>WHERE SHOULD IT GO</div>
      <div style={{ display: "grid", gap: 8 }}>
        <button className="md-btn md-btn-primary" style={{ justifyContent: "center" }} onClick={() => onImport("project", body)}>Create a project from it</button>
        <button className="md-btn" style={{ justifyContent: "center" }} onClick={() => onImport("meeting", body)}>Create a meeting note from it</button>
        <button className="md-btn" style={{ justifyContent: "center" }} onClick={() => onImport("note", body)}>Save it as a shared note</button>
        <button className="md-btn md-btn-ghost" style={{ justifyContent: "center", border: "1px solid var(--rule)" }} onClick={() => onImport("log", body)}>Log it to the timeline</button>
      </div>
    </ModalShell>
  );
}

function Board() {
  const store = useBoardStore();
  const { data, patch, add, currentUser, loading, saveError, reload, toast, showToast, linkAccount } = store;

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
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try { return localStorage.getItem("dailie-nav-collapsed-v1") === "1"; } catch (e) { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem("dailie-nav-collapsed-v1", navCollapsed ? "1" : "0"); } catch (e) { /* private mode */ }
  }, [navCollapsed]);
  const fileInputRef = useRef(null);

  // The signed-in account owns "who you are" — the manual picker in Settings is
  // only for boards running without auth.
  const { enabled: authEnabled, account } = useAccount();
  useEffect(() => {
    if (!authEnabled || loading || !account) return;
    linkAccount(account);
  }, [authEnabled, loading, account && account.id, linkAccount]);

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
      const formats = await parseDocumentFile(file);
      setImportDoc({ fileName: file.name, formats });
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

  const navCounts = {
    tasks: myOpen || undefined,
    emails: stale.length || undefined,
  };

  const menuActions = [
    { label: "Record a call", icon: Mic, onClick: () => setRecorder({ meeting: null }) },
    { label: "Connect Google Calendar", icon: CalendarIcon, onClick: () => setShowSync(true) },
    { label: "Meeting scheduler", icon: Sparkles, onClick: () => setShowScheduler(true) },
    { divider: true },
    { label: "Import a document", icon: Upload, onClick: () => fileInputRef.current && fileInputRef.current.click() },
    { label: "Export a backup", icon: Download, onClick: exportBoard },
    { divider: true },
    { label: theme === "dark" ? "Light mode" : "Dark mode", icon: theme === "dark" ? Sun : Moon, onClick: () => setTheme((t) => (t === "dark" ? "light" : "dark")) },
    { label: "Reload from storage", icon: RefreshCw, onClick: refresh },
    { label: "Workspace settings", icon: Settings, onClick: () => setShowSettings(true) },
    { label: "How Dailie works", icon: Info, onClick: () => setShowInfo(true) },
  ];

  const activeItem = ALL_TABS.find((t) => t.key === activeTab) || ALL_TABS[0];

  return (
    <StoreProvider value={store}>
      <div className="md-shell">
        <Sidebar
          activeTab={activeTab}
          onSelect={openTab}
          collapsed={navCollapsed}
          onToggle={() => setNavCollapsed((c) => !c)}
          counts={navCounts}
        />

        <div className="md-main">
          <header style={{
            display: "flex", alignItems: "center", gap: 12, padding: "16px 28px", flexWrap: "wrap",
            borderBottom: "1px solid var(--rule)", position: "sticky", top: 0, background: "var(--ink)", zIndex: 20,
          }}>
            <div style={{ minWidth: 0, marginRight: "auto" }}>
              <h1 className="md-display" style={{ fontSize: 19, letterSpacing: "-0.02em", lineHeight: 1.2 }}>{activeItem.label}</h1>
            </div>

            <div style={{ position: "relative", width: 210 }}>
              <Search size={14} color="var(--dim-2)" style={{ position: "absolute", left: 11, top: 10 }} />
              {/* Filters the current view. Cmd+K opens the palette for jumping records. */}
              <input className="md-input" style={{ paddingLeft: 32, fontSize: 12.5, background: "var(--panel)" }}
                placeholder="Filter this view" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>

            <button className="md-btn md-btn-ghost" onClick={() => setShowAssistant((a) => !a)}
              title="Studio Assistant" style={{ padding: 8, color: "var(--accent)" }}>
              <Sparkles size={16} />
            </button>

            <NotificationCenter onOpenTab={openTab} />
            <OverflowMenu actions={menuActions} />

            <button className="md-btn md-btn-ghost" onClick={() => setShowSettings(true)} title="Workspace settings"
              style={{ padding: 3, borderRadius: 100 }}>
              {currentUser ? <Avatar name={currentUser.name} size={26} /> : <Settings size={15} />}
            </button>

            <input type="file" ref={fileInputRef} style={{ display: "none" }} accept=".json,.pdf,.doc,.docx,.pages,.txt,.md" onChange={importFile} />
          </header>

          <LiveCallBanner meeting={liveMeeting} onRecord={(m) => setRecorder({ meeting: m })}
            onDismiss={() => liveMeeting && setDismissedCalls((d) => [...d, liveMeeting.id])} />

          {saveError && (
            <div style={{ padding: "10px 28px", fontSize: 12.5, color: "var(--red)", borderBottom: "1px solid var(--rule)" }}>{saveError}</div>
          )}

          <main style={{ padding: "24px 28px 64px" }}>
            {loading ? <LoadingState /> : renderTab()}
          </main>

          <footer style={{ padding: "0 28px 28px" }}>
            {/* Cross-zone: /production is served by the Interface microfrontend. */}
            <a href="/production" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--dim-2)", textDecoration: "none" }}>
              Production tracking <ExternalLink size={11} />
            </a>
          </footer>
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
            onImport={(destination, body) => {
              const base = importDoc.fileName.replace(/\.[^/.]+$/, "");
              setImportDoc(null);
              if (destination === "project") {
                setDocSeed({ title: base, body });
                setShowNewProject(true);
                return;
              }
              if (destination === "meeting") {
                setDocSeed({ title: `Meeting notes: ${base}`, body });
                setShowNewMeeting(true);
                return;
              }
              if (destination === "note") {
                add("notes", {
                  title: base,
                  body,
                  authorId: currentUser && currentUser.id,
                  projectId: null,
                  collaboratorIds: [],
                  comments: [],
                  updatedAt: Date.now(),
                });
                showToast(`"${base}" saved to Notes.`, "success");
                openTab("tasks");
                return;
              }
              add("logs", {
                date: Date.now(),
                text: `Imported ${importDoc.fileName}: ${body.slice(0, 300)}${body.length > 300 ? "…" : ""}`,
                author: currentUser ? currentUser.name : "Import",
              });
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
  return (
    <AuthGate>
      <Board />
    </AuthGate>
  );
}
