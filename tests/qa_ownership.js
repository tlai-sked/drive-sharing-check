// Files owned by other people are not ours to change.
//
// Drive would refuse the write anyway, but the API is not the point: quietly
// re-sharing another team's document is not something this tool should do. The
// only honest action is to tell the person who can, so these files get a
// "Remind owner" button, no tick box, and no place in the plan.
//
// The trap this suite exists for: `capabilities.canShare` is true on a file
// somebody granted you manage rights to, which you still do not own. Gating on
// canShare alone lets you change other people's sharing.

import { loadPage, suite, assert, equal, includes } from "./harness.mjs";

const s = suite("Other people's files");

const ME = "tlai@skedulo.com";
const THEM = "trung@skedulo.com";

function finding(over = {}) {
  return {
    id: "driveid00000001", risk: "Critical", icon: "globe",
    name: "Q4 plan", perm: "Anyone with the link can edit",
    createdIso: "2026-01-05T00:00:00.000Z", modifiedIso: "2026-09-01T00:00:00.000Z",
    created: "2026", parentId: null, folder: null, isFolder: false,
    ownedByMe: true, ownerEmail: ME, canShare: true,
    permId: "p-any", permKind: "anyone", permRole: "writer",
    permIndexed: false, permDomain: null,
    url: "https://drive.google.com/open?id=driveid00000001",
    ...over,
  };
}

function show(page, findings) {
  const counts = { Critical: 0, Warning: 0, Info: 0, OK: 0 };
  for (const f of findings) counts[f.risk] += 1;
  page.window.render({
    findings, counts, owned: findings.length, scope: "owned",
    signedInAs: ME, unreadable: 0, failedTargets: [], truncated: false,
    scannedAt: new Date("2026-09-12T09:00:00.000Z"),
  });
  return [...page.document.querySelectorAll(".row")];
}

const cell = (row) => row.querySelector(".fix-cell");

// ── the rule ──────────────────────────────────────────────────────

s.test("only a file you own and can share is fixable", () => {
  const page = loadPage();
  const { canFix } = page.window;
  equal(canFix({ ownedByMe: true, canShare: true }), true);
  equal(canFix({ ownedByMe: false, canShare: false }), false);
  equal(canFix({ ownedByMe: true, canShare: false }), false);
  page.close();
});

s.test("manage rights on someone else's file are still not ownership", () => {
  // The whole reason this is not gated on canShare alone.
  const page = loadPage();
  equal(page.window.canFix({ ownedByMe: false, canShare: true }), false,
    "a file you were granted manage rights on is still not yours to change");
  page.close();
});

// ── what the row offers ───────────────────────────────────────────

s.test("your own file gets Change and a tick box", () => {
  const page = loadPage();
  const [row] = show(page, [finding()]);
  assert(cell(row).querySelector(".fix-btn"), "no Change button on a file you own");
  assert(row.querySelector(".row-box"), "no tick box on a file you own");
  assert(!cell(row).querySelector(".remind-btn"));
  page.close();
});

s.test("someone else's file offers Remind owner instead of Change", () => {
  const page = loadPage();
  const [row] = show(page, [finding({ ownedByMe: false, ownerEmail: THEM })]);
  assert(!cell(row).querySelector(".fix-btn"), "a Change button was offered on someone else's file");
  const remind = cell(row).querySelector(".remind-btn");
  assert(remind, "no Remind owner button");
  includes(remind.textContent, "Remind");
  includes(remind.title, THEM, "the button should name who gets the email");
  includes(remind.title, "Nothing", "it must say that nothing is changed");
  page.close();
});

s.test("someone else's file cannot be ticked, so it cannot be bulk-changed", () => {
  const page = loadPage();
  const [row] = show(page, [finding({ ownedByMe: false, ownerEmail: THEM })]);
  equal(row.querySelector(".row-box"), null,
    "it can be selected, and Change selected would try to write to it");
  page.close();
});

s.test("a file you own but cannot share says so, and offers nothing", () => {
  const page = loadPage();
  const [row] = show(page, [finding({ canShare: false })]);
  assert(!cell(row).querySelector(".fix-btn"));
  assert(!cell(row).querySelector(".remind-btn"), "there is nobody else to remind — you own it");
  includes(cell(row).querySelector(".no-share").textContent, "Cannot change");
  page.close();
});

