import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

/**
 * Mail arrives whether or not anyone has the app open, so the capture of it should
 * too. Half-hourly is frequent enough that the board is never far behind, and each
 * run reads only what has landed since the last one.
 */
const crons = cronJobs();

crons.interval("sync gmail", { minutes: 30 }, internal.gmail.syncMailboxes, {});

export default crons;
