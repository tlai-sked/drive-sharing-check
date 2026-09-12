# Drive Sharing Check

A single-file browser tool that finds Google Drive files shared too widely, lets
you fix the ones you own, and watches nominated folders on a timer.

Owner: Thao Lai (tlai@skedulo.com), Technical Support Engineering, Skedulo.
Live at https://drive-sharing-check.vercel.app · code at
https://github.com/tlai-sked/drive-sharing-check (private).

---

## Read before you change things

This file is the short version. Open the matching document **before** editing
the area it covers — each one exists because guessing there has already cost
someone a day.

| Before you… | Read |
|---|---|
| change any behaviour | `docs/requirements.md` — what this tool must never do, and why |
| touch anything you do not fully understand | `docs/gotchas.md` — the traps, in full |
| change how it is built or why | `docs/architecture.md` |
| deploy, or touch OAuth origins | `docs/hosting.md` |
| write or change a test | `docs/testing.md` |
| change one thing and wonder what else moves | `docs/change-map.md` |

`README.md` is for people, not for this file's audience. It explains what the
tool is and how to set up the Apps Script watcher.

---

## Files

| File | What it is |
|---|---|
| `index.html` | The whole tool, and the only copy. CSS, JS and icons inline; no dependencies but Google's sign-in library. |
| `apps-script/Code.gs` | The scheduled watcher. Runs in Apps Script, emails a report. Not this page's backend — a separate program. |
| `apps-script/appsscript.json` | Manifest. Pins the OAuth scopes; without it Apps Script infers broader ones. |
| `scripts/check.mjs` | The couplings nothing else can see. |
| `scripts/deploy.sh` | Deploys, then verifies the live page and that no internal file is reachable. |
| `tests/` | The suites, and the harness that loads both halves of the tool. |
| `.vercelignore` | An allowlist, not a blocklist. Keeps everything but the tool off the public URL. |
| `package.json` | Exists only so the tests can have `jsdom`. Not part of the tool. |
| `start-drive-sharing-check.command` | Double-click launcher. Serves the folder on port 8000. |
| `docs/requirements.md` | Standing decisions and the rules that must hold. |
| `docs/architecture.md` | Why it is built this way, and what each choice rules out. |
| `docs/gotchas.md` | Every trap, with the failure it caused. |
| `docs/hosting.md` | Deploying, OAuth origins, and the Vercel quirk in this repo. |
| `docs/testing.md` | How to test here and what jsdom will not do. |
| `docs/change-map.md` | What else has to change when you change something. |

**There is no build step.** What is in `index.html` is what runs.

---

## Commands

| Task | Command |
|---|---|
| Run the tests | `npm test` (needs `npm install` once) |
| Run one suite | `node tests/qa_email.js` |
| Check the couplings a script can catch | `node scripts/check.mjs` |
| Deploy to production | `sh scripts/deploy.sh` |
| Run locally | `./start-drive-sharing-check.command` |
| Enable the pre-push hook, once per clone | `git config core.hooksPath scripts/git-hooks` |

**Port 8000, exactly.** Google refuses `file://`, and `localhost:3000` and
`127.0.0.1:8000` are different origins to it. Only `http://localhost:8000` is
registered on the OAuth client.

**Do not run `vercel deploy --prod` from the repo root.** It hangs and dies at
"Building…" with `fetch failed`; the message never mentions the cause. See
`docs/hosting.md`.

---

## Rules that hold everywhere

The full list and the reasoning are in `docs/requirements.md`. These four cause
real damage if broken and are easy to break by accident:

1. **Never change a file the user does not own.** The gate is `canFix()` —
   `ownedByMe && canShare`. Every surface that offers a change goes through it:
   the tick box, the row action, `Select all`, the access dialog, the plan.
   Those files get *Remind owner* instead, which changes nothing.
2. **Never store anything centrally** — no server, no database, no refresh
   tokens. The browser uses the signed-in user's own token and keeps nothing.
3. **Never read file contents.** Names and sharing settings only.
4. **Never serve the repo's internal notes.** `.vercelignore` is an allowlist.
   After a deploy, `/CLAUDE.md` must return 404. `scripts/deploy.sh` checks it.

---

## Gotchas — the short list

One line each. `docs/gotchas.md` has the failure each one caused; read it there
before touching the code it names.

- **`capabilities.canShare` is not ownership.** Drive reports it true on a file
  you were merely granted manage rights to. Use `canFix()`.
