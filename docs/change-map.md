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
| the build stamp in the drawer footer | it is how you tell a stale cached page from a fresh one. A wrong stamp already cost two rounds of debugging a bug that was fixed. The recipe is in `CLAUDE.md` |
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
| `CLAUDE.md` | the scopes are a security claim about this tool, not a detail |

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
