// The scheduled watcher: baseline diffing, nested folders, paused runs and
// recipient lists.
//
// This half of the tool runs unattended and reports by email, so its failure
// mode is silence. A query that matches nothing, a baseline that never loads
// and a recipient list that drops every address but the first all look exactly
// like "nothing has changed".

import { loadAppsScript, suite, assert, equal, includes } from "./harness.mjs";

const s = suite("Apps Script watcher");

const FOLDER_MIME = "application/vnd.google-apps.folder";
const id = (n) => `driveid${String(n).padStart(8, "0")}`;      // 15 chars, as Drive ids are

function file(fileId, name, opts = {}) {
  return {
    id: fileId,
    name,
    mimeType: opts.folder ? FOLDER_MIME : "application/vnd.google-apps.document",
    webViewLink: `https://drive.google.com/open?id=${fileId}`,
    ownedByMe: opts.ownedByMe !== false,
    owners: [{ emailAddress: opts.owner || "tlai@skedulo.com" }],
    permissions: opts.permissions || [],
  };
}

/** A Drive whose folder tree is described by `children`. */
function fakeDrive(files, children = {}) {
  return {
    Files: {
      get(fileId) {
        if (!files[fileId]) throw new Error(`File not found: ${fileId}`);
        return files[fileId];
      },
      list({ q }) {
        const m = /^'([^']+)' in parents/.exec(q);
        const kids = (m && children[m[1]]) || [];
        return { files: kids.map((k) => files[k]), nextPageToken: null };
      },
      create: () => ({ id: "created" }),
      update: () => ({ id: "updated" }),
    },
    About: { get: () => ({ user: { emailAddress: "tlai@skedulo.com" } }) },
  };
}

const anyone = (role = "reader", indexed = false) =>
  ({ id: "p-any", type: "anyone", role, allowFileDiscovery: indexed });
const domain = (role = "reader") =>
  ({ id: "p-dom", type: "domain", role, domain: "skedulo.com" });
const person = (email, role = "writer") =>
  ({ id: `p-${email}`, type: "user", role, emailAddress: email });
const owner = (email) => ({ id: "p-own", type: "user", role: "owner", emailAddress: email });

// ── reading a reference ───────────────────────────────────────────

s.test("a Drive link of any shape yields its id", () => {
  const a = loadAppsScript();
  equal(a.call("idFromRef_", "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMn"), "1AbCdEfGhIjKlMn");
  equal(a.call("idFromRef_", "https://docs.google.com/document/d/1AbCdEfGhIjKlMn/edit"), "1AbCdEfGhIjKlMn");
  equal(a.call("idFromRef_", "https://drive.google.com/open?id=1AbCdEfGhIjKlMn"), "1AbCdEfGhIjKlMn");
  equal(a.call("idFromRef_", "  1AbCdEfGhIjKlMn  "), "1AbCdEfGhIjKlMn");
});

s.test("anything shorter than a real id is refused", () => {
  // A fixture using 'F' as an id scans nothing at all, and says nothing about it.
  const a = loadAppsScript();
  equal(a.call("idFromRef_", "F"), null);
  equal(a.call("idFromRef_", "short"), null);
  equal(a.call("idFromRef_", "12345678901234"), null, "14 characters should still be refused");
  equal(a.call("idFromRef_", "123456789012345"), "123456789012345", "15 characters is an id");
  equal(a.call("idFromRef_", ""), null);
  equal(a.call("idFromRef_", null), null);
});

// ── classification ────────────────────────────────────────────────

s.test("anyone-with-link is Critical, and being indexed is said out loud", () => {
  const a = loadAppsScript();
  equal(a.call("classify_", [anyone("reader")]).level, "Critical");
  includes(a.call("classify_", [anyone("writer")]).label, "edit");
  includes(a.call("classify_", [anyone("reader", true)]).label, "indexed by Google");
});

s.test("org-wide edit is a Warning, org-wide view only Info", () => {
  const a = loadAppsScript();
  equal(a.call("classify_", [domain("writer")]).level, "Warning");
  equal(a.call("classify_", [domain("fileOrganizer")]).level, "Warning");
  equal(a.call("classify_", [domain("reader")]).level, "Info");
  equal(a.call("classify_", [domain("commenter")]).level, "Info");
  includes(a.call("classify_", [domain("reader")]).label, "skedulo.com");
});

