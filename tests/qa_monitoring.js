// Monitoring settings: loading, saving, and pausing.
//
// The settings live in the description of a Drive file, which is the only
// channel a web page has for reconfiguring an Apps Script project. Two things
// there are easy to get wrong and impossible to see: a key that is absent from
// the file quietly keeping its old value, and a pause writing back a whole
// settings object that clobbers something else.

import { loadPage, suite, assert, equal, includes } from "./harness.mjs";

const s = suite("Monitoring settings");

// ── loading ───────────────────────────────────────────────────────

s.test("an absent paused key reads as false, it does not keep the old value", () => {
  const page = loadPage();
  page.window.eval("monPaused = true;");
  page.window.applySettings({ version: 1, watchlist: [], notifyEmail: "a@x.com" });
  equal(page.read("monPaused"), false,
    "paused was inherited from the previous state — monitoring silently stays off");
  page.close();
});

s.test("only a real boolean true pauses", () => {
  const page = loadPage();
  for (const value of ["true", 1, "yes", {}, [], "paused"]) {
    page.window.eval("monPaused = false;");
    page.window.applySettings({ paused: value, watchlist: [] });
    equal(page.read("monPaused"), false, `${JSON.stringify(value)} should not count as paused`);
  }
  page.window.applySettings({ paused: true, watchlist: [] });
  equal(page.read("monPaused"), true);
  page.close();
});

s.test("the watchlist is replaced, not merged", () => {
  const page = loadPage();
  page.window.applySettings({
    watchlist: ["1AbCdEfGhIjKlMn", "2OpQrStUvWxYzAb"],
    watchlistNames: ["INITIATIVES", "Handover"],
  });
  equal(page.read("monTargets.map(t => t.name)"), ["INITIATIVES", "Handover"]);

  page.window.applySettings({ watchlist: ["3ZyXwVuTsRqPoNm"], watchlistNames: ["Only this"] });
  equal(page.read("monTargets.map(t => t.name)"), ["Only this"],
    "the old targets survived a load that did not mention them");
  page.close();
});

s.test("a watchlist with no names falls back to the id, not to undefined", () => {
  const page = loadPage();
  page.window.applySettings({ watchlist: ["1AbCdEfGhIjKlMn"] });
  equal(page.read("monTargets.map(t => t.name)"), ["1AbCdEfGhIjKlMn"]);
  page.close();
});

s.test("rubbish in the settings file does not wipe the screen", () => {
  const page = loadPage();
  page.window.applySettings({ watchlist: ["1AbCdEfGhIjKlMn"], watchlistNames: ["Kept"] });
  for (const junk of [null, undefined, "a string", 42]) {
    page.window.applySettings(junk);
    equal(page.read("monTargets.length"), 1, `applySettings(${JSON.stringify(junk)}) cleared the targets`);
  }
  page.close();
});

s.test("the schedule is restored, and absent parts are left alone", () => {
  const page = loadPage();
  page.el("schedFreq").value = "weekly";
  page.el("schedDay").value = "MONDAY";
  page.el("schedHour").value = "9";

  page.window.applySettings({
    watchlist: [],
    schedule: { frequency: "daily", hour: 17 },
  });
  equal(page.el("schedFreq").value, "daily");
  equal(page.el("schedHour").value, "17");
  equal(page.el("schedDay").value, "MONDAY", "an absent dayOfWeek should not blank the field");
  page.close();
});

s.test("an hour of 0 is honoured rather than treated as missing", () => {
  const page = loadPage();
  page.el("schedHour").value = "9";
  page.window.applySettings({ watchlist: [], schedule: { hour: 0 } });
  equal(page.el("schedHour").value, "0", "midnight was discarded as falsy");
  page.close();
});

// ── saving ────────────────────────────────────────────────────────

s.test("what gets written is a complete object, never a partial patch", () => {
  const page = loadPage();
  page.el("monEmail").value = "tlai@skedulo.com";
  const cfg = page.window.currentSettings();
  for (const key of ["version", "paused", "watchlist", "scanMyDrive", "notifyEmail",
                     "sendAllClearEmail", "reportInfoLevel", "reportPeopleChanges", "schedule"]) {
    assert(key in cfg, `${key} is missing — the script would inherit a stale value for it`);
  }
  page.close();
});

s.test("recipients are saved comma-joined with no spaces", () => {
  const page = loadPage();
  page.el("monEmail").value = "a@x.com, b@y.com ; c@z.com";
  equal(page.window.currentSettings().notifyEmail, "a@x.com,b@y.com,c@z.com");
  page.close();
});

s.test("the page never turns on whole-Drive scanning", () => {
  const page = loadPage();
  page.el("monEmail").value = "a@x.com";
  equal(page.window.currentSettings().scanMyDrive, false);
  page.close();
});