s.test("someone else's file with no known owner falls back to plain text", () => {
  const page = loadPage();
  const [row] = show(page, [finding({ ownedByMe: false, ownerEmail: null })]);
  assert(!cell(row).querySelector(".remind-btn"), "a mailto with no address is a dead button");
  includes(cell(row).querySelector(".no-share").textContent, "Owner only");
  page.close();
});

s.test("the row still says who owns it", () => {
  const page = loadPage();
  const [row] = show(page, [finding({ ownedByMe: false, ownerEmail: THEM })]);
  includes(row.querySelector(".row-owner").textContent, THEM);
  page.close();
});

s.test("Open still works on a file you do not own", () => {
  // Not changing it does not mean hiding it.
  const page = loadPage();
  const [row] = show(page, [finding({ ownedByMe: false, ownerEmail: THEM })]);
  const open = cell(row).querySelector(".row-open");
  assert(open, "no way to open the file");
  includes(open.getAttribute("href"), "driveid00000001");
  page.close();
});

// ── the reminder ──────────────────────────────────────────────────

s.test("the reminder is addressed to the owner and names the file", () => {
  const page = loadPage();
  const [row] = show(page, [finding({ ownedByMe: false, ownerEmail: THEM })]);
  const url = page.window.remindMailto(row);
  assert(url.startsWith("mailto:" + THEM), `wrong recipient: ${url.slice(0, 60)}`);

  const body = decodeURIComponent(new URL(url).searchParams.get("body"));
  includes(body, "Q4 plan");
  includes(body, "https://drive.google.com/open?id=driveid00000001");
  includes(body, "Anyone with the link can edit");
  includes(body, "Critical");
  includes(body, "not touched it", "the message must say nothing was changed");
  includes(body, ME, "it should sign off as whoever ran the check");
  page.close();
});

s.test("the subject names the file too, so a busy owner can triage it", () => {
  const page = loadPage();
  const [row] = show(page, [finding({ ownedByMe: false, ownerEmail: THEM })]);
  const subject = decodeURIComponent(new URL(page.window.remindMailto(row)).searchParams.get("subject"));
  includes(subject, "Q4 plan");
  includes(subject, "Drive sharing");
  page.close();
});

s.test("no owner address means no mailto at all", () => {
  const page = loadPage();
  const [row] = show(page, [finding({ ownedByMe: false, ownerEmail: null })]);
  equal(page.window.remindMailto(row), null);
  equal(page.window.remindMailto(null), null);
  page.close();
});

s.test("a file name with quotes or an ampersand survives the mailto", () => {
  const page = loadPage();
  const [row] = show(page, [finding({
    ownedByMe: false, ownerEmail: THEM, name: 'Q4 "plan" & budget',
  })]);
  const url = page.window.remindMailto(row);
  const subject = decodeURIComponent(new URL(url).searchParams.get("subject"));
  includes(subject, 'Q4 "plan" & budget',
    "the ampersand split the mailto into another parameter");
  page.close();
});

// ── the access dialog ─────────────────────────────────────────────

s.test("the dialog refuses a selection of only other people's files", () => {
  const page = loadPage();
  const rows = show(page, [finding({ ownedByMe: false, ownerEmail: THEM })]);
  page.window.openAccess(rows);
  equal(page.el("accessScrim").hidden, true, "the change dialog opened for a file we cannot change");
  includes(page.el("notice").textContent, "not yours");
  page.close();
});

s.test("a mixed selection proceeds with only the files you own", () => {
  const page = loadPage();
  const rows = show(page, [
    finding({ id: "driveid00000001", name: "Mine" }),
    finding({ id: "driveid00000002", name: "Theirs", ownedByMe: false, ownerEmail: THEM }),
  ]);
  equal(rows.length, 2);
  page.window.openAccess(rows);
  equal(page.el("accessScrim").hidden, false, "the dialog should still open for the file you own");
  includes(page.el("accessSub").textContent, "Mine",
    "it should be scoped to the one file you can actually change");
  page.close();
});

// ── the plan ──────────────────────────────────────────────────────

s.test("the plan counts only what you can actually fix", () => {
  const page = loadPage();
  show(page, [
    finding({ id: "driveid00000001", risk: "Critical" }),
    finding({ id: "driveid00000002", risk: "Warning", ownedByMe: false, ownerEmail: THEM }),
    finding({ id: "driveid00000003", risk: "Critical", ownedByMe: false, ownerEmail: THEM }),
  ]);
  equal(page.read("plan.counts"), { Critical: 1, Warning: 0 },
    "time was budgeted for files that cannot be changed here");
  page.close();
});

