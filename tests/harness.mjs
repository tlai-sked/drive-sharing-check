// Shared test harness.
//
// Two things to load: the page (jsdom) and the Apps Script (a plain VM context
// with the Google services stubbed). Everything else here is assertions and the
// summary line the suites are required to print.
//
// The jsdom workarounds below are not preference. Each one is a limitation that
// has already cost someone an afternoon — see CLAUDE.md, "jsdom limitations
// that will waste your time".

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import { JSDOM, VirtualConsole } from "jsdom";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const readRepoFile = (rel) => readFileSync(join(ROOT, rel), "utf8");

/**
 * The tool, parsed and running, in jsdom.
 *
 * Google's sign-in library is never fetched: jsdom does not load external
 * resources unless asked, so `window.google` is absent exactly as it is for a
 * user whose network blocked it. Tests that need it install their own stub.
 */
export function loadPage({ width = 1280, reduceMotion = false, url = "http://localhost:8000/" } = {}) {
  const virtualConsole = new VirtualConsole();
  const pageErrors = [];
  virtualConsole.on("jsdomError", (err) => pageErrors.push(err));

  const dom = new JSDOM(readRepoFile("index.html"), {
    runScripts: "dangerously",
    pretendToBeVisual: true,
    url,
    virtualConsole,
    beforeParse(window) {
      // matchMedia has to exist before the page script runs. Installed after
      // parse, `reduceMotion` has already been computed from a missing function.
      window.matchMedia = (query) => ({
        matches: /prefers-reduced-motion/.test(String(query)) ? reduceMotion : false,
        media: String(query),
        onchange: null,
        addListener() {}, removeListener() {},
        addEventListener() {}, removeEventListener() {},
        dispatchEvent() { return false; },
      });
      // jsdom has no layout, so neither of these exists.
      window.Element.prototype.scrollIntoView = function () {};
      window.scrollTo = () => {};
      Object.defineProperty(window, "innerWidth", {
        value: width, writable: true, configurable: true,
      });
    },
  });

  const { window } = dom;
  return {
    dom,
    window,
    document: window.document,
    pageErrors,
    el: (id) => window.document.getElementById(id),
    /** Top-level `const`/`let` are not properties of window; eval reaches them. */
    read: (expr) => window.eval(expr),
    /** Fire the event a real keystroke would, which assigning .value does not. */
    type(id, value) {
      const node = window.document.getElementById(id);
      node.value = value;
      node.dispatchEvent(new window.Event("input", { bubbles: true }));
      return node;
    },
    close: () => window.close(),
  };
}

/**
 * apps-script/Code.gs in a sandbox, with the Google services replaced by
 * recorders. `overrides` is merged over the defaults so a test can supply the
 * Drive responses it needs.
 */
