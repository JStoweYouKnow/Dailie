import { test } from "node:test";
import assert from "node:assert/strict";
import { isHouseEmail, lockMailboxSettings, lockSharedSettings, memberBindPlan, redactSettingsForViewer } from "../src/lib/houseAccess.js";
import { safeHref } from "../src/lib/safeUrl.js";
import { fileSrc, imageSrc } from "../src/lib/files.js";
import { isSharedCollection } from "../src/lib/sharedBoard.js";
import { isAllowedContentType } from "../lib/allowedUploads.js";
import { rateLimit } from "../lib/rateLimit.js";

test("isHouseEmail allows studio domains and subdomains only", () => {
  assert.equal(isHouseEmail("elena@matriarch-studios.com"), true);
  assert.equal(isHouseEmail("ops@thewizardofops.app"), true);
  assert.equal(isHouseEmail("help@mail.matriarch-studios.com"), true);
  assert.equal(isHouseEmail("guest@gmail.com"), false);
  assert.equal(isHouseEmail("not-matriarch-studios.com@evil.test"), false);
  assert.equal(isHouseEmail(""), false);
});

test("lockSharedSettings keeps contractor writes from changing mailboxes and iCal feeds", () => {
  const prior = {
    emailAccounts: [{ id: "acct-1", address: "elena@matriarch-studios.com" }],
    calendarFeeds: [{ id: "feed-1", label: "Ops", url: "https://calendar.google.com/calendar/ical/secret/private-abc/basic.ics" }],
  };
  const locked = lockSharedSettings(
    {
      followUpDays: 21,
      emailAccounts: [{ id: "x", address: "victim@other.com" }],
      calendarFeeds: [{ id: "x", label: "Stolen", url: "https://evil.example/feed" }],
    },
    { isHouse: false, prior }
  );
  assert.equal(locked.followUpDays, 21);
  assert.deepEqual(locked.emailAccounts, prior.emailAccounts);
  assert.deepEqual(locked.calendarFeeds, prior.calendarFeeds);
});

test("redactSettingsForViewer strips iCal URLs for non-house readers", () => {
  const settings = {
    calendarFeeds: [{ id: "feed-1", label: "Ops", url: "https://calendar.google.com/calendar/ical/secret/private-abc/basic.ics" }],
  };
  assert.equal(redactSettingsForViewer(settings, { isHouse: true }).calendarFeeds[0].url, settings.calendarFeeds[0].url);
  assert.equal(redactSettingsForViewer(settings, { isHouse: false }).calendarFeeds[0].url, "");
  assert.equal(redactSettingsForViewer(settings, { isHouse: false }).calendarFeeds[0].label, "Ops");
});

test("memberBindPlan will not rebind a claimed email to a new Clerk id", () => {
  const prior = { _id: "row1", clerkId: "user_old", email: "elena@matriarch-studios.com", name: "Elena" };
  assert.deepEqual(
    memberBindPlan({
      clerkId: "user_new",
      identityEmail: "elena@matriarch-studios.com",
      emailVerified: true,
      byClerk: null,
      byEmail: prior,
    }),
    { action: "create", claimEmail: false }
  );
  assert.deepEqual(
    memberBindPlan({
      clerkId: "user_old",
      identityEmail: "elena@matriarch-studios.com",
      emailVerified: true,
      byClerk: prior,
      byEmail: null,
    }),
    { action: "update", target: prior, claimEmail: true }
  );
  assert.deepEqual(
    memberBindPlan({
      clerkId: "user_new",
      identityEmail: "guest@gmail.com",
      emailVerified: false,
      byClerk: null,
      byEmail: { clerkId: "user_other", email: "guest@gmail.com" },
    }),
    { action: "create", claimEmail: false }
  );
  assert.equal(
    memberBindPlan({
      clerkId: "user_new",
      identityEmail: "ops@thewizardofops.app",
      emailVerified: true,
      byClerk: null,
      byEmail: { clerkId: "", email: "ops@thewizardofops.app" },
    }).action,
    "update"
  );
});

test("lockMailboxSettings keeps contractor writes from changing synced inboxes", () => {
  const prior = [{ id: "acct-1", address: "elena@matriarch-studios.com" }];
  const locked = lockMailboxSettings(
    { followUpDays: 21, emailAccounts: [{ id: "x", address: "victim@other.com" }] },
    { isHouse: false, priorAccounts: prior }
  );
  assert.equal(locked.followUpDays, 21);
  assert.deepEqual(locked.emailAccounts, prior);

  const house = lockMailboxSettings(
    { emailAccounts: [{ id: "x", address: "ops@thewizardofops.app" }] },
    { isHouse: true, priorAccounts: prior }
  );
  assert.equal(house.emailAccounts[0].address, "ops@thewizardofops.app");
});

test("safeHref allows http(s) and mailto only", () => {
  assert.equal(safeHref("https://meet.google.com/abc-defg-hij"), "https://meet.google.com/abc-defg-hij");
  assert.equal(safeHref("http://localhost:3000/ok"), "http://localhost:3000/ok");
  assert.equal(safeHref("mailto:ops@thewizardofops.app"), "mailto:ops@thewizardofops.app");
  assert.equal(safeHref("javascript:alert(1)"), "");
  assert.equal(safeHref("data:text/html,<script>alert(1)</script>"), "");
  assert.equal(safeHref(""), "");
});

test("fileSrc prefers the authenticated proxy over a public blob URL", () => {
  const src = fileSrc({
    filePath: "documents/nda.pdf",
    fileUrl: "https://abc.public.blob.vercel-storage.com/documents/nda.pdf",
  });
  assert.equal(src, "/api/files?path=documents%2Fnda.pdf");
  assert.equal(fileSrc({ fileUrl: "javascript:alert(1)" }), "");
  assert.match(fileSrc({ fileUrl: "data:text/plain,hello" }), /^data:/);
});

test("imageSrc prefers the stored path", () => {
  assert.equal(
    imageSrc({ imagePath: "images/still.jpg", imageUrl: "https://evil.example/x" }),
    "/api/files?path=images%2Fstill.jpg"
  );
  assert.equal(imageSrc({ imageUrl: "javascript:alert(1)" }), "");
});

test("isSharedCollection rejects unknown board tables", () => {
  assert.equal(isSharedCollection("projects"), true);
  assert.equal(isSharedCollection("members"), false);
  assert.equal(isSharedCollection("workspace"), false);
});

test("isAllowedContentType rejects HTML and unmarked binaries", () => {
  assert.equal(isAllowedContentType("application/pdf"), true);
  assert.equal(isAllowedContentType("image/png; charset=binary"), true);
  assert.equal(isAllowedContentType("text/html"), false);
  assert.equal(isAllowedContentType("application/octet-stream"), false);
});

test("rateLimit trips after the window fills", () => {
  const key = `test-${Date.now()}`;
  assert.equal(rateLimit({ key, limit: 2, windowMs: 60_000 }).error, undefined);
  assert.equal(rateLimit({ key, limit: 2, windowMs: 60_000 }).error, undefined);
  assert.equal(rateLimit({ key, limit: 2, windowMs: 60_000 }).error.status, 429);
});
