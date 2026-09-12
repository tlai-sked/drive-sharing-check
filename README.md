# Drive sharing check

Finds Google Drive files that are shared more widely than you meant, lets you
fix them in place, and watches nominated folders on a timer.

**Live:** https://drive-sharing-check.vercel.app — sign in with your Skedulo
account. Nothing to install.

Owner: Thao Lai (tlai@skedulo.com), Technical Support Engineering.

---

## What it does

- Scans your Drive for anything shared by link or shared with the whole
  organisation, and sorts it by how wide the access is.
- Lets you narrow or remove that access without leaving the page.
- Optionally watches folders you name and emails you when their sharing
  changes — including folders other people own.

It never reads file contents. It reads names and sharing settings only.

## What it deliberately is not

**There is no server and no database.** Your browser calls the Google Drive API
with your own token, and nothing is stored anywhere central. A database listing
"every publicly shared file at Skedulo" would itself be worth attacking, so
there isn't one.

**The scheduled watcher is Google Apps Script, not a service.** It runs as you,
inside Google, so no refresh token is stored anywhere.

**There is no build step.** `index.html` is the whole tool — CSS, JS and icons
in one file, with no dependencies beyond Google's sign-in library.

`CLAUDE.md` explains the reasoning behind each of these, and the mistakes that
led to them. Read it before changing anything.

---

## Run it locally

```
./start-drive-sharing-check.command
```

It serves the folder on port 8000 and opens the page.

**The port has to be 8000.** Google refuses `file://` addresses, and
`localhost:3000` and `127.0.0.1:8000` are *different origins* to Google — every
one of them is refused at sign-in. `http://localhost:8000` is the address
registered on the OAuth client. By hand, `python3 -m http.server 8000` does the
same job.

## Tests

```
npm install      # jsdom, once
npm test         # every suite
```

One suite on its own: `node tests/qa_email.js`. Suites matching a name:
`node tests/run-all.mjs email`.

`node scripts/check.mjs` is separate — a consistency checker for the couplings
nothing else can see, such as constants that exist in both the page and the
Apps Script. The pre-push hook runs both:

```
git config core.hooksPath scripts/git-hooks    # once per clone
```

## Deploy

```
vercel deploy --prod
```

`.vercelignore` is an allowlist: only `index.html` is uploaded, because this
repo carries internal notes that must not be served publicly. After deploying,
confirm `/CLAUDE.md` returns 404 and not 200.

Any new hosting origin must also be added to **Authorised JavaScript origins**
on the OAuth client in the Google Cloud console, or nobody can sign in.

---

## The scheduled watcher

`apps-script/` is independent of the web page. It is not the page's backend —
it is a separate program that emails you when watched sharing changes.

Setting it up, once:

1. Create a project at [script.google.com](https://script.google.com).
2. Paste `apps-script/Code.gs` over the default `Code.gs`.
3. In **Project Settings**, tick *Show "appsscript.json" manifest file*, then
   replace that file with `apps-script/appsscript.json`. This pins the OAuth
   scopes — without it Apps Script infers broader ones from the code.
4. Under **Services**, add **Drive API** and choose **v3**. The script uses the
   advanced Drive service and will not run without it.
5. Run `runCheck` once. Google will ask you to authorise it. That first run also
   installs the trigger, so it is the whole setup.

After that, configure it from the web page under **Scheduled monitoring** —
which folders to watch, who gets the email, how often, and pause or resume. The
page cannot reconfigure an Apps Script project directly, so it writes those
settings into the description of a Drive file called
`Drive sharing check — settings`, and the script reads them on its next run.
Status comes back the same way, through `Drive sharing check — status`.

Other functions you can run by hand from the editor: `testRun`, `showStatus`,
`checkWatchlist`, `resetBaseline`, `removeTriggers`.

---

## A thing worth knowing

Moving files into better-organised folders does **not** fix existing
over-sharing. Drive permissions are additive and travel with the file, so a
document shared with "anyone with the link" stays shared with anyone with the
link wherever you put it. Cleaning up what is already shared and preventing the
next mistake are two separate jobs; this tool is for the first.

---

## Where the rest is written down

| File | What it holds |
|---|---|
| `CLAUDE.md` | Architecture and why it is like this, the hard-won gotchas, conventions, current state |
| `docs/change-map.md` | What else you have to change when you change something |
| `scripts/check.mjs` | The couplings a script can catch, each one added after it got past someone |