export function loadAppsScript(overrides = {}) {
  const sent = [];
  const props = new Map();          // user properties: where the baseline lives
  const scriptProps = new Map();

  const store = (map) => ({
    getProperty: (k) => (map.has(k) ? map.get(k) : null),
    setProperty: (k, v) => { map.set(k, String(v)); },
    deleteProperty: (k) => { map.delete(k); },
    getKeys: () => [...map.keys()],
    deleteAllProperties: () => { map.clear(); },
  });

  const context = {
    console,
    Logger: { log() {} },
    Session: {
      getActiveUser: () => ({ getEmail: () => "tlai@skedulo.com" }),
      getEffectiveUser: () => ({ getEmail: () => "tlai@skedulo.com" }),
      getScriptTimeZone: () => "Asia/Ho_Chi_Minh",
    },
    MailApp: {
      sendEmail(opts) { sent.push(opts); },
      getRemainingDailyQuota: () => 100,
    },
    PropertiesService: {
      getUserProperties: () => store(props),
      getScriptProperties: () => store(scriptProps),
    },
    ScriptApp: {
      getProjectTriggers: () => [],
      deleteTrigger() {},
      newTrigger: () => ({
        timeBased: () => ({
          onWeekDay: () => ({ atHour: () => ({ create() {} }) }),
          everyDays: () => ({ atHour: () => ({ create() {} }) }),
          everyMinutes: () => ({ create() {} }),
        }),
      }),
      WeekDay: {
        MONDAY: "MONDAY", TUESDAY: "TUESDAY", WEDNESDAY: "WEDNESDAY",
        THURSDAY: "THURSDAY", FRIDAY: "FRIDAY", SATURDAY: "SATURDAY", SUNDAY: "SUNDAY",
      },
    },
    Utilities: {
      formatDate: (d) => new Date(d).toISOString(),
      sleep() {},
    },
    Drive: {
      Files: {
        list: () => ({ files: [], nextPageToken: null }),
        get: () => ({}),
        create: () => ({ id: "created-file-id" }),
        update: () => ({ id: "updated-file-id" }),
      },
      About: { get: () => ({ user: { emailAddress: "tlai@skedulo.com" } }) },
    },
    DriveApp: {
      getFileById: () => { throw new Error("not stubbed"); },
      getFolderById: () => { throw new Error("not stubbed"); },
    },
  };

  Object.assign(context, overrides);
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(readRepoFile("apps-script/Code.gs"), context, { filename: "Code.gs" });

  return {
    context,
    sent,
    props,
    /** Function declarations land on the context; call them directly. */
    call: (fn, ...args) => context[fn](...args),
    /**
     * Top-level `const`/`let` (CONFIG, RANK, the query strings) live in the
     * realm's global lexical environment, not on the context object. Running
     * another script in the same context is the only way to reach them.
     */
    read: (expr) => vm.runInContext(expr, context),
    run: (code) => vm.runInContext(code, context),
  };
}

// ── assertions ────────────────────────────────────────────────────
// Deliberately tiny. A test that needs more than these is usually testing two
// things at once.

export function suite(title) {
  const queue = [];

  return {
    /** Takes sync or async fn; cases run in the order they were declared. */
    test(label, fn) { queue.push({ label, fn, inverted: false }); },
    /**
     * Same as test(), but for a case that documents a known-unfixed defect.
     * It must FAIL to pass — so the day someone fixes it, this turns red and
     * tells them to promote it to a real test instead of quietly rotting.
     */
    expectFailure(label, fn) { queue.push({ label, fn, inverted: true }); },
    async done() {
      const failures = [];
      let passed = 0;
      for (const { label, fn, inverted } of queue) {
        let err = null;
        try { await fn(); } catch (e) { err = e; }
        if (inverted) {
          if (err) passed += 1;
          else failures.push({ label, err: new Error("expected this to still fail, but it passed — promote it to test()") });
        } else if (err) {
          failures.push({ label, err });
        } else {
          passed += 1;
        }
      }
      console.log(`\n${title}`);
      for (const { label, err } of failures) {
        console.log(`  FAIL  ${label}`);
        const detail = (err && err.message) || String(err);
        for (const line of detail.split("\n")) console.log(`        ${line}`);
      }
      console.log(`\n${passed} passed, ${failures.length} failed`);
      process.exitCode = failures.length ? 1 : 0;
    },
  };
}

export function assert(cond, message) {
  if (!cond) throw new Error(message || "expected truthy");
}

export function equal(actual, expected, message) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error((message ? message + "\n" : "") + `expected: ${b}\n  actual: ${a}`);
  }
}

export function includes(haystack, needle, message) {
  if (!String(haystack).includes(needle)) {
    throw new Error((message ? message + "\n" : "") + `expected to contain: ${JSON.stringify(needle)}`);
  }
}

export function throws(fn, matcher, message) {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  if (!err) throw new Error(message || "expected it to throw, but it did not");
  if (matcher && !String(err.message).match(matcher)) {
    throw new Error(`threw the wrong error: ${err.message}`);
  }
  return err;
}

export async function rejects(promise, matcher, message) {
  let err = null;
  try { await promise; } catch (e) { err = e; }
  if (!err) throw new Error(message || "expected it to reject, but it resolved");
  if (matcher && !String(err.message).match(matcher)) {
    throw new Error(`rejected with the wrong error: ${err.message}`);
  }
  return err;
}