s.test("a saved settings object loads back unchanged", () => {
  const page = loadPage();
  page.window.eval(`
    monPaused = true;
    monTargets = [{ id: '1AbCdEfGhIjKlMn', name: 'INITIATIVES', isFile: false }];
  `);
  page.el("monEmail").value = "a@x.com,b@y.com";
  page.el("schedFreq").value = "daily";
  page.el("schedHour").value = "17";

  const saved = JSON.parse(JSON.stringify(page.window.currentSettings()));
  page.window.eval("monPaused = false; monTargets = [];");
  page.el("monEmail").value = "";

  page.window.applySettings(saved);
  equal(page.read("monPaused"), true);
  equal(page.read("monTargets.map(t => t.id)"), ["1AbCdEfGhIjKlMn"]);
  equal(page.el("monEmail").value, "a@x.com,b@y.com");
  equal(page.el("schedFreq").value, "daily");
  equal(page.el("schedHour").value, "17");
  page.close();
});

// ── pause and resume ──────────────────────────────────────────────
// setPaused must patch one flag in whatever is already on the file. Writing a
// freshly built settings object instead would silently discard anything the
// script wrote, or anything a newer version of the page does not know about.

function stubSettingsFile(page, description) {
  const patches = [];
  page.window.getSettingsToken = async () => "settings-token";
  page.window.findSettingsFile = async () => ({ id: "file-id-0123456789", description });
  page.window.fetch = async (url, opts) => {
    patches.push({ url: String(url), method: opts.method, body: JSON.parse(opts.body) });
    return { ok: true, status: 200, json: async () => ({ id: "file-id-0123456789" }) };
  };
  return patches;
}

s.test("pausing changes the paused flag and nothing else", async () => {
  const page = loadPage();
  const before = {
    version: 1, paused: false, watchlist: ["1AbCdEfGhIjKlMn"], watchlistNames: ["INITIATIVES"],
    scanMyDrive: false, notifyEmail: "a@x.com,b@y.com", sendAllClearEmail: false,
    reportInfoLevel: false, reportPeopleChanges: true,
    schedule: { frequency: "weekly", dayOfWeek: "MONDAY", hour: 9 },
    savedAt: "2026-01-01T00:00:00.000Z",
  };
  const patches = stubSettingsFile(page, JSON.stringify(before));

  equal(await page.window.setPaused(true), true);
  equal(patches.length, 1);
  equal(patches[0].method, "PATCH");

  const after = JSON.parse(patches[0].body.description);
  equal(after.paused, true);
  for (const key of Object.keys(before)) {
    if (key === "paused" || key === "savedAt") continue;
    equal(after[key], before[key], `${key} was altered by a pause`);
  }
  assert(after.savedAt !== before.savedAt, "savedAt should move when the file is rewritten");
  page.close();
});

s.test("resuming is the same patch in reverse", async () => {
  const page = loadPage();
  const patches = stubSettingsFile(page, JSON.stringify({ version: 1, paused: true, notifyEmail: "a@x.com" }));
  equal(await page.window.setPaused(false), true);
  equal(JSON.parse(patches[0].body.description).paused, false);
  equal(JSON.parse(patches[0].body.description).notifyEmail, "a@x.com");
  page.close();
});

s.test("keys this version of the page knows nothing about survive a pause", async () => {
  const page = loadPage();
  const patches = stubSettingsFile(page, JSON.stringify({
    version: 2, paused: false, somethingNewer: { keep: "me" },
  }));
  await page.window.setPaused(true);
  const after = JSON.parse(patches[0].body.description);
  equal(after.somethingNewer, { keep: "me" }, "an unknown key was dropped");
  equal(after.version, 2, "the version was rewritten");
  page.close();
});

s.test("a corrupt settings file does not stop a pause from taking effect", async () => {
  const page = loadPage();
  const patches = stubSettingsFile(page, "{ not json at all");
  equal(await page.window.setPaused(true), true);
  equal(JSON.parse(patches[0].body.description).paused, true);
  page.close();
});

s.test("with no settings file, pausing refuses and says what to do", async () => {
  const page = loadPage();
  page.window.getSettingsToken = async () => "settings-token";
  page.window.findSettingsFile = async () => null;
  page.window.fetch = async () => { throw new Error("must not be called"); };

  equal(await page.window.setPaused(true), false);
  equal(page.read("monPaused"), false, "the flag must not move when the write never happened");
  includes(page.el("monStatus").textContent, "Save");
  page.close();
});

s.test("a rejected write leaves the local flag alone", async () => {
  const page = loadPage();
  page.window.getSettingsToken = async () => "settings-token";
  page.window.findSettingsFile = async () => ({ id: "file-id-0123456789", description: "{}" });
  page.window.fetch = async () => ({ ok: false, status: 403, json: async () => ({}) });

  equal(await page.window.setPaused(true), false);
  equal(page.read("monPaused"), false,
    "the page would show Paused while the script kept running");
  page.close();
});

await s.done();
