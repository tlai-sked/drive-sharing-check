# Requirements and standing decisions

What this tool must do, what it must never do, and the decisions that are
settled. Change one of these only on purpose, with the owner's agreement — not
because a refactor made it convenient.

Each rule says what it protects. A rule whose reason no longer holds should be
deleted, not quietly worked around.

---

## Must never

**Never read file contents.** The scan reads names and sharing settings. The
page holds `drive.metadata.readonly` for scanning precisely so that reading
contents is not possible, not merely not done.

**Never store anything centrally.** No server, no database, no refresh tokens,
anywhere, for any convenience. A list of "every publicly shared file at
Skedulo" would be the most attackable object this project could create. The
browser talks to Google with the signed-in user's own token and keeps nothing.

**Never change a file the signed-in user does not own.** Drive would refuse the
write, but that is not the reason — re-sharing another team's document is not
this tool's call. Those files are listed and classified, and offer only
*Remind owner*. The gate is `canFix()` (`ownedByMe && canShare`), and every
surface that can change something goes through it.

**Never invent who has access.** On files owned by other people Drive returns
link and organisation-wide grants but hides named individual grants. Risk
levels are reliable there; the list of specific people is not. Say nothing
rather than guess.

**Never read permissions file by file in the bulk scan.** An earlier version
did and earned HTTP 429 plus a five-hour rate limit. Scanning is ~3 API calls
using Drive's `visibility=` search terms.

**Never serve the repo's internal notes.** `.vercelignore` is an allowlist:
only `index.html` goes up. `CLAUDE.md` and `docs/` name people, internal repos
and open security questions.

**Never commit a second copy of the HTML.** There were three once, all carrying
the same build stamp yet differing in content. `scripts/check.mjs` fails if a
second `.html` appears.

---

## Must

**Ask for the narrowest scope, as late as possible.** Scanning needs only
`drive.metadata.readonly`. The write scope is requested on first use of Change,
and `drive.file` on first settings save — never at page load.

**Say why a control is disabled, next to it.** `saveBlockedReason()` is the
pattern. A greyed-out button with no explanation is a dead end.

**Keep the risk rules identical in both halves.** The page and the Apps Script
classify independently. If they diverge, an email and the page disagree about
the same file.

**Update the build stamp after any edit to `index.html`.** It is how anyone
tells a stale cached page from a fresh one; a wrong stamp already cost two
rounds of debugging a bug that was already fixed.

**Check every visual change at 390px.** The phone is a first-class surface, not
an afterthought — the tool is opened on one regularly.

---

## Settled decisions

| Decision | Why, and what it rules out |
|---|---|
| The scheduled watcher is Apps Script, not a service | It runs as the user inside Google, so no credential is stored anywhere. A server version needs a long-lived token per person in a database. |
| Settings travel through a Drive file's `description` | A web page cannot reconfigure an Apps Script project. A description is metadata, readable with the scope the script already holds. |
| One HTML file, no build step | What is in the file is what runs. No bundler, no transpiler, no drift between source and artefact. |
| Deploys go through `scripts/deploy.sh` | `vercel deploy` from the repo root hangs on this repo's private git remote. See `docs/hosting.md`. |
| The GitHub repo is private | The docs name colleagues, internal repos, and unresolved security questions. |
| The OAuth consent screen is Internal | The Vercel URL is public; the consent screen is what keeps the tool to Skedulo accounts. |
| Motion answers a user action only | Seven simultaneous alarm effects were removed. Nothing pulses, blinks or glows on its own. |
| Design tokens are Skedulo Breeze | `--n900`…`--n0`, `--blue800`, `--red600`, `--orange600`, `--green700`. No new colours. |

---

## Not this tool's job

**Preventing the next mistake.** Moving files into better-organised folders
does not fix existing over-sharing — Drive permissions are additive and travel
with the file. Remediation and prevention are separate jobs; this tool does the
first. Anyone proposing a folder restructure as a fix for over-sharing has
misread the problem.

**Chasing down other people.** The tool composes a reminder and hands it to the
user's mail client. It does not send mail, track whether anyone replied, or
keep a list of offenders.
