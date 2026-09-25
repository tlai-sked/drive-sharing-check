# Working on the Idea Hub copy

The tool was ported into `KhoaVu-Sked/vn-ai-ideas-hub` as `features/tools/drive/`
— a React port with its own tests, not a copy of `index.html`. This is how to
work on it, and what is different from working here.

Local clone: `~/Documents/Claude/Artifacts/vn-ai-ideas-hub`.

---

## The flow

**Branch → work → PR → review → approve → Khoa merges and ships.** `main` is
never committed to.

Write access was granted on 25 Sep 2026, so branches go straight onto Khoa's
repo and the fork is no longer in the loop. `origin` is his repo.

```bash
cd ~/Documents/Claude/Artifacts/vn-ai-ideas-hub
git checkout main && git pull
git checkout -b feature/<the-work>             # their convention: feature/*
# … change, then verify with THEIR tooling, below …
git push -u origin feature/<the-work>
gh pr create --repo KhoaVu-Sked/vn-ai-ideas-hub --base main
```

`.git/hooks/pre-push` in that clone refuses a push to `main` — local only, not
in the repo. Write access makes that one command able to skip review entirely,
and the hook is the cheapest guard against a mistyped branch name. Override with
`--no-verify` only on purpose.

The old fork (`tlai-sked/vn-ai-ideas-hub`) still exists but nothing points at it
any more. It is the fallback if access is ever withdrawn.

---

## What is different over there

**"Staging" is a Vercel host, not a git branch.** `ts-ai-ideas-hub-staging.vercel.app`,
gated behind `/login` by `middleware.js`. There is no branch called `staging`;
their code checks `isStagingHost` against that hostname.

**Previews build by themselves now.** A same-repo PR gets a Vercel preview with
nobody authorising anything — confirmed on PR #14. While the work came from a
fork, Vercel refused to build and posted a failing check linking to
`vercel.com/git/authorize`, which was never a broken build. That is over.

The preview URL is behind **Vercel SSO**, so opening it needs a login with
access to the "Khoa Vu" team, not just the link.

**Verify with their tooling, not ours.** Their rules, from their `CLAUDE.md`:

```
bun run check     # couplings next build cannot see. Runs without env vars.
bun test          # their suites
```

They state plainly that a clean `next build` is *not* verification. `bun` is
required — npm cannot run `bun test`.

**Running it locally needs secrets we do not have.** `.env.local` wants 15
variables including `DATABASE_URL` (Neon) and `NEXT_PUBLIC_GOOGLE_DRIVE_CLIENT_ID`.
Ask Khoa. Reading and testing the Drive feature needs none of them.

---

## Their rules that bite

Read their `CLAUDE.md` and `docs/change-map.md` before editing. The ones that
apply to the Drive feature:

- **No API route may import it, and no server file may call the Drive API.**
  `bun run check` fails if one does. The tool runs in the browser with the
  user's own token and keeps nothing — the same security position as here.
- **If a change to the Drive tool produces a migration, the change is wrong.**
- **The database and the code deploy separately.** Run the migration first, then
  merge. New code against an old database throws `column … does not exist`.
- **`constants.js` and their `apps-script/Code.gs` are duplicated** the same way
  ours are, and their checker compares them by decoded value.

Their change-map already records the awkward part: *"There is a third copy —
Thao Lai's original tool, still live. This checker cannot see that one."*

---

## Where their port is behind this one

Re-measured 25 Sep 2026 by reading the source. The port has moved fast — treat
any older version of this table as wrong:

| | Here | Their port |
|---|---|---|
| Scan, classify, bulk change, expiry, watched folders | yes | yes |
| Remind owner, `canFix` ownership gate | yes | yes, and refused at the write layer too |
| Paged results | yes | yes |
| Plan time to fix | yes | yes |
| People picker when sharing | yes | yes |
| Severity summary, search, folder trails | partly | yes — ahead of here |
| "Shared with me" scope | yes, hidden | no |
| Jump to section | yes | no |
| Docked phone action bar | yes | no |

Two rows of this table have been wrong before, both from the same mistake:
grepping for a word rather than for what a user can see. `page` matched
`pageToken`, Drive's *API* paging; a pattern for `paths.js` matched nothing
while the file sat there. Open the file before writing a row.

Their port is now ahead of this one in places — a severity summary, search, and
folder trails showing where a finding actually lives.

**Their app has no width-based breakpoints at all** — `globals.css` carries only
`prefers-reduced-motion`, and there is no `matchMedia` hook anywhere. Porting the
phone action bar would introduce the first breakpoint in their codebase. That is
a convention decision for Khoa, not something to slip into a PR.
