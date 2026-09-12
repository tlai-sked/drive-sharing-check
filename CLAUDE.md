# Drive Sharing Check

A single-file browser tool that finds Google Drive files shared too widely, lets
you fix them in place, and watches nominated folders on a timer.

Owner: Thao Lai (tlai@skedulo.com), Technical Support Engineering, Skedulo.

---

## Files

| File | What it is |
|---|---|
| `README.md` | What the tool is, how to run it, and how to set up the watcher. Start here. |
| `index.html` | The whole tool, and the only copy. Self-contained: CSS, JS, SVG icons, no dependencies except Google's sign-in library. |
| `apps-script/Code.gs` | The scheduled watcher. Runs in Google Apps Script, emails a report. Independent of the HTML — it is not this page's backend. |
| `apps-script/appsscript.json` | Manifest. Pins the OAuth scopes — without it Apps Script infers broader ones. |
| `docs/change-map.md` | What else has to change when you change something. |
| `scripts/check.mjs` | The couplings nothing else can see. `node scripts/check.mjs`. |
| `scripts/deploy.sh` | Deploys, then verifies the live page and that no internal file is reachable. |
| `tests/` | The suites, and the harness that loads both halves of the tool. `npm test`. |
| `package.json` | Exists only so the tests can have `jsdom`. Not part of the tool. |
| `.vercelignore` | An allowlist, not a blocklist. Keeps everything but the tool off the public URL. |
| `start-drive-sharing-check.command` | Double-click launcher. Serves the folder on port 8000 — the only origin Google accepts for local sign-in. |

**One HTML file, deliberately.** There were three: `drive-sharing-check-local.html`,
`index.html`, and `drive-check/index.html` — three separate downloads of the
same tool, taken minutes apart. They all carried the same build stamp
(`11 Sep 23:29 · f09c39d`) yet differed in content, so the stamp could not tell
them apart; the oldest was missing the mobile action bar entirely. The rule
that used to live here — "keep the copies in sync after every change" — is the
kind a person forgets, and it had already been broken. Git holds the history
now. If you need a differently-named copy for hosting, rename or symlink at
deploy time; do not commit a second file.

There is no build step. Open the HTML, or serve it over http.

---

## Commands

| Task | Command |
|---|---|
| Run the tests | `npm test` |
| Run one suite | `node tests/qa_email.js` |
| Check the couplings a script can catch | `node scripts/check.mjs` |
| Enable the pre-push hook — once per clone | `git config core.hooksPath scripts/git-hooks` |
| Run the tool locally | `./start-drive-sharing-check.command` |

By hand, `python3 -m http.server 8000` does the same job as the launcher.

**The port must be 8000.** Google refuses `file://` addresses outright, and
`localhost:3000` and `127.0.0.1:8000` are *different origins* to Google — all
are refused at sign-in. `http://localhost:8000` is the only address registered
on the OAuth client. The launcher stops with an explanation when 8000 is taken
rather than quietly picking another port.

There is no test runner in the repo — see Testing.

---

## Hosting

Live at **https://drive-sharing-check.vercel.app** — Vercel, scope `HOME`,
project `drive-sharing-check`. Deploy with `sh scripts/deploy.sh`. There is
nothing to build; Vercel uploads the one file and serves it.

**`vercel deploy --prod` from the repo root does not work, and the error does
not say why.** The CLI reads the working directory's git remote and tries to
associate the deployment with that repository. The remote here is a private
GitHub repo the Vercel account cannot read, so the call hangs and the deploy
dies at "Building…" with `fetch failed`. Nothing in that message mentions git.
The script stages the single uploaded file in a directory with no remote, which
is why it works. `vercel deploy --dry` reports `fileCount: 1`, so staging
changes nothing about what ships.

Found by bisection after three wrong explanations, each disproved by deploying
a directory that isolated it — `node_modules` was blamed first and was not the
cause, nor was `package.json`, nor the file count. A full copy of this repo
with `.git` intact but the remote removed deploys fine. Every deploy before the
GitHub remote existed succeeded; every one after it failed. If someone connects
the repo to Vercel properly this constraint goes away — but read the warning
below before doing that.