s.test("named people alone are not a finding, and the owner is never one", () => {
  const a = loadAppsScript();
  equal(a.call("classify_", [person("trung@skedulo.com")]).level, "OK");
  equal(a.call("classify_", [owner("tlai@skedulo.com")]).level, "OK");
  equal(a.call("classify_", []).level, "OK");
  equal(a.call("classify_", null).level, "OK");
});

s.test("the widest grant wins, whatever order they arrive in", () => {
  const a = loadAppsScript();
  equal(a.call("classify_", [domain("reader"), anyone("reader"), person("x@y.com")]).level, "Critical");
  equal(a.call("classify_", [anyone("reader"), domain("reader")]).level, "Critical");
  equal(a.call("classify_", [person("x@y.com"), domain("writer")]).level, "Warning");
});

s.test("the page and the script rank risk identically", () => {
  const a = loadAppsScript();
  equal(a.read("RANK"), { OK: 0, Info: 1, Warning: 2, Critical: 3 });
  equal(a.read("Object.keys(EDIT_ROLES).sort()"), ["fileOrganizer", "organizer", "writer"]);
});

// ── the baseline ──────────────────────────────────────────────────

s.test("never having run is not the same as having found nothing", () => {
  const a = loadAppsScript();
  equal(a.call("loadBaseline_"), null, "a missing baseline must read as null, not {}");
  a.call("saveBaseline_", {});
  equal(a.call("loadBaseline_"), {}, "an empty baseline is a real answer and must survive");
});

s.test("a baseline survives the round trip", () => {
  const a = loadAppsScript();
  const map = { [id(1)]: { name: "Plan", level: "Critical", people: ["anyone:reader:"] } };
  a.call("saveBaseline_", map);
  equal(a.call("loadBaseline_"), map);
});

s.test("a baseline larger than one property is chunked and rejoined", () => {
  const a = loadAppsScript();
  const map = {};
  for (let i = 0; i < 400; i += 1) {
    map[id(i)] = { name: `File number ${i} with a long enough name to pass the chunk size`,
                   level: "Warning", people: [`user:writer:person${i}@skedulo.com`] };
  }
  a.call("saveBaseline_", map);
  assert(JSON.stringify(map).length > 8000, "the fixture is too small to force chunking");
  assert(Number(a.props.get("baseline_chunks")) > 1, "it was not chunked at all");
  equal(a.call("loadBaseline_"), map);
});

s.test("re-saving does not leave orphaned chunks in storage", () => {
  // loadBaseline_ reads only as many chunks as the count says, so orphans do
  // not corrupt the result — they just sit there consuming the property quota,
  // invisibly, until writing the baseline starts failing. Assert on storage.
  const a = loadAppsScript();
  const big = {};
  for (let i = 0; i < 400; i += 1) big[id(i)] = { name: `x${i}`.repeat(20), level: "Warning" };
  a.call("saveBaseline_", big);
  assert(Number(a.props.get("baseline_chunks")) > 1, "the fixture did not force chunking");

  a.call("saveBaseline_", { [id(1)]: { name: "small", level: "OK" } });
  equal(a.call("loadBaseline_"), { [id(1)]: { name: "small", level: "OK" } });

  const stored = [...a.props.keys()].filter((k) => k.startsWith("baseline_") && k !== "baseline_chunks");
  equal(stored.length, Number(a.props.get("baseline_chunks")),
    `${stored.length} chunk properties remain for a ${a.props.get("baseline_chunks")}-chunk baseline`);
});

s.test("an unreadable baseline reads as never-run rather than crashing the run", () => {
  const a = loadAppsScript();
  a.props.set("baseline_chunks", "1");
  a.props.set("baseline_0", "{ this is not json");
  equal(a.call("loadBaseline_"), null);
});

// ── change detection ──────────────────────────────────────────────

