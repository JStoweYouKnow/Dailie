import { transcribe, generateText, Output } from "ai";
import { put } from "@vercel/blob";
import { z } from "zod";

// Duration is set in vercel.json — the bare `maxDuration` export is App Router only.
// Both Whisper and the gpt-4o transcription models reject payloads over 25 MB.
// ~1 hour of the mono Opus webm the browser recorder produces lands around 15 MB.
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

const TRANSCRIPTION_MODEL = process.env.TRANSCRIBE_MODEL || "openai/whisper-1";
const SUMMARY_MODEL = process.env.SUMMARY_MODEL || "anthropic/claude-sonnet-5";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

function buildSummaryPrompt(transcript, referenceDate) {
  return `You are summarizing a recorded film/TV production call for a producer's daily log.
Today's date is ${referenceDate}.

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

  // Store the recording before transcribing. The audio is the irreplaceable artifact —
  // a transcript can always be regenerated from it, but not the other way round.
  // Without a blob store configured the app still works, just without durable playback.
  let audioPath = "";
  if (process.env.BLOB_READ_WRITE_TOKEN || process.env.VERCEL_OIDC_TOKEN) {
    try {
      const contentType = request.headers.get("content-type") || "audio/webm";
      const result = await put(`recordings/${crypto.randomUUID()}.webm`, audio, {
        access: "private",
        contentType,
      });
      audioPath = result.pathname;
    } catch (err) {
      console.error("blob upload failed", err);
    }
  }

  let transcript;
  try {
    const result = await transcribe({ model: TRANSCRIPTION_MODEL, audio });
    transcript = (result.text || "").trim();
  } catch (err) {
    console.error("transcription failed", err);
    return Response.json({ error: "Transcription failed — the recording itself was saved.", audioPath }, { status: 502 });
  }

  if (!transcript) {
    return Response.json({ transcript: "", summary: "", followUps: [], audioPath, note: "No speech was detected in the recording." });
  }

  // A failed summary must not discard a good transcript — return it either way.
  let summary = "";
  let followUps = [];
  try {
    const referenceDate = new URL(request.url).searchParams.get("date") || new Date().toISOString().slice(0, 10);
    const { output } = await generateText({
      model: SUMMARY_MODEL,
      output: Output.object({ schema: summarySchema }),
      prompt: buildSummaryPrompt(transcript, ISO_DATE.test(referenceDate) ? referenceDate : new Date().toISOString().slice(0, 10)),
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

  return Response.json({ transcript, summary, followUps, audioPath });
}