It replaced a Netlify site. Take the old one down once this is confirmed
working, and remove its origin from the OAuth client — a registered origin
nobody uses is a door left open.

**`.vercelignore` is an allowlist.** It ignores `*` and then un-ignores
`index.html`, because the repo carries internal notes — owner email, security
design, open issues — that must not be served from a public URL. Anything new
that genuinely has to be public must be un-ignored by name. Verify after a
deploy that `/CLAUDE.md` returns 404, not 200.

The code lives at **https://github.com/tlai-sked/drive-sharing-check**,
private — the docs here name people, internal repos and open security
questions, which is also why `.vercelignore` keeps them off the deployed site.

**Deployment is by CLI on purpose.** `.vercelignore` governs what the CLI
uploads. A Git-connected build is a different path through Vercel, and this
repo now exists on GitHub for someone to connect. If anyone ever does, check
that `/CLAUDE.md` still returns 404 before trusting it, and that a stray
`npm install` has not started running against `package.json` — which is here
for the tests and nothing else.

**The origin must be registered with Google, or nobody can sign in.** Add
exactly `https://drive-sharing-check.vercel.app` to *Authorised JavaScript
origins* on the OAuth client — no trailing slash, no path. Google matches the
origin character for character.

**Sign-in cannot work on preview deployments.** Every preview gets a fresh
hostname and Google does not allow wildcard origins, so a preview can only ever
show the page, never complete a sign-in. Test sign-in on production. This is
the same constraint that blocks the Idea Hub move in Outstanding 1.

Vercel serves the HTML as `cache-control: public, max-age=0, must-revalidate`
by default, which is what the build stamp exists to protect against. Confirmed
on the live URL; no `vercel.json` is needed to get it.

---

## Architecture, and why it is like this

**No server, no database.** The browser calls the Google Drive REST API
directly with the signed-in user's own token. Nothing is stored anywhere
central. This is deliberate: a database holding "every publicly shared file at
Skedulo" would itself become the thing worth attacking.

**Scanning is ~3 API calls, not one per file.** Drive supports
`visibility='anyoneWithLink'` and `visibility='domainWithLink'` as search terms.
An earlier attempt read permissions file by file, hit HTTP 429 and a five-hour
rate limit. Never go back to per-file permission reads for the bulk scan.

**The scheduled watcher is Apps Script, not a server.** It runs as the user,
inside Google, so there is no refresh token stored anywhere. A server-side
version would need a long-lived credential per person in a database — strictly
worse.

**Settings travel through a Drive file's `description` field.** A web page
cannot reconfigure an Apps Script project. So the page writes settings into the
description of `Drive sharing check — settings`, and the script reads it. A
description is *metadata*, so the script reads it with the
`drive.metadata.readonly` scope it already has. The script writes its run status
back the same way, into `Drive sharing check — status`.

### The same logic runs twice

The page and the watcher are separate programs that have to agree. Three groups
of constants are duplicated between `index.html` and `apps-script/Code.gs`, and
nothing at runtime will tell you they have drifted:

| Duplicated in both | Why it matters |
|---|---|
| `LINK_Q`, `DOMAIN_Q`, `OWNED` | Strings sent to Google. A typo returns zero rows and no error — the scan simply reports that everything is fine. |
| `SETTINGS_NAME`, `STATUS_NAME` | The contract between the two halves. See below. |
| `classify`, `VERB`, `EDIT_ROLES`, the rank table | A port, not a shared module. See below. |

**The two file names are the contract.** The page writes settings into
`Drive sharing check — settings` and reads run status from
`Drive sharing check — status`; the script does the reverse. Change either
string on one side only and the halves stop finding each other's files —
silently, with nothing logged on either side.

**The classification is a port, not a shared module.** The script returns
`{level, label}`; the page returns the same plus the fields the UI needs
(`icon`, `permId`, `permKind`, `permRole`, `permDomain`, `permIndexed`). The
risk rules themselves must stay identical, or an email and the page disagree
about the same file. `classify_` in the script is marked "ported verbatim —
keep in sync"; this is the other end of that note.

