# What else do I need to change?

The couplings in this project — where changing one thing means changing
another, and nothing tells you.

Run `node scripts/check.mjs` first. It catches the mechanical half. What's
below is the half a script can't judge.

> Add a row the first time a change breaks something somewhere else. A
> speculative entry is noise; one written the day after an incident is the most
> valuable thing in the repo.

---

## The rule that causes most of the trouble

**There is no build step.** Nothing compiles, nothing bundles, nothing fails.
Whatever is in the HTML file is what runs. So a mistake doesn't surface as an
error — it surfaces as the tool quietly behaving differently depending on which
copy you happened to open.

---

## If you change…

### Anything in the tool's HTML

| Also change | Why |
|---|---|
| the build stamp in the drawer footer | it is how you tell a stale cached page from a fresh one. A wrong stamp already cost two rounds of debugging a bug that was fixed. The recipe is in `docs/hosting.md` |
| `CLAUDE.md` Files table | if you added or removed a file |

There used to be three copies of the HTML, 207 chunks apart, all wearing the
same build stamp — so the hosted page and the local page were different tools
with the same name. They were deleted in `96d24e8`. `node scripts/check.mjs`
now fails if a second `.html` file appears anywhere in the repo, which is the
enforceable version of the rule people kept forgetting.

### A constant that exists in both the page and the script

The page and the watcher are separate programs that must agree. Changing one
side only is silent — no error, no log, on either side.

| Also change | Why |
|---|---|
| `LINK_Q`, `DOMAIN_Q`, `OWNED` in the other file | strings sent to Google. A typo returns zero rows and no error — the report says everything is fine |
| `SETTINGS_NAME`, `STATUS_NAME` in the other file | these two Drive file names are the only channel between the halves. Drift and the page stops configuring the script, and the script stops reporting status |
| the classification — `classify` / `classify_`, `VERB`, `EDIT_ROLES`, the rank table | ported verbatim on purpose. If they diverge, an email and the page disagree about the same file |

Note the spelling trap: the script writes `'Drive sharing check \u2014 settings'`
where the page writes a literal `—`. Grepping for the em dash finds only one of
the two.

`node scripts/check.mjs` compares the query strings and the file names by exact
text. The classification rules it cannot judge.

### A function either half of the tool actually uses

| Also change | Why |
|---|---|
| the suite that names it | `npm test`. The suites are in `tests/`, one per area, and each case is named after a real failure |

Every test there was written against a specific mistake. If you change
behaviour deliberately, change the test and keep its name honest; if you cannot
say what a test would have caught, it should not exist. A green suite proves
nothing until you have watched it go red — break the code on purpose first.

### The git remote, or anything about how this repo is hosted

| Also change | Why |
|---|---|
| re-test `sh scripts/deploy.sh` | the Vercel CLI reads the git remote and tries to reach that repository. A private remote it cannot read makes `vercel deploy` hang and fail at "Building…" with `fetch failed`, which names nothing useful. The script exists to sidestep exactly this |

If the remote ever becomes one Vercel can read, plain `vercel deploy --prod`
may start working again and the script becomes unnecessary. Confirm before
deleting it, and keep the reasoning either way — the error message will not
help the next person.

### Behaviour that also exists in the Idea Hub port

The tool was ported into `KhoaVu-Sked/vn-ai-ideas-hub` in September 2026 as
`features/tools/drive/` — a real React port, not a copy of the HTML, with its
own tests under `features/tools/drive/__tests__/`. Two implementations of the
same tool now exist and **nothing connects them**: no shared module, no shared
test, and no check that can see across repositories.

| Also change | Why |
|---|---|
| `features/tools/drive/` in the Idea Hub repo | a behaviour fixed here stays broken there, and the two will be reported as the same tool |
| their tests, in the same change | their port is tested separately; ours passing says nothing about theirs |

Known to match as of 22 Sep 2026: `canFix()` carries the identical
`ownedByMe && canShare` rule, and their `fix.js` additionally refuses at the
write layer — stricter than this repo, which gates in the UI and the dialog.
`remindMailto` exists on both sides.

Working in their repo: this account has **READ** only, so fork
(`tlai-sked/vn-ai-ideas-hub`) → branch → PR, and Khoa merges and ships
production. Their "staging" is the Vercel host
`ts-ai-ideas-hub-staging.vercel.app`, not a git branch — there is no branch by
that name. Read their `CLAUDE.md` and their `docs/change-map.md` first, and run
`bun run check`; they state plainly that a clean `next build` is not
verification.

**The honest options are to accept the drift deliberately or to remove one
copy.** Keeping two by hand is the rule this project already learned does not
hold — it is how three copies of the HTML happened. Nobody has decided yet;
until someone does, treat any change here as half a change.

### Anything that offers to change a file

| Also change | Why |
|---|---|
| route it through `canFix()` | ownership is the gate, not `capabilities.canShare` — Drive reports that true on a file you were merely granted manage rights to |
| `tests/qa_ownership.js` | it covers the tick box, the row action, `Select all`, the access dialog, the plan count and the phone layout. A new surface that can change sharing needs a case there |

Adding a new way to act on a file and forgetting this gate is silent: it looks
right until someone rewrites another team's sharing.

### A function in `apps-script/Code.gs`

| Also change | Why |
|---|---|
| the trigger, if its name changed | `installTrigger` / `installDailyTrigger` / `installWeeklyTrigger` name their handler as a **string** — a rename here breaks the schedule silently, and the failure looks like "the watcher just stopped emailing" |
| `apps-script/appsscript.json` | if the new code touches a new Google service, the pinned `oauthScopes` must list it — otherwise the call fails at runtime, only for users who haven't re-authorised |

The public entry points, as of the last check:
`runCheck`, `checkWatchlist`, `testRun`, `showStatus`, `resetBaseline`,
`installTrigger`, `installDailyTrigger`, `installWeeklyTrigger`, `removeTriggers`.
Everything ending in `_` is private to the file.

### An OAuth scope

| Also change | Why |
|---|---|
| `apps-script/appsscript.json` | pinned deliberately — without it Apps Script infers broader scopes from the code |
| re-authorise the script | existing users keep the old grant until they do; the change appears to work for you and fail for them |
| `docs/architecture.md` and `docs/requirements.md` | the scopes are a security claim about this tool, not a detail |

### The Drive API query strings

`LINK_Q`, `DOMAIN_Q`, `OWNED`, `FILE_FIELDS` in `Code.gs` are **strings sent to
Google**. A typo returns zero rows and no error — the report simply says
everything is fine.

---

## What the checker does not cover

- Whether the Drive queries are *correct* — only that the files agree with each other.
- Whether a trigger is actually installed in the Apps Script project.
- Anything inside the 530KB of inline JS in the HTML.
- <add yours>
