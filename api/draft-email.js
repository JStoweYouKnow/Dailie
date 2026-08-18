import { generateText, Output } from "ai";
import { z } from "zod";

const MODEL = process.env.SUMMARY_MODEL || "anthropic/claude-sonnet-5";

const draftSchema = z.object({
  subject: z.string(),
  body: z.string(),
});

function buildPrompt({ callTitle, summary, nextSteps, recipients, sender, project, tone }) {
  const steps = (nextSteps || []).map((s, i) => `${i + 1}. ${s.text}${s.owner ? ` (owner: ${s.owner})` : ""}${s.dueDate ? ` — due ${s.dueDate}` : ""}`).join("\n");
  return `Write a short follow-up email after a film/TV production call.

CALL: ${callTitle || "Production call"}
${project ? `PROJECT: ${project}\n` : ""}FROM: ${sender || "the producer"}
TO: ${(recipients || []).join(", ") || "the participants"}
TONE: ${tone || "warm but businesslike"}

WHAT WAS DISCUSSED:
${summary || "(no summary available)"}

AGREED NEXT STEPS:
${steps || "(none recorded)"}

Rules:
- subject: specific, under 70 characters, no "Re:" prefix.
- body: plain text, no markdown, no placeholders like [NAME]. Open with one line
  thanking them and naming what was decided, then list the next steps with their
  owners, then one closing line. Sign off as ${sender || "the producer"}.
- Use only the facts above. Never invent commitments, dates, numbers or names.
- If there are no next steps, write a brief recap and propose one concrete next action.
- Keep it under 200 words.`;
}

export async function POST(request) {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return Response.json({ error: "Drafting is not configured. Set AI_GATEWAY_API_KEY in the project environment." }, { status: 501 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch (err) {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    const { output } = await generateText({
      model: MODEL,
      output: Output.object({ schema: draftSchema }),
      prompt: buildPrompt(payload || {}),
    });
    return Response.json({ subject: (output.subject || "").trim(), body: (output.body || "").trim() });
  } catch (err) {
    console.error("draft failed", err);
    return Response.json({ error: "Could not draft the email." }, { status: 502 });
  }
}