`node scripts/check.mjs` compares the query strings and the two file names by
exact text. It cannot judge the classification rules — those are on you.

### Scopes

| Where | Scope | Why |
|---|---|---|
| Page, scanning | `drive.metadata.readonly` | File names and sharing settings. Never contents. |
| Page, changing sharing | `drive` | Google has no permissions-only write scope. Requested lazily, on first use of Change. |
| Page, settings file | `drive.file` | App-created files only. Requested lazily on first save. |
| Script | `drive.metadata.readonly`, `drive.file`, `script.scriptapp`, `script.send_mail` | No outbound network access. |

---

## Hard-won gotchas — read before changing related code

**OAuth scope strings are prefixes of each other.**
`.../auth/drive.metadata.readonly` *contains* `.../auth/drive`. Comparing with
`indexOf` silently accepts a read-only grant as write access. Split on
whitespace and compare whole scopes. This caused a 403 that reported itself as
"the account may not own this file".

**Google may return a token without the scope you asked for.** If a grant
already exists, GIS can return it silently. Always check `r.scope` on the
callback and re-request with `prompt: "consent"` if the needed scope is absent.

**Setting `input.value` in code does not fire an `input` event.** The email
suggestion picker wrote the field directly, so validation kept acting on the
half-typed text and the Save button stayed disabled. Dispatch an `input` event
after any programmatic write, or revalidate on `change` and `blur`.

**`:first-child` / `:last-child` still match hidden elements.** Hiding the
"Shared with me" button left the segmented control's end cap on an invisible
button. `markSegEnds()` marks the first and last *visible* buttons with
`seg-first` / `seg-last`. Anything that rebuilds a `.seg` with `innerHTML` must
call it again — `renderDurations()` does.

**Trim does not remove zero-width or non-breaking spaces.** They survive
`.trim()`, are invisible on screen, and fail every validator. `cleanEmail()`
strips them.

**Absent keys in the settings file must not inherit old values.** `paused` is
read as `cfg.paused === true`, not "keep whatever CONFIG had". An earlier
version let a stale value persist and monitoring silently stayed off.

**A file ID is 15+ characters.** `idFromRef_` rejects anything shorter. Test
fixtures using `'F'` as an ID will silently scan nothing.

**MailApp rejects recipients with a leading space.** `"a@x.com, b@y.com"` sends
only to the first. Save the list joined with `","` and strip spaces per address.

**The script spells the em dash as an escape.** `Code.gs` has
`'Drive sharing check \u2014 settings'` where the page has a literal `—`. Same
string at runtime, so grepping for the em dash finds only the page's copy and
you will conclude there is just one. Search for `SETTINGS_NAME` or
`STATUS_NAME` instead.

**`capabilities.canShare` is not ownership.** Drive reports it true on a file
somebody granted you manage rights to, which you still do not own. Gating the
Change button on it alone let you rewrite another team's sharing. `canFix()` is
the single test — `ownedByMe && canShare` — and everything that offers to
change something goes through it: the tick box, the row action, `Select all`,
the access dialog, and the plan's estimate.

**Drive hides named grants on files owned by other people.** Risk levels are
reliable there; "who exactly has access" is not. Do not invent it.

---

## Conventions

- Comments explain **why**, never what. If code needs explaining, rename it.
- Tone: plain, direct. No marketing language in UI copy.
- Design tokens are Skedulo Breeze (`--n900`…`--n0`, `--blue800`, `--red600`,
  `--orange600`, `--green700`). Fonts Inter / Manrope. Do not introduce new
  colours.
- **Motion must answer a user action.** Nothing animates on its own. Seven
  simultaneous alarm effects were removed for this reason; do not add pulsing,
  blinking or glowing back.
- A disabled control must say why, next to it. `saveBlockedReason()` is the
  pattern.
- Every visual change needs a matching mobile check — the phone block is the
  last `@media (max-width: 640px)` in the stylesheet.
