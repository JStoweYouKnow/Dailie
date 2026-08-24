import { generateText, Output } from "ai";
import { z } from "zod";

/**
 * The summary + follow-ups pass over a call transcript.
 *
 * Lifted out of api/transcribe.js so it can run on a transcript that arrived as text
 * rather than as an audio upload — a Google Meet transcript, a Zoom VTT — without
 * dragging the Whisper and speaker-attribution passes along with it.
 */

export const DEFAULT_SUMMARY_MODEL = process.env.SUMMARY_MODEL || "anthropic/claude-sonnet-5";

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

export function buildSummaryPrompt(transcript, referenceDate, participants) {
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

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Never throws. A failed summary must not cost the caller a good transcript, so the
 * failure comes back as an `error` field alongside empty results.
 *
 * @param {{ transcript: string, participants?: string[], referenceDate?: string, model?: string }} input
 * @returns {Promise<{ summary: string, followUps: Array<{text: string, owner: string, dueDate: string}>, error?: string }>}
 */
export async function summarizeTranscript({ transcript, participants = [], referenceDate, model = DEFAULT_SUMMARY_MODEL }) {
  const text = String(transcript || "").trim();
  if (!text) return { summary: "", followUps: [] };

  const date = ISO_DATE.test(String(referenceDate || "")) ? String(referenceDate) : today();
  const who = participants.map((p) => String(p || "").trim()).filter(Boolean).slice(0, 20);

  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: summarySchema }),
      prompt: buildSummaryPrompt(text, date, who),
    });
    return {
      summary: (output.summary || "").trim(),
      followUps: (output.followUps || [])
        .map((f) => ({
          text: String(f.text || "").trim(),
          owner: String(f.owner || "").trim(),
          // Drop anything the model returned in a shape the date input can't hold.
          dueDate: ISO_DATE.test(String(f.dueDate || "").trim()) ? String(f.dueDate).trim() : "",
        }))
        .filter((f) => f.text),
    };
  } catch (err) {
    return { summary: "", followUps: [], error: (err && err.message) || "Summary failed." };
  }
}
