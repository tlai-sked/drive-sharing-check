# Architecture, and why it is like this

Each decision here was made against an alternative that looked easier. The
alternative is named so nobody re-proposes it by accident.


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