- After any edit: update the build stamp in the drawer footer.

### Build stamp

The drawer footer shows `DD Mon HH:MM · <sha1 prefix>`. It exists because a
stale browser cache cost two rounds of debugging a bug that was already fixed.
Regenerate it after each change:

```python
import hashlib, datetime, re
p = 'index.html'
s = open(p, encoding='utf-8').read()
s = re.sub(r'<span id="buildStamp"[^>]*>[^<]*</span>',
           '<span id="buildStamp" title="If this looks old, reload with Cmd+Shift+R">STAMP</span>', s)
digest = hashlib.sha1(s.replace('STAMP', '').encode('utf-8')).hexdigest()[:7]
stamp = datetime.datetime.now().strftime('%d %b %H:%M') + ' &middot; ' + digest
open(p, 'w', encoding='utf-8').write(s.replace('>STAMP<', '>' + stamp + '<'))
```

---

## Testing

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

---

## Current state

Working: scanning three scopes (one hidden), risk classification, bulk access
changes, pagination, jump-to-section, scheduled monitoring with multiple
recipients, pause/resume, mobile layout.

Files owned by other people are read-only here. They are still listed and still
classified, but they carry **Remind owner** — a `mailto:` naming the file, its
risk and its link — instead of Change. They cannot be ticked, are left out of
`Select all` and of the plan's time estimate, and the footer says how many
there are. The reasoning is not only that Drive would refuse the write: quietly
re-sharing another team's document is not this tool's business.

Hidden but intact: the "Shared with me" scope. Remove `hidden` on the button in
`#scopeSeg` to restore it. Hidden at Trung's request.

`DEFAULT_CLIENT_ID` is filled in, so nobody has to create their own OAuth
client. It is a browser client ID in GCP project `840890137894` — public by
design, and the page never touches the client secret. The precedence is
`?client_id=` in the link, then this constant, then whatever is saved in the
browser.

Two consequences worth knowing. Every hosted origin has to be registered on
*that* client, so a new host means a new entry in Authorised JavaScript
origins. And who may sign in is decided by that client's OAuth consent screen,
not by this page. That screen is set to **Internal**, so only Skedulo accounts
get through — which is what keeps a public URL from being a public tool.

In the current console these live under **Google Auth Platform**, not the old
"OAuth consent screen" page: origins under **Clients**, the Internal/External
setting under **Audience**.

---

## Outstanding

1. **Move into the Idea Hub app** (`KhoaVu-Sked/vn-ai-ideas-hub`). Next.js 15
   App Router, Vercel, Neon, bun. Decided after the team raised hosting
   concerns.
   - Phase 1: drop the HTML into `public/`. No build changes. Confirm
     `middleware.js` lets it through — it gates everything behind Skedulo login.
   - Phase 2: convert to `features/drive-sharing/` plus a one-line re-export in
     `app/`, matching their convention.
   - **Do not add the Drive scope to Idea Hub's existing login client ID** — it
     would prompt every Idea Hub user for Drive access. Create a separate client
     ID in the same GCP project.
   - **Do not store refresh tokens in Neon.** That reintroduces exactly the risk
     this design avoids.
   - Vercel preview URLs change per deploy and Google does not allow wildcard
     origins, so OAuth fails on previews. A fixed staging domain is needed.

2. ~~**Mobile Run check** failed on the old Netlify build.~~ Resolved
   12 Sep 2026: works on a phone against the Vercel build once
   `https://drive-sharing-check.vercel.app` was added to the client's
   Authorised JavaScript origins. So it was "Google refused the sign-in
   request" — an unregistered origin — not iOS popup blocking. Worth
   remembering the next time a host changes: the symptom appears on the phone,
   but the cause is a one-line entry in the Google console.

3. **Folder restructure** (roadmap item 5). Blocked on Trung's folder-to-audience
   table. Note: moving files does **not** fix existing over-sharing — Drive
   permissions are additive and travel with the file. Remediation and prevention
   are separate jobs.