- **OAuth scope strings are prefixes of each other.** `.../auth/drive` is a
  substring of `.../auth/drive.metadata.readonly`. Split on whitespace and
  compare whole scopes.
- **Google may return a token without the scope you asked for.** Check
  `r.scope` and re-request with `prompt: "consent"`.
- **Setting `input.value` in code fires no `input` event.** Dispatch one.
- **`:first-child` / `:last-child` still match hidden elements.** `markSegEnds()`
  marks the first and last *visible* buttons; anything rebuilding a `.seg` with
  `innerHTML` must call it again.
- **`border-bottom: none` is a border *style*.** A border with no style computes
  to zero width however wide you declare it.
- **`flex-basis` is measured along the main axis.** A width in a row becomes a
  height when a phone rule turns that row into a column.
- **`.trim()` does not remove zero-width or non-breaking spaces.** `cleanEmail()`
  strips them.
- **Absent keys in the settings file must not inherit old values.** `paused` is
  `cfg.paused === true`, never "keep whatever was there".
- **A Drive file ID is 15+ characters.** Test fixtures using `'F'` scan nothing.
- **MailApp drops every recipient after one with a leading space.** Join with
  `","`, no space.
- **The script spells the em dash as `—`**, the page uses a literal `—`.
  Grep for `SETTINGS_NAME` / `STATUS_NAME`, not for the character.
- **Drive hides named grants on other people's files.** Risk levels are
  reliable; "who exactly has access" is not. Do not invent it.

---

## The same logic runs twice

`index.html` and `apps-script/Code.gs` are separate programs that must agree.
Nothing at runtime notices when they drift.

| Duplicated in both | If it drifts |
|---|---|
| `LINK_Q`, `DOMAIN_Q`, `OWNED` | A typo returns zero rows and no error — the scan reports all clear. |
| `SETTINGS_NAME`, `STATUS_NAME` | The two halves stop finding each other's Drive files, silently. |
| `classify`, `VERB`, `EDIT_ROLES`, the rank table | An email and the page disagree about the same file. |

`node scripts/check.mjs` compares the query strings and the two file names by
decoded value. It cannot judge the classification rules — those are on you.

---

## Conventions

- Comments explain **why**, never what. If code needs explaining, rename it.
- Tone: plain and direct. No marketing language in UI copy.
- Design tokens are Skedulo Breeze. Fonts Inter / Manrope. No new colours.
- **Motion must answer a user action.** Nothing animates on its own.
- A disabled control must say why, next to it — `saveBlockedReason()`.
- Every visual change needs a check at 390px. The phone block is the last
  `@media (max-width: 640px)` in the stylesheet.
- **After any edit to `index.html`, regenerate the build stamp.** The recipe is
  in `docs/hosting.md`. It is how anyone tells a stale cached page from a fresh
  one.
- A green test proves nothing until you have seen it go red. Break the code on
  purpose and watch it fail. See `docs/testing.md`.

---

## Current state

Working: scanning (three scopes, one hidden), risk classification, bulk changes
on files you own, *Remind owner* on files you do not, pagination,
jump-to-section, scheduled monitoring with multiple recipients, pause/resume,
mobile layout. 134 tests across 7 suites.

Hidden but intact: the "Shared with me" scope. Remove `hidden` on the button in
`#scopeSeg` to restore it. Hidden at Trung's request.

`DEFAULT_CLIENT_ID` is filled in — a browser client ID in GCP project
`840890137894`, public by design. Precedence: `?client_id=` in the link, then
that constant, then whatever is saved in the browser. Who may sign in is decided
by the OAuth consent screen, which is **Internal**; that is what keeps a public
URL from being a public tool.

---

## Outstanding

1. **Move into the Idea Hub app** (`KhoaVu-Sked/vn-ai-ideas-hub`) — Next.js 15,
   Vercel, Neon, bun. Phase 1: drop the HTML into `public/` and confirm
   `middleware.js` lets it through. Phase 2: `features/drive-sharing/` plus a
   one-line re-export. **Do not** add the Drive scope to Idea Hub's login client
   ID, and **do not** store refresh tokens in Neon. Preview URLs change per
   deploy and Google allows no wildcard origins, so a fixed staging domain is
   needed first.
2. **Folder restructure** (roadmap item 5). Blocked on Trung's
   folder-to-audience table. Moving files does **not** fix existing
   over-sharing — see `docs/requirements.md`, "Not this tool's job".