s.test("the summary still counts everything, including what you cannot fix", () => {
  // You want to know about a risk even when you cannot act on it yourself.
  const page = loadPage();
  show(page, [
    finding({ id: "driveid00000001", risk: "Critical" }),
    finding({ id: "driveid00000002", risk: "Critical", ownedByMe: false, ownerEmail: THEM }),
  ]);
  equal(page.document.querySelectorAll(".row").length, 2, "a finding was hidden from the results");
  page.close();
});

s.test("nothing fixable means no Plan button", () => {
  const page = loadPage();
  show(page, [finding({ ownedByMe: false, ownerEmail: THEM })]);
  equal(page.el("planBtn").hidden, true,
    "planning time to fix files nobody here can fix");
  page.close();
});

s.test("the footer says how many are owned by others, and what to do", () => {
  const page = loadPage();
  show(page, [
    finding({ id: "driveid00000001" }),
    finding({ id: "driveid00000002", ownedByMe: false, ownerEmail: THEM }),
    finding({ id: "driveid00000003", ownedByMe: false, ownerEmail: THEM }),
  ]);
  const foot = page.el("foot").textContent;
  includes(foot, "2");
  includes(foot, "Remind owner");
  page.close();
});

s.test("the footer stays quiet when everything is yours", () => {
  const page = loadPage();
  show(page, [finding()]);
  assert(!page.el("foot").textContent.includes("Remind owner"),
    "a caveat appeared about other people's files when there are none");
  page.close();
});

// ── select all ────────────────────────────────────────────────────

s.test("Select all counts only the files it can actually select", () => {
  const page = loadPage();
  show(page, [
    finding({ id: "driveid00000001" }),
    finding({ id: "driveid00000002", ownedByMe: false, ownerEmail: THEM }),
    finding({ id: "driveid00000003", ownedByMe: false, ownerEmail: THEM }),
  ]);
  const label = page.document.querySelector(".select-all");
  assert(label, "no Select all control");
  includes(label.textContent, "Select all 1",
    "it promises a bulk change over files that cannot be changed");
  includes(page.document.querySelector(".grouphead .count").textContent, "3",
    "the group should still report every finding");
  page.close();
});

s.test("Select all really does tick only your own files", () => {
  const page = loadPage();
  show(page, [
    finding({ id: "driveid00000001", name: "Mine" }),
    finding({ id: "driveid00000002", name: "Theirs", ownedByMe: false, ownerEmail: THEM }),
  ]);
  const box = page.document.querySelector(".select-all-box");
  box.checked = true;
  box.dispatchEvent(new page.window.Event("change", { bubbles: true }));

  const picked = [...page.document.querySelectorAll(".row-box:checked")]
    .map((b) => b.closest(".row").dataset.fileName);
  equal(picked, ["Mine"]);
  page.close();
});

s.test("a group with nothing changeable offers no Select all at all", () => {
  const page = loadPage();
  show(page, [finding({ ownedByMe: false, ownerEmail: THEM })]);
  equal(page.document.querySelector(".select-all"), null,
    "a Select all that can select nothing is a dead control");
  page.close();
});

// ── phones ────────────────────────────────────────────────────────

s.test("the Remind button is laid out for a phone, like the others", () => {
  const page = loadPage({ width: 390 });
  const css = [...page.document.querySelectorAll("style")].map((n) => n.textContent).join("\n");
  const start = css.lastIndexOf("@media (max-width: 640px) {");
  const block = css.slice(start);
  assert(/\.row \.fix-btn, \.row \.remind-btn, \.row \.no-share, \.row \.row-open \{/.test(block),
    "the Remind button is not in the phone rule that gives these a 44px touch target");
  assert(/\.row \.remind-btn \{[^}]*color/.test(block), "no phone colour for the Remind button");
  page.close();
});

s.test("a phone shows the same actions as a desktop", () => {
  const page = loadPage({ width: 390 });
  const [mine] = show(page, [finding()]);
  assert(mine.querySelector(".fix-btn"), "no Change button at 390px");

  const [theirs] = show(page, [finding({ ownedByMe: false, ownerEmail: THEM })]);
  assert(theirs.querySelector(".remind-btn"), "no Remind owner button at 390px");
  assert(!theirs.querySelector(".row-box"), "someone else's file could be ticked at 390px");
  page.close();
});

await s.done();
