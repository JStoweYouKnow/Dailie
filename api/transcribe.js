import { transcribe, generateText, Output } from "ai";
import { putOnStore } from "../lib/blobStore.js";
import { z } from "zod";

// Duration is set in vercel.json — the bare `maxDuration` export is App Router only.
// Both Whisper and the gpt-4o transcription models reject payloads over 25 MB.
// ~1 hour of the mono Opus webm the browser recorder produces lands around 15 MB.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const TRANSCRIPTION_MODEL = process.env.TRANSCRIBE_MODEL || "openai/whisper-1";
const SUMMARY_MODEL = process.env.SUMMARY_MODEL || "anthropic/claude-sonnet-5";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Whisper emits a segment every few seconds. Merging them into utterances keeps the
// speaker pass cheap and gives the transcript readable paragraphs instead of fragments.
const MERGE_GAP_SECONDS = 1.2;
const MAX_UTTERANCE_SECONDS = 30;
const MAX_ATTRIBUTED = 400;

const summarySchema = z.object({
  summary: z.string(),
  followUps: z.array(
    z.object({
      text: z.string(),
      owner: z.string(),
      dueDate: z.string(),
    })
  ),
});

const speakerSchema = z.object({
  turns: z.array(
    z.object({
      from: z.number(),
      to: z.number(),
      speaker: z.string(),
    })
  ),
});

function mergeSegments(segments) {
  const merged = [];
  for (const raw of segments) {
    const text = String(raw.text || "").trim();
    if (!text) continue;
    const start = Number(raw.startSecond) || 0;
    const end = Number(raw.endSecond) || start;
    const last = merged[merged.length - 1];
    const continues =
      last &&
      start - last.end <= MERGE_GAP_SECONDS &&
      end - last.start <= MAX_UTTERANCE_SECONDS &&
      !/[.!?]$/.test(last.text);
    if (continues) {
      last.text = `${last.text} ${text}`;
      last.end = end;
    } else {
      merged.push({ start, end, text });
    }
  }
  return merged;
}

function buildSummaryPrompt(transcript, referenceDate, participants) {
  const who = participants.length ? `\nOn the call: ${participants.join(", ")}.` : "";
  return `You are summarizing a recorded film/TV production call for a producer's daily log.
Today's date is ${referenceDate}.${who}

Return:
- summary: two or three sentences on what was actually decided or discussed.
- followUps: one entry per concrete action item someone committed to.
  - text: the action, phrased as an imperative task.
  - owner: the person responsible, only if the transcript names them. Otherwise "".
  - dueDate: YYYY-MM-DD, only if the transcript states a deadline. Resolve relative
    deadlines ("by Friday", "end of next week") against today's date. Otherwise "".

Rules:
- Use only what is in the transcript. Never invent names, numbers, dates, or commitments.
- Vague intentions ("we should catch up sometime") are not action items. Omit them.
- If nothing was committed to, return an empty followUps array.
- If the transcript is too short or garbled to summarize, set summary to
  "Transcript too short to summarize." and followUps to an empty array.

TRANSCRIPT:
${transcript}`;
}

/**
 * Whisper does not diarise. This asks the summariser to group the numbered utterances
 * into speaker turns using the known participant list. It is a best guess, flagged as
 * such in the UI and editable there.
 */
function buildSpeakerPrompt(utterances, participants) {
  const numbered = utterances.map((u, i) => `${i}: ${u.text}`).join("\n");
  return `Below is a numbered transcript of a call. Group consecutive lines into speaker turns.

${participants.length ? `The people on the call are: ${participants.join(", ")}.` : "The participants are unknown."}

Return turns: an array of { from, to, speaker } where from and to are inclusive line
numbers and speaker is who said those lines.

Rules:
- Cover every line from 0 to ${utterances.length - 1}, in order, without gaps or overlaps.
- Use a name from the participant list only when the dialogue makes it genuinely clear
  — someone is addressed by name, introduces themselves, or answers a direct question.
- When you cannot tell who is speaking, use "Speaker 1", "Speaker 2" and so on, kept
  consistent for the same voice across the call.
- Never invent a participant who is not in the list.
- Prefer fewer, longer turns over guessing a change of speaker on every line.

TRANSCRIPT:
${numbered}`;
}