const watchedItem = (name, level, people) =>
  ({ name, level, label: level, url: "https://drive.google.com/open?id=x",
     isFolder: false, owner: "tlai@skedulo.com", mine: true, people, source: "INITIATIVES" });

s.test("a newly shared file is reported as added", () => {
  const a = loadAppsScript();
  const current = { [id(1)]: watchedItem("Plan", "Critical", ["anyone:reader:"]) };
  const diff = a.call("diffFindings_", current, current, {});
  equal(diff.added.length, 1);
  equal(diff.added[0].name, "Plan");
  equal(diff.worsened.length, 0);
  equal(diff.resolved.length, 0);
});

s.test("sharing that widens is reported as worsened, and says what it was", () => {
  const a = loadAppsScript();
  const before = { [id(1)]: watchedItem("Plan", "Warning", []) };
  const current = { [id(1)]: watchedItem("Plan", "Critical", []) };
  const diff = a.call("diffFindings_", current, current, before);
  equal(diff.worsened.length, 1);
  equal(diff.worsened[0].was, "Warning");
  equal(diff.added.length, 0);
});

s.test("sharing that narrows is not reported as a new problem", () => {
  const a = loadAppsScript();
  const before = { [id(1)]: watchedItem("Plan", "Critical", []) };
  const current = { [id(1)]: watchedItem("Plan", "Warning", []) };
  const diff = a.call("diffFindings_", current, current, before);
  equal(diff.worsened.length, 0);
  equal(diff.added.length, 0);
});

s.test("a finding that is gone is reported as resolved", () => {
  const a = loadAppsScript();
  const before = { [id(1)]: watchedItem("Plan", "Critical", []) };
  const diff = a.call("diffFindings_", {}, {}, before);
  equal(diff.resolved.length, 1);
  equal(diff.resolved[0].name, "Plan");
});

s.test("an item that was never a finding does not resolve into a report", () => {
  const a = loadAppsScript();
  const before = { [id(1)]: watchedItem("Fine", "OK", []) };
  equal(a.call("diffFindings_", {}, {}, before).resolved.length, 0);
});

s.test("people added at the same risk level are noticed", () => {
  const a = loadAppsScript();
  const before = { [id(1)]: watchedItem("Plan", "Warning", ["user:writer:trung@skedulo.com"]) };
  const now = { [id(1)]: watchedItem("Plan", "Warning",
    ["user:writer:trung@skedulo.com", "user:writer:new@skedulo.com"]) };
  const diff = a.call("diffFindings_", {}, now, before);
  equal(diff.peopleChanged.length, 1);
  equal(diff.peopleChanged[0].delta.added, ["user:writer:new@skedulo.com"]);
  equal(diff.peopleChanged[0].delta.removed, []);
});

s.test("unknown grantees are not invented as a change", () => {
  // Drive hides named grants on files other people own: people is null there.
  const a = loadAppsScript();
  const before = { [id(1)]: watchedItem("Theirs", "Warning", null) };
  const now = { [id(1)]: watchedItem("Theirs", "Warning", ["user:writer:someone@x.com"]) };
  equal(a.call("diffFindings_", {}, now, before).peopleChanged.length, 0,
    "a null grantee list must not be diffed into a fabricated change");
});

s.test("a people change is not double-reported alongside a widening", () => {
  const a = loadAppsScript();
  const before = { [id(1)]: watchedItem("Plan", "Warning", ["user:writer:a@x.com"]) };
  const now = { [id(1)]: watchedItem("Plan", "Critical", ["user:writer:b@x.com"]) };
  const diff = a.call("diffFindings_", now, now, before);
  equal(diff.worsened.length, 1);
  equal(diff.peopleChanged.length, 0, "the same file appeared in two sections of one email");
});

// ── nested folders ────────────────────────────────────────────────

