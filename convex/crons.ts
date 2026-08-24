import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Mail arrives whether or not anyone has the app open, so the capture of it should
 * too. Half-hourly is frequent enough that the board is never far behind, and each
 * run reads only what has landed since the last one.
 */
const crons = cronJobs();

crons.interval("sync gmail", { minutes: 30 }, internal.gmail.syncMailboxes, {});

/**
 * Notes shared in from another organisation appear whenever that organisation's
 * note-taker finishes, which is neither prompt nor predictable. Hourly is enough, and
 * each run costs a model call per new doc.
 */
crons.interval("sync meeting notes", { hours: 1 }, internal.driveNotes.syncNotes, {});

/**
 * Meet publishes a transcript within minutes of a conference ending, and entries are
 * deleted after 30 days — so this runs often enough that several failed runs in a row
 * still leave a wide margin before anything is lost for good.
 */
crons.interval("sync meet transcripts", { minutes: 30 }, internal.meet.syncTranscripts, {});

export default crons;