export async function POST(request) {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return Response.json(
      { error: "Transcription is not configured. Set AI_GATEWAY_API_KEY in the project environment." },
      { status: 501 }
    );
  }

  let audio;
  try {
    audio = new Uint8Array(await request.arrayBuffer());
  } catch (err) {
    return Response.json({ error: "Could not read the uploaded audio." }, { status: 400 });
  }

  if (audio.byteLength === 0) {
    return Response.json({ error: "No audio was uploaded." }, { status: 400 });
  }
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    const mb = Math.round(audio.byteLength / (1024 * 1024));
    return Response.json(
      { error: `Recording is ${mb} MB. The transcription model accepts up to 25 MB — split the call into shorter segments.` },
      { status: 413 }
    );
  }

  // Participants ride along in a header because the body is the raw audio.
  let participants = [];
  try {
    const raw = request.headers.get("x-participants");
    if (raw) {
      participants = JSON.parse(decodeURIComponent(raw))
        .map((p) => String(p || "").trim())
        .filter(Boolean)
        .slice(0, 20);
    }
  } catch (err) { /* attribution simply falls back to Speaker N */ }

  // Store the recording before transcribing. The audio is the irreplaceable artifact —
  // a transcript can always be regenerated from it, but not the other way round.
  // Without a blob store configured the app still works, just without durable playback.
  let audioPath = "";
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN) {
    try {
      const contentType = request.headers.get("content-type") || "audio/webm";
      const result = await putOnStore(`recordings/${crypto.randomUUID()}.webm`, audio, {
        contentType,
      });
      audioPath = result.pathname;
    } catch (err) {
      console.error("blob upload failed", err);
    }
  }

  let transcript;
  let utterances = [];
  let durationSeconds;
  try {
    const result = await transcribe({ model: TRANSCRIPTION_MODEL, audio });
    transcript = (result.text || "").trim();
    utterances = mergeSegments(result.segments || []);
    durationSeconds = result.durationInSeconds;
  } catch (err) {
    console.error("transcription failed", err);
    return Response.json({ error: "Transcription failed — the recording itself was saved.", audioPath }, { status: 502 });
  }

  if (!transcript) {
    return Response.json({ transcript: "", summary: "", followUps: [], segments: [], audioPath, note: "No speech was detected in the recording." });
  }

  // A failed summary must not discard a good transcript — return it either way.
  let summary = "";
  let followUps = [];
  try {
    const referenceDate = new URL(request.url).searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const { output } = await generateText({
      model: SUMMARY_MODEL,
      output: Output.object({ schema: summarySchema }),
      prompt: buildSummaryPrompt(transcript, ISO_DATE.test(referenceDate) ? referenceDate : new Date().toISOString().slice(0, 10), participants),
    });
    summary = (output.summary || "").trim();
    followUps = (output.followUps || [])
      .map((f) => ({
        text: String(f.text || "").trim(),
        owner: String(f.owner || "").trim(),
        // Drop anything the model returned in a shape the date input can't hold.
        dueDate: ISO_DATE.test(String(f.dueDate || "").trim()) ? String(f.dueDate).trim() : "",
      }))
      .filter((f) => f.text);
  } catch (err) {
    console.error("summary failed", err);
  }

  // Speaker attribution is a bonus pass: an unlabelled transcript is still useful.
  let segments = utterances.map((u) => ({ ...u, speaker: "" }));
  if (utterances.length > 1 && utterances.length <= MAX_ATTRIBUTED) {
    try {
      const { output } = await generateText({
        model: SUMMARY_MODEL,
        output: Output.object({ schema: speakerSchema }),
        prompt: buildSpeakerPrompt(utterances, participants),
      });
      for (const turn of output.turns || []) {
        const from = Math.max(0, Math.floor(turn.from));
        const to = Math.min(segments.length - 1, Math.floor(turn.to));
        const speaker = String(turn.speaker || "").trim();
        if (!speaker || to < from) continue;
        for (let i = from; i <= to; i++) segments[i].speaker = speaker;
      }
    } catch (err) {
      console.error("speaker attribution failed", err);
    }
  }

  return Response.json({ transcript, summary, followUps, segments, audioPath, durationSeconds, participants });
}
