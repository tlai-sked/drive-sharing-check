// Email validation: lists, separators, invisible characters, and the
// suggestion picker firing an input event.
//
// The invisible-character cases are the reason this is not one regex. A
// zero-width space survives trim(), shows nothing on screen, and fails every
// validator — leaving a user staring at an address that looks perfect.

import { loadPage, suite, assert, equal, includes } from "./harness.mjs";

const s = suite("Email validation");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ZWSP = "​";
const ZWNJ = "‌";
const ZWJ = "‍";
const BOM = "﻿";
const NBSP = " ";

const page = loadPage();
const { cleanEmail, splitEmails, oneEmailProblem, emailListProblem } = page.window;

s.test("trim does not remove the invisible characters, which is why cleanEmail exists", () => {
  const sneaky = `${ZWSP}tlai@skedulo.com${ZWSP}`;
  assert(sneaky.trim() !== "tlai@skedulo.com",
    "trim() now strips zero-width spaces — cleanEmail may be redundant, re-check it");
  equal(cleanEmail(sneaky), "tlai@skedulo.com");
});

s.test("every invisible character the paste buffer introduces is stripped", () => {
  for (const [name, ch] of [["zero-width space", ZWSP], ["zero-width non-joiner", ZWNJ],
                            ["zero-width joiner", ZWJ], ["byte-order mark", BOM],
                            ["non-breaking space", NBSP]]) {
    equal(cleanEmail(`${ch}tlai@skedulo.com${ch}`), "tlai@skedulo.com", `failed on ${name}`);
  }
});

s.test("cleanEmail survives null and undefined", () => {
  equal(cleanEmail(null), "");
  equal(cleanEmail(undefined), "");
});

s.test("a list separates on commas, semicolons and newlines", () => {
  equal(splitEmails("a@x.com, b@y.com"), ["a@x.com", "b@y.com"]);
  equal(splitEmails("a@x.com; b@y.com"), ["a@x.com", "b@y.com"]);
  equal(splitEmails("a@x.com\nb@y.com"), ["a@x.com", "b@y.com"]);
  equal(splitEmails("a@x.com,; \n b@y.com"), ["a@x.com", "b@y.com"]);
});

s.test("empty entries from trailing separators are dropped", () => {
  equal(splitEmails("a@x.com,"), ["a@x.com"]);
  equal(splitEmails(",,a@x.com,,"), ["a@x.com"]);
  equal(splitEmails(""), []);
});

s.test("duplicates are dropped regardless of case", () => {
  equal(emailListProblem("a@x.com, A@X.com").list, ["a@x.com"]);
});

s.test("each malformed address is named, with what is wrong", () => {
  equal(oneEmailProblem(""), "empty");
  equal(oneEmailProblem("a b@x.com"), "contains a space");
  equal(oneEmailProblem("@x.com"), "needs something before the @");
  equal(oneEmailProblem("a@@x.com"), "has more than one @");
  equal(oneEmailProblem("a@b@x.com"), "has more than one @");
  equal(oneEmailProblem("a@localhost"), "the domain needs a dot");
  equal(oneEmailProblem("a@x.com."), "the domain cannot end with a dot");
  equal(oneEmailProblem("tlai@skedulo.com"), "");
});

s.test("a bad address in a good list is named, not just counted", () => {
  const problem = emailListProblem("good@x.com, bad-one, also@y.com").text;
  includes(problem, "bad-one");
  equal(emailListProblem("good@x.com, bad-one").list, [],
    "a list with a bad address must yield nothing, not a partial list");
});

s.test("an address made only of invisible characters reads as empty, not as valid", () => {
  equal(oneEmailProblem(ZWSP + NBSP), "empty");
});

// ── the picker ────────────────────────────────────────────────────
// Setting input.value in code fires no input event. The picker therefore
// dispatches one by hand; without it validation keeps judging the half-typed
// text and the Save button stays disabled on a perfectly good address.

s.test("choosing a suggestion re-runs validation and unblocks Save", async () => {
  const p = loadPage();
  p.window.eval(`
    settingsKnown = true;
    monTargets = [{ id: 'folder-id-0123456789', name: 'INITIATIVES', isFile: false }];
    knownPeople = ['trung@skedulo.com'];
  `);
  const field = p.el("monEmail");
  const save = p.el("saveMonitoring");

  p.type("monEmail", "trung");
  p.window.eval("syncMonSave();");
  assert(save.disabled, "half-typed text should still block Save");

  await sleep(300);                                  // the picker debounces at 200ms
  const option = p.document.querySelector("#monEmailHits .combo-opt");
  assert(option, "no suggestion appeared for a known address");

  option.dispatchEvent(new p.window.MouseEvent("mousedown", { bubbles: true }));

  equal(field.value, "trung@skedulo.com");
  assert(!save.disabled,
    "Save is still disabled after picking — the picker did not fire an input event");
  equal(p.window.saveBlockedReason(), "");
  p.close();
});

s.test("the picker's own input event is what carries it, not the click", async () => {
  // Guards the test above: if pick() stopped dispatching, validation would be
  // stale even though the field looks right. Assert on the listener's effect.
  const p = loadPage();
  p.window.eval(`
    settingsKnown = true;
    monTargets = [{ id: 'folder-id-0123456789', name: 'X', isFile: false }];
  `);
  let fired = 0;
  p.el("monEmail").addEventListener("input", () => { fired += 1; });
  p.el("monEmail").value = "written-directly@x.com";
  equal(fired, 0, "assigning .value must not fire input — if it does, jsdom changed");
  p.el("monEmail").dispatchEvent(new p.window.Event("input", { bubbles: true }));
  equal(fired, 1);
  p.close();
});

// ── what gets saved ───────────────────────────────────────────────

s.test("the saved list is comma-joined with no spaces", () => {
  // Assert on what actually gets written to the settings file, not on a join
  // this test performs itself — otherwise the real one is free to drift.
  const p = loadPage();
  p.el("monEmail").value = "a@x.com,  b@y.com ;c@z.com";
  const saved = p.window.currentSettings().notifyEmail;
  equal(saved, "a@x.com,b@y.com,c@z.com");
  assert(!saved.includes(", "),
    "MailApp sends only to the first recipient when an address has a leading space");
  p.close();
});

s.test("Save explains itself while blocked, and says nothing when ready", () => {
  const p = loadPage();
  p.window.eval("settingsKnown = false; monTargets = [];");
  includes(p.window.saveBlockedReason(), "Loading");

  p.window.eval("settingsKnown = true;");
  includes(p.window.saveBlockedReason(), "folder");

  p.window.eval("monTargets = [{ id: 'folder-id-0123456789', name: 'X', isFile: false }];");
  p.el("monEmail").value = "";
  includes(p.window.saveBlockedReason(), "email");

  p.el("monEmail").value = "not-an-email";
  includes(p.window.saveBlockedReason(), "not-an-email");

  p.el("monEmail").value = "tlai@skedulo.com";
  equal(p.window.saveBlockedReason(), "");
  p.close();
});

await s.done();
page.close();