s.test("a watched folder is walked, including its subfolders", () => {
  const root = id(1), sub = id(2), deep = id(3);
  const files = {
    [root]: file(root, "INITIATIVES", { folder: true }),
    [sub]: file(sub, "2026", { folder: true }),
    [deep]: file(deep, "Budget", { permissions: [anyone("reader")] }),
    [id(4)]: file(id(4), "Top level doc", { permissions: [domain("writer")] }),
  };
  const a = loadAppsScript({ Drive: fakeDrive(files, { [root]: [sub, id(4)], [sub]: [deep] }) });
  a.run(`CONFIG.watchlist = ['${root}'];`);

  const state = { problems: [], foldersWalked: 0, rootNames: [] };
  const map = a.call("scanWatchlist_", state);

  equal(Object.keys(map).sort(), [root, sub, deep, id(4)].sort(),
    "the walk did not reach every level of the tree");
  equal(map[deep].level, "Critical");
  equal(map[deep].source, "INITIATIVES", "findings should name the watched folder they came from");
  equal(state.problems, []);
});

s.test("the folder itself is inspected, not only its contents", () => {
  const root = id(1);
  const files = { [root]: file(root, "INITIATIVES", { folder: true, permissions: [anyone("writer")] }) };
  const a = loadAppsScript({ Drive: fakeDrive(files, { [root]: [] }) });
  a.run(`CONFIG.watchlist = ['${root}'];`);
  const map = a.call("scanWatchlist_", { problems: [], foldersWalked: 0, rootNames: [] });
  equal(map[root].level, "Critical", "sharing a folder exposes everything in it");
  equal(map[root].isFolder, true);
});

s.test("overlapping watch entries do not double-count a file", () => {
  const root = id(1), sub = id(2), doc = id(3);
  const files = {
    [root]: file(root, "Parent", { folder: true }),
    [sub]: file(sub, "Child", { folder: true }),
    [doc]: file(doc, "Shared doc", { permissions: [anyone("reader")] }),
  };
  const a = loadAppsScript({ Drive: fakeDrive(files, { [root]: [sub], [sub]: [doc] }) });
  a.run(`CONFIG.watchlist = ['${root}', '${sub}'];`);
  const map = a.call("scanWatchlist_", { problems: [], foldersWalked: 0, rootNames: [] });
  equal(Object.keys(map).length, 3, "a file reachable two ways was recorded twice");
});

s.test("a tree bigger than one run admits it rather than reporting all-clear", () => {
  const files = {};
  const children = {};
  for (let i = 1; i <= 12; i += 1) {
    files[id(i)] = file(id(i), `Folder ${i}`, { folder: true });
    children[id(i)] = i < 12 ? [id(i + 1)] : [];
  }
  const a = loadAppsScript({ Drive: fakeDrive(files, children) });
  a.run(`CONFIG.watchlist = ['${id(1)}']; CONFIG.maxFoldersPerRun = 3;`);

  const state = { problems: [], foldersWalked: 0, rootNames: [] };
  a.call("scanWatchlist_", state);
  equal(state.foldersWalked, 3, "the safety rail did not hold");
  assert(state.problems.length > 0, "a truncated walk reported no problem at all");
  includes(state.problems[0], "deeper subfolders were not reached");
});

s.test("an unreadable watch entry is reported, not skipped in silence", () => {
  const a = loadAppsScript({ Drive: fakeDrive({}, {}) });
  a.run(`CONFIG.watchlist = ['${id(9)}'];`);
  const state = { problems: [], foldersWalked: 0, rootNames: [] };
  equal(a.call("scanWatchlist_", state), {});
  equal(state.problems.length, 1);
  includes(state.problems[0], "Could not read");
});

s.test("a watch entry that is not a Drive reference names itself in the problem", () => {
  const a = loadAppsScript({ Drive: fakeDrive({}, {}) });
  a.run("CONFIG.watchlist = ['not-a-link'];");
  const state = { problems: [], foldersWalked: 0, rootNames: [] };
  a.call("scanWatchlist_", state);
  includes(state.problems[0], "not-a-link");
});

// ── recipients ────────────────────────────────────────────────────

s.test("a list of recipients is comma-joined with no leading spaces", () => {
  // MailApp rejects " b@y.com" and quietly delivers only to the first address.
  const a = loadAppsScript();
  a.run("CONFIG.notifyEmail = 'a@x.com, b@y.com ; c@z.com';");
  const to = a.call("notifyTarget_");
  equal(to, "a@x.com,b@y.com,c@z.com");
  assert(!/,\s/.test(to), "an address carries a leading space; only the first would be emailed");
});

