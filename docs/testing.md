# Testing

How tests work here, what jsdom will not do for you, and the rule that decides
whether a test is worth keeping.


`npm test` runs everything. A single suite runs on its own —
`node tests/qa_email.js` — and `node tests/run-all.mjs email` runs the ones
whose name matches. Each suite prints `N passed, M failed`.

The suites lost when the environment reset were rebuilt in September 2026.
They need `jsdom`, the repo's only dependency: `npm install` once. The tool
itself still has none, and `.vercelignore` keeps `package.json` off the
deployed site.

| Suite | Covers |
|---|---|
| `tests/qa_scopes.js` | A read-only grant is detected and re-consented, not used |
| `tests/qa_email.js` | Lists, semicolons, invisible characters, the picker firing `input` |
| `tests/qa_segmented.js` | End caps land on visible buttons, survive re-render |
| `tests/qa_monitoring.js` | Load, save, pause/resume patching only one flag |
| `tests/qa_mobile.js` | Change access at 390px; every control reachable |
| `tests/qa_appsscript.js` | Baseline diffing, nested folders, paused runs, recipient lists |
| `tests/harness.mjs` | Loads the page in jsdom and `apps-script/Code.gs` in a stubbed VM |

**Every case here exists because something went wrong once.** A test whose
name does not describe a real failure is a test nobody will trust enough to
fix when it breaks. Before adding one, be able to say what it would have
caught.

**A green suite proves nothing until you have seen it go red.** All 18
documented gotchas were reintroduced one at a time and each was caught by the
case that names it. When you add a test, break the code on purpose and watch
it fail before you trust it.

### jsdom limitations that will waste your time

- **`@media` rules are never applied.** Verified. `getComputedStyle` at any
  window width returns desktop values. Assert on the stylesheet text instead.
- **`var()` inside the `border-radius` shorthand does not resolve.** Returns
  `0` for every corner.
- **No `scrollIntoView`.** Stub it.
- **`matchMedia` must be injected in `beforeParse`**, or `reduceMotion` is
  already computed before your override lands.

A crashing suite prints no summary line. Check for `Node.js v` in the output,
not just the absence of `FAIL`.
