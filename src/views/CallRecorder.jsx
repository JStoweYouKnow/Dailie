import { useState, useRef, useEffect } from "react";
import { Mic, MicOff, Monitor, RefreshCw, Plus, X, ExternalLink, Video } from "lucide-react";
import { useStore } from "../lib/store";
import { makeTask, makeParticipant, normalizeParticipants } from "../lib/model";
import { uid, formatDuration, tsFromDateInput, dateInputValue } from "../lib/format";
import { uploadFile } from "../lib/files";
import { ModalShell, Field, Avatar, Badge } from "../ui/kit";

/**
 * Tab capture records two streams at once: a small mixed-audio track that goes to
 * transcription, and the full video+audio track kept for playback. Whisper rejects
 * anything over 25 MB, so sending the video would break long calls.
 */
export default function CallRecorder({ onClose, meeting, onSaved }) {
  const { data, add, update, currentUser, showToast } = useStore();

  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [segments, setSegments] = useState([]);
  const [summary, setSummary] = useState("");
  const [nextSteps, setNextSteps] = useState([]);
  const [title, setTitle] = useState(meeting ? `Call: ${meeting.title}` : "Call Recording");
  const [projectId, setProjectId] = useState((meeting && meeting.projectId) || "");
  const [participants, setParticipants] = useState(() => normalizeParticipants((meeting && meeting.attendees) || ""));
  const [participantDraft, setParticipantDraft] = useState("");
  const [captureMode, setCaptureMode] = useState(meeting && meeting.meetingLink ? "tab" : "mic");
  const [captureError, setCaptureError] = useState("");
  const [state, setState] = useState("idle");
  const [error, setError] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [audioPath, setAudioPath] = useState("");
  const [audioNote, setAudioNote] = useState("");
  const [audioUploading, setAudioUploading] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoPath, setVideoPath] = useState("");
  const [videoNote, setVideoNote] = useState("");
  const [videoProgress, setVideoProgress] = useState(null);
  const [videoBytes, setVideoBytes] = useState(0);

  const timerRef = useRef(null);
  const audioRecorderRef = useRef(null);
  const videoRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const videoChunksRef = useRef([]);
  const streamsRef = useRef([]);
  const audioCtxRef = useRef(null);
  const recognitionRef = useRef(null);
  const placeholderRef = useRef("");

  const tabCaptureSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);

  useEffect(() => {
    if (isRecording) {
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [isRecording]);

  useEffect(() => () => teardown(), []);

  const teardown = () => {
    streamsRef.current.forEach((s) => s.getTracks().forEach((t) => t.stop()));
    streamsRef.current = [];
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (err) { /* already stopped */ }
      recognitionRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  };

  // Live preview only — it reads the default mic, so in tab mode it hears our side only.
  const startSpeechPreview = () => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return;
    const recognition = new SpeechRec();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) text += `${event.results[i][0].transcript} `;
      setTranscript(text);
    };
    try { recognition.start(); } catch (err) { return; }
    recognitionRef.current = recognition;
  };

  const transcribeAudio = async (blob) => {
    setState("running");
    setError("");
    let storedPath = "";
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/transcribe?date=${today}`, {
        method: "POST",
        headers: {
          "Content-Type": blob.type || "audio/webm",
          // Naming who was on the call is what lets the transcript attribute speakers.
          "x-participants": encodeURIComponent(JSON.stringify(participants.map((p) => p.name || p.email).filter(Boolean))),
        },
        body: blob,
      });
      if (!res.ok) {
        let message = `Transcription failed (${res.status}).`;
        if (res.status === 404) {
          message = "No transcription endpoint. Run the app with `vercel dev` so /api/transcribe is served.";
        } else {
          try {
            const body = await res.json();
            if (body && body.error) message = body.error;
            if (body && body.audioPath) { setAudioPath(body.audioPath); storedPath = body.audioPath; }
          } catch (err) { /* non-JSON body */ }
        }
        throw new Error(message);
      }
      const body = await res.json();
      setAudioPath(body.audioPath || "");
      storedPath = body.audioPath || "";
      setSegments(body.segments || []);
      if (body.transcript) {
        setTranscript(body.transcript);
        setSummary(body.summary || "");
        setNextSteps((body.followUps || []).map((f) => ({ id: uid(), text: f.text || "", owner: f.owner || "", dueDate: f.dueDate || "" })));
        setState("done");
      } else {
        setState("error");
        setError(body.note || "No speech was detected in the recording.");
      }
    } catch (err) {
      setState("error");
      setError(err.message || "Transcription failed.");
    }
    return storedPath;
  };

  /**
   * /api/transcribe stores the audio as a side effect, so that is the only thing keeping
   * a call's audio alive. When it fails — no endpoint under plain `vite dev`, a file over
   * its 25 MB ceiling, no speech detected — the call used to be saved holding a blob:
   * URL that is dead the moment the page reloads. Store it ourselves in that case.
   */
  const transcribeAndStore = async (blob, name) => {
    setAudioUploading(true);
    try {
      if (await transcribeAudio(blob)) return;
      const file = blob instanceof File
        ? blob
        : new File([blob], name || `call-${Date.now()}.webm`, { type: blob.type || "audio/webm" });
      const meta = await uploadFile(file, "recordings");
      if (meta.filePath) setAudioPath(meta.filePath);
      else setAudioNote("Audio is held for this session only — no blob store is configured, so it will not survive a reload.");
    } catch (err) {
      setAudioNote(err.message || "The audio could not be stored; it stays available until you reload.");
    } finally {
      setAudioUploading(false);
    }
  };

  const storeVideo = async (blob) => {
    setVideoUrl(URL.createObjectURL(blob));
    setVideoBytes(blob.size);
    try {
      const file = new File([blob], `call-${Date.now()}.webm`, { type: "video/webm" });
      // Anything sizeable streams straight to storage rather than through a function.
      const meta = await uploadFile(file, "video", (pct) => setVideoProgress(Math.round(pct)));
      setVideoProgress(null);
      if (meta.filePath) setVideoPath(meta.filePath);
      else setVideoNote("Video is held for this session only — no blob store is configured, so it will not survive a reload.");
    } catch (err) {
      setVideoProgress(null);
      setVideoNote(err.message || "The video could not be stored; it stays available until you reload.");
    }
  };

  const startRecording = async () => {
    setCaptureError("");
    setError("");
    setState("idle");
    setSummary("");
    setNextSteps([]);
    setSegments([]);
    setAudioPath("");
    setAudioNote("");
    setAudioUploading(false);
    setVideoPath("");
    setVideoNote("");

    let mic;
    try {
      mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamsRef.current.push(mic);
    } catch (err) {
      setCaptureError("Microphone permission is required to record a call.");
      return;
    }

    let audioStream = mic;
    let displayStream = null;

    if (captureMode === "tab") {
      try {
        // Chrome only offers "share tab audio" when video is requested too.
        displayStream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
      } catch (err) {
        teardown();
        setCaptureError("Screen sharing was cancelled. Nothing was recorded.");
        return;
      }
      streamsRef.current.push(displayStream);

      if (displayStream.getAudioTracks().length === 0) {
        teardown();
        setCaptureError('No tab audio was shared — only your own mic would have been captured. Re-share the Meet or Zoom tab and switch on "Also share tab audio".');
        return;
      }

      const Ctx = window.AudioContext || window.webkitAudioContext;
      const ctx = new Ctx();
      audioCtxRef.current = ctx;
      const dest = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(displayStream).connect(dest);
      ctx.createMediaStreamSource(mic).connect(dest);
      audioStream = dest.stream;

      const videoTrack = displayStream.getVideoTracks()[0];
      if (videoTrack) videoTrack.onended = () => stopRecording();

      // Separate recorder for playback: the picture plus the same mixed audio.
      const combined = new MediaStream([videoTrack, ...dest.stream.getAudioTracks()]);
      const videoRecorder = new MediaRecorder(combined, pickVideoOptions());
      videoChunksRef.current = [];
      videoRecorder.ondataavailable = (e) => { if (e.data.size > 0) videoChunksRef.current.push(e.data); };
      videoRecorder.onstop = () => storeVideo(new Blob(videoChunksRef.current, { type: "video/webm" }));
      videoRecorder.start();
      videoRecorderRef.current = videoRecorder;
    }

    const audioRecorder = new MediaRecorder(audioStream);
    audioChunksRef.current = [];
    audioRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
    audioRecorder.onstop = () => {
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      setAudioUrl(URL.createObjectURL(blob));
      transcribeAndStore(blob);
    };
    audioRecorder.start();
    audioRecorderRef.current = audioRecorder;

    setIsRecording(true);
    setSeconds(0);
    placeholderRef.current = captureMode === "tab"
      ? "Recording the meeting tab and your microphone. The text below is a rough local preview of your side only — the real transcript is produced when you stop."
      : "Recording call audio. The text below is a rough local preview — the real transcript is produced when you stop.";
    setTranscript(placeholderRef.current);
    startSpeechPreview();
  };

  const pickVideoOptions = () => {
    const candidates = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];
    for (const mimeType of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(mimeType)) {
        return { mimeType, videoBitsPerSecond: 800000 };
      }
    }
    return {};
  };

  const stopRecording = () => {
    [audioRecorderRef.current, videoRecorderRef.current].forEach((rec) => {
      if (rec && rec.state !== "inactive") rec.stop();
    });
    teardown();
    setIsRecording(false);
    setTranscript((t) => (t === placeholderRef.current ? "" : t));
  };

  const handleUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setAudioUrl(URL.createObjectURL(file));
    setTitle(`Call: ${file.name}`);
    setSummary("");
    setNextSteps([]);
    setAudioPath("");
    setAudioNote("");
    setAudioUploading(false);
    setTranscript("");
    transcribeAndStore(file);
  };

  const setStep = (id, field, value) => setNextSteps((s) => s.map((x) => (x.id === id ? { ...x, [field]: value } : x)));
  const addStep = () => setNextSteps((s) => [...s, { id: uid(), text: "", owner: "", dueDate: "" }]);
  const removeStep = (id) => setNextSteps((s) => s.filter((x) => x.id !== id));

  const save = () => {
    const steps = nextSteps.filter((s) => s.text.trim()).map((s) => ({ ...s, text: s.text.trim(), owner: s.owner.trim() }));

    const call = add("calls", {
      title: title.trim() || "Call Recording",
      startedAt: Date.now() - seconds * 1000,
      durationSec: seconds,
      source: captureMode === "tab" ? "meeting" : "phone",
      participants,
      segments,
      videoBytes,
      projectId: projectId || null,
      meetingId: meeting ? meeting.id : null,
      transcript,
      summary,
      nextSteps: steps,
      audioUrl: audioPath ? "" : audioUrl,
      audioPath,
      videoUrl: videoPath ? "" : videoUrl,
      videoPath,
      recordedBy: currentUser && currentUser.id,
      emailSent: false,
    });

    // Every next step becomes a real, assignable task — that is the point of capturing them.
    steps.forEach((step) => {
      const assignee = data.team.find((m) => m.name.toLowerCase() === step.owner.toLowerCase());
      add("tasks", makeTask({
        title: step.text,
        assigneeIds: assignee ? [assignee.id] : (currentUser ? [currentUser.id] : []),
        assigneeLabel: assignee ? "" : step.owner,
        dueDate: step.dueDate ? tsFromDateInput(step.dueDate) : null,
        projectId: projectId || null,
        callId: call.id,
        meetingId: meeting ? meeting.id : null,
        source: "call",
        priority: "HIGH",
      }, currentUser && currentUser.id));
    });

    if (meeting) {
      update("meetings", meeting.id, (m) => ({
        notes: [m.notes, `🎙️ ${title}\n${summary || transcript}`].filter(Boolean).join("\n\n"),
        callId: call.id,
      }));
    }

    showToast(
      steps.length
        ? `Call saved · ${steps.length} next step${steps.length === 1 ? "" : "s"} flagged as tasks.`
        : "Call saved with transcript and summary.",
      "success"
    );
    if (onSaved) onSaved(call);
    onClose();
  };

  // Everyone the board already knows about, so a participant links to a real record.
  const knownPeople = [
    ...data.people.map((p) => ({ key: `person-${p.id}`, label: p.name, email: p.email, personId: p.id })),
    ...data.team.map((m) => ({ key: `team-${m.id}`, label: m.name, email: m.email, teamMemberId: m.id })),
    ...(data.talent || []).map((t) => ({ key: `talent-${t.id}`, label: t.name, email: t.email })),
  ];

  const addParticipant = () => {
    const raw = participantDraft.trim();
    if (!raw) return;
    const known = knownPeople.find((k) => k.label.toLowerCase() === raw.toLowerCase());
    const isEmail = raw.includes("@");
    setParticipants((list) => {
      if (list.some((p) => (p.name || "").toLowerCase() === raw.toLowerCase() || (p.email && p.email === raw.toLowerCase()))) return list;
      return [...list, makeParticipant({
        name: known ? known.label : (isEmail ? raw.split("@")[0] : raw),
        email: known ? known.email || "" : (isEmail ? raw.toLowerCase() : ""),
        personId: known ? known.personId || null : null,
        teamMemberId: known ? known.teamMemberId || null : null,
      })];
    });
    setParticipantDraft("");
  };

  const canSave = !isRecording && state !== "running" && !audioUploading && !!(summary.trim() || transcript.trim());

  const modeStyle = (mode) => ({
    flex: 1, justifyContent: "center",
    borderColor: captureMode === mode ? "var(--accent)" : "var(--rule)",
    color: captureMode === mode ? "var(--accent)" : "var(--dim)",
    fontWeight: captureMode === mode ? 700 : 500,
  });

  return (
    <ModalShell wide title="Record Call" subtitle="Video, transcript, summary and next steps" onClose={onClose}>
      {meeting && meeting.meetingLink && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 12px", background: "var(--panel-raised)", border: "1px solid var(--accent)", borderRadius: 8, marginBottom: 16 }}>
          <div style={{ flex: "1 1 200px", minWidth: 0 }}>
            <div className="md-mono" style={{ fontSize: 10, color: "var(--dim)", letterSpacing: ".1em", marginBottom: 3 }}>CAPTURING</div>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meeting.title}</div>
          </div>
          <a className="md-btn md-btn-ghost" href={meeting.meetingLink} target="_blank" rel="noreferrer"
            style={{ textDecoration: "none", color: "var(--accent)", borderColor: "var(--accent)" }}>
            <ExternalLink size={13} /> Open Meeting Tab
          </a>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="CALL TITLE"><input className="md-input" value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="PROJECT">
          <select className="md-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">No project</option>
            {data.projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </Field>
      </div>

      <Field label={`PARTICIPANTS${participants.length ? ` · ${participants.length}` : ""}`}
        hint="Naming who is on the call lets the transcript label who said what.">
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: participants.length ? 9 : 0 }}>
          {participants.map((p) => (
            <span key={p.id} style={{
              display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 6px 4px 4px",
              background: "var(--panel-raised)", border: "1px solid var(--rule)", borderRadius: 100, fontSize: 12,
            }}>
              <Avatar name={p.name || p.email} size={20} />
              <span style={{ color: "var(--bone)" }}>{p.name || p.email}</span>
              <button className="md-btn md-btn-ghost" style={{ padding: 2 }} title="Remove"
                onClick={() => setParticipants((list) => list.filter((x) => x.id !== p.id))}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <input className="md-input" list="dailie-call-people" value={participantDraft}
            onChange={(e) => setParticipantDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addParticipant(); } }}
            placeholder="Add someone — pick from your people or type a name" />
          <button className="md-btn" onClick={addParticipant} disabled={!participantDraft.trim()}><Plus size={13} /></button>
        </div>
        <datalist id="dailie-call-people">
          {knownPeople.map((k) => <option key={k.key} value={k.label} />)}
        </datalist>
      </Field>

      <Field label="CAPTURE SOURCE">
        <div style={{ display: "flex", gap: 8 }}>
          <button className="md-btn" style={modeStyle("mic")} disabled={isRecording} onClick={() => setCaptureMode("mic")}>
            <Mic size={14} /> Microphone / Phone
          </button>
          <button className="md-btn" style={modeStyle("tab")} disabled={isRecording || !tabCaptureSupported} onClick={() => setCaptureMode("tab")}>
            <Video size={14} /> Zoom / Meet Tab + Video
          </button>
        </div>
      </Field>

      {captureMode === "tab" && (
        <div style={{ fontSize: 12, color: "var(--dim)", background: "var(--panel-raised)", border: "1px solid var(--rule)", borderRadius: 8, padding: "10px 12px", marginBottom: 16, lineHeight: 1.55 }}>
          {tabCaptureSupported ? (
            <>
              Captures the meeting picture and both sides of the audio. In the share picker choose the
              <strong> Chrome Tab</strong> running Zoom or Google Meet and switch on <strong>Also share tab audio</strong>.
              <div style={{ marginTop: 6, color: "var(--red)" }}>
                Chrome or Edge only, and the call must be in a browser tab — the Zoom desktop app cannot be captured. Tell participants they are being recorded.
              </div>
            </>
          ) : (
            <span style={{ color: "var(--red)" }}>This browser cannot capture tab audio. Use Chrome or Edge.</span>
          )}
        </div>
      )}

      <div style={{ padding: 16, background: "var(--panel-raised)", borderRadius: 10, border: "1px solid var(--rule)", textAlign: "center", marginBottom: 16 }}>
        <div className="md-mono" style={{ fontSize: 32, fontWeight: 800, color: isRecording ? "var(--red)" : "var(--bone)", marginBottom: 10 }}>
          {formatDuration(seconds)}
        </div>
        {!isRecording ? (
          <button className="md-btn md-btn-primary" style={{ background: "var(--red)", borderColor: "var(--red)" }}
            onClick={startRecording} disabled={(captureMode === "tab" && !tabCaptureSupported) || state === "running"}>
            <Mic size={16} /> {captureMode === "tab" ? "Share Tab & Start Recording" : "Start Recording"}
          </button>
        ) : (
          <button className="md-btn" style={{ borderColor: "var(--red)", color: "var(--red)" }} onClick={stopRecording}>
            <MicOff size={16} /> Stop & Transcribe
          </button>
        )}
        {captureError && <div style={{ color: "var(--red)", fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>{captureError}</div>}
      </div>

      <Field label="OR UPLOAD AN AUDIO FILE (.MP3, .WAV, .M4A, .WEBM)">
        <input type="file" accept="audio/*" onChange={handleUpload} disabled={isRecording || state === "running"} style={{ fontSize: 12, color: "var(--bone)" }} />
      </Field>

      {videoUrl && (
        <Field label="CALL VIDEO">
          <video controls src={videoUrl} style={{ width: "100%", borderRadius: 8, background: "#000", maxHeight: 260 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
            {videoBytes > 0 && <Badge label={`${(videoBytes / (1024 * 1024)).toFixed(1)} MB`} subtle />}
            {videoProgress != null && (
              <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: "var(--accent)" }}>
                <span style={{ width: 90, height: 4, background: "var(--panel-raised)", borderRadius: 3, overflow: "hidden" }}>
                  <span style={{ display: "block", width: `${videoProgress}%`, height: "100%", background: "var(--accent)" }} />
                </span>
                Uploading {videoProgress}%
              </span>
            )}
            {videoPath && videoProgress == null && <Badge label="STORED" color="var(--sage)" />}
          </div>
          {videoNote && <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 6 }}>{videoNote}</div>}
          {audioNote && <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 6 }}>{audioNote}</div>}
        </Field>
      )}

      {audioUrl && !videoUrl && (
        <Field label="AUDIO PLAYBACK">
          <audio controls src={audioUrl} style={{ width: "100%", height: 36 }} />
          {audioNote && <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 6 }}>{audioNote}</div>}
        </Field>
      )}

      {state === "running" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--accent)", marginBottom: 14 }}>
          <RefreshCw size={14} className="md-spin" /> Transcribing and summarising the call…
        </div>
      )}
      {state === "error" && (
        <div style={{ fontSize: 12, color: "var(--red)", marginBottom: 14, lineHeight: 1.5 }}>
          {error} Anything below is unverified — edit it before saving.
        </div>
      )}

      <Field label="SUMMARY">
        <textarea className="md-textarea" rows={4} value={summary} onChange={(e) => setSummary(e.target.value)}
          placeholder="Generated from the transcript once the recording is processed." />
      </Field>

      <Field label={`NEXT STEPS — SAVED AS TASKS${nextSteps.length ? ` · ${nextSteps.length}` : ""}`}>
        {nextSteps.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 8 }}>
            {state === "done" ? "No action items were committed to on this call." : "Suggested next steps appear here once the recording is processed."}
          </div>
        )}
        {nextSteps.map((s) => (
          <div key={s.id} style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
            <input className="md-input" style={{ flex: "2 1 200px" }} placeholder="Action item" value={s.text} onChange={(e) => setStep(s.id, "text", e.target.value)} />
            <input className="md-input" style={{ flex: "1 1 90px" }} placeholder="Owner" value={s.owner} onChange={(e) => setStep(s.id, "owner", e.target.value)} />
            <input type="date" className="md-input" style={{ flex: "1 1 120px" }} value={s.dueDate} onChange={(e) => setStep(s.id, "dueDate", e.target.value)} />
            <button className="md-btn md-btn-ghost" style={{ padding: 6 }} onClick={() => removeStep(s.id)}><X size={14} /></button>
          </div>
        ))}
        <button className="md-btn md-btn-ghost" onClick={addStep}><Plus size={13} /> Add next step</button>
      </Field>

      <Field label="FULL TRANSCRIPT">
        <textarea className="md-textarea" rows={4} value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="Transcript will appear here…" />
      </Field>

      <button className="md-btn md-btn-primary" style={{ width: "100%", justifyContent: "center", opacity: canSave ? 1 : 0.5 }} onClick={save} disabled={!canSave}>
        Save Call{nextSteps.filter((s) => s.text.trim()).length ? ` & Flag ${nextSteps.filter((s) => s.text.trim()).length} Task(s)` : ""}
      </button>
    </ModalShell>
  );
}