s.test("an empty recipient setting falls back to whoever runs the script", () => {
  const a = loadAppsScript();
  a.run("CONFIG.notifyEmail = '';");
  equal(a.call("notifyTarget_"), "tlai@skedulo.com");
});

s.test("with nowhere to send, the run records the fault instead of emailing", () => {
  const a = loadAppsScript({
    Drive: { Files: { list: () => ({ files: [] }), get: () => ({}) },
             About: { get: () => ({ user: { emailAddress: "" } }) } },
  });
  a.run("CONFIG.notifyEmail = '';");
  a.call("notify_", "Subject", "<p>body</p>");
  equal(a.sent.length, 0, "it tried to email nobody");
  includes(a.read("LAST_PROBLEM_"), "No notification address");
});

s.test("a configured recipient actually receives the mail", () => {
  const a = loadAppsScript();
  a.run("CONFIG.notifyEmail = 'team@skedulo.com';");
  a.call("notify_", "Drive sharing check", "<p>body</p>");
  equal(a.sent.length, 1);
  equal(a.sent[0].to, "team@skedulo.com");
  equal(a.sent[0].subject, "Drive sharing check");
});

// ── a paused run ──────────────────────────────────────────────────

s.test("a paused run checks nothing and emails nobody", () => {
  const a = loadAppsScript();
  const status = [];
  a.context.applyDriveSettings_ = () => {};          // settings come from Drive; not under test
  a.context.writeStatus_ = (summary) => { status.push(summary); };
  a.context.ensureTrigger_ = () => { throw new Error("a paused run must not touch the trigger"); };
  a.run("CONFIG.paused = true; CONFIG.watchlist = ['" + id(1) + "'];");

  a.call("runCheck");

  equal(a.sent.length, 0, "a paused watcher sent an email");
  equal(status.length, 1);
  equal(status[0].paused, true);
  equal(status[0].emailed, false);
});

s.test("pausing leaves the trigger in place so resuming is instant", () => {
  const a = loadAppsScript();
  let removed = 0;
  a.context.applyDriveSettings_ = () => {};
  a.context.writeStatus_ = () => {};
  a.context.ScriptApp = { ...a.context.ScriptApp,
    getProjectTriggers: () => [{ getHandlerFunction: () => "runCheck" }],
    deleteTrigger: () => { removed += 1; } };
  a.run("CONFIG.paused = true;");

  a.call("runCheck");
  equal(removed, 0, "the trigger was deleted; resuming would need someone to open Apps Script");
});

s.test("a paused run does not overwrite the baseline", () => {
  const a = loadAppsScript();
  a.context.applyDriveSettings_ = () => {};
  a.context.writeStatus_ = () => {};
  a.call("saveBaseline_", { [id(1)]: { name: "Known", level: "Critical" } });
  a.run("CONFIG.paused = true;");

  a.call("runCheck");
  equal(a.call("loadBaseline_"), { [id(1)]: { name: "Known", level: "Critical" } },
    "resuming would report every existing finding as brand new");
});

// ── what gets reported at all ─────────────────────────────────────

s.test("org-wide view is withheld by default and included on request", () => {
  const a = loadAppsScript();
  const map = {
    [id(1)]: watchedItem("Info one", "Info", []),
    [id(2)]: watchedItem("Bad one", "Critical", []),
    [id(3)]: watchedItem("Fine", "OK", []),
  };
  a.run("CONFIG.reportInfoLevel = false;");
  equal(Object.keys(a.call("reportable_", map)), [id(2)]);

  a.run("CONFIG.reportInfoLevel = true;");
  equal(Object.keys(a.call("reportable_", map)).sort(), [id(1), id(2)].sort());
});

s.test("a grantee list is stable, so an unchanged file does not look changed", () => {
  const a = loadAppsScript();
  const perms = [person("b@x.com", "writer"), person("a@x.com", "reader"), owner("me@x.com")];
  equal(a.call("granteeList_", perms), a.call("granteeList_", [...perms].reverse()),
    "the order of Drive's response leaked into the comparison");
});

await s.done();
