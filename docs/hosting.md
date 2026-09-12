# Hosting, deploying, and OAuth origins

Everything about where this runs and how it gets there. `CLAUDE.md` carries
only the rules; the reasoning is here.


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

**Where these settings live in the console.** Google replaced the old "OAuth
consent screen" page with **Google Auth Platform**, and the two things you need
are on different pages of it: Authorised JavaScript origins are under
**Clients**, and the Internal/External setting is under **Audience**. Check you
are in the right GCP project first — the numeric prefix of the client ID is the
project number, and adding an origin to the wrong client looks exactly like
doing nothing.

**Every hosted origin has to be registered on that same client.** A new host
means a new entry. Who may sign in is decided by the client's consent screen,
not by the page: ours is **Internal**, which is what keeps a public URL from
being a public tool.

**A sign-in that fails on a phone is usually not a phone problem.** The mobile
Run check failed for a while on the old Netlify build and was assumed to be iOS
popup blocking. It was an unregistered origin. The tool distinguishes the two
in its error text — "Google refused the sign-in request" means the origin,
"the browser blocked the sign-in window" means popups — so read the exact
words before chasing the device. The symptom appears on the phone; the cause is
one line in the Google console.

**Sign-in cannot work on preview deployments.** Every preview gets a fresh
hostname and Google does not allow wildcard origins, so a preview can only ever
show the page, never complete a sign-in. Test sign-in on production. This is
the same constraint that blocks the Idea Hub move in Outstanding 1.

Vercel serves the HTML as `cache-control: public, max-age=0, must-revalidate`
by default, which is what the build stamp exists to protect against. Confirmed
on the live URL; no `vercel.json` is needed to get it.

---

## The build stamp

The drawer footer shows `DD Mon HH:MM · <sha1 prefix>`. It exists because a
stale browser cache cost two rounds of debugging a bug that was already fixed.
It is also what `scripts/deploy.sh` compares against the live page, so a deploy
that silently served the old file fails instead of passing quietly.

Regenerate it after **any** edit to `index.html`:

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

The hash is taken with the stamp removed, so the same content always produces
the same digest no matter when it was stamped.

If the page in a browser shows an older stamp than the file on disk, it is a
cache, not a bug. Reload with Cmd+Shift+R before debugging anything else — this
has wasted time more than once, including while fixing the mobile layout.

---

## Pushing to GitHub

The repo is private under the **`tlai-sked`** account. This machine has two
GitHub accounts authenticated, and the active one has reverted to
`laithienthao-dev` more than once between sessions. That account cannot see a
private repo owned by the other, so the push fails with:

```
remote: Repository not found.
```

which reads like the repo was deleted. It was not. Check and switch:

```
gh auth status
gh auth switch --user tlai-sked
```

Commits are authored as `Thao Lai <tlai@skedulo.com>` from `git config`
regardless of which account is active, so the authorship is never the problem —
only the push.
