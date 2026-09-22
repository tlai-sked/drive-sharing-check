# Working on the Idea Hub copy

The tool was ported into `KhoaVu-Sked/vn-ai-ideas-hub` as `features/tools/drive/`
— a React port with its own tests, not a copy of `index.html`. This is how to
work on it, and what is different from working here.

Local clone: `~/Documents/Claude/Artifacts/vn-ai-ideas-hub`.

---

## The flow

**Fork from main → branch from the fork → work → PR → review → approve.** Nothing
is pushed to Khoa's repo directly, and the fork's `main` is never committed to.

```
KhoaVu-Sked/vn-ai-ideas-hub  main          ← upstream, read-only here
        │ fork
tlai-sked/vn-ai-ideas-hub    main          ← origin, kept identical to upstream
        │ branch
        feature/<the-work>                 ← every change lives here
        │ PR
KhoaVu-Sked/vn-ai-ideas-hub  main          ← Khoa reviews, approves, merges, ships
```

```bash
cd ~/Documents/Claude/Artifacts/vn-ai-ideas-hub
git checkout main && git pull                  # main tracks upstream/main
git checkout -b feature/<the-work>             # their convention: feature/*
# … change, then verify with THEIR tooling, below …
git push -u origin feature/<the-work>          # to the fork, never upstream
gh pr create --repo KhoaVu-Sked/vn-ai-ideas-hub --base main
```

`upstream`'s push URL is deliberately set to `DISABLED_read_only_upstream`, so a
mistyped `git push upstream` fails loudly instead of attempting a write.

Keeping the fork current: `gh repo sync tlai-sked/vn-ai-ideas-hub --source
KhoaVu-Sked/vn-ai-ideas-hub`. It was 205 commits behind when this started.

---

## What is different over there

**We have READ on Khoa's repo.** Not write. That is why the flow is a fork and
not a branch on his repo. If the intention is for Thao to work on staging
directly, that access has not been granted — worth asking rather than assuming.

**"Staging" is a Vercel host, not a git branch.** `ts-ai-ideas-hub-staging.vercel.app`,
gated behind `/login` by `middleware.js`. There is no branch called `staging`;
their code checks `isStagingHost` against that hostname.

**A PR from a fork gets no preview build.** Vercel refuses to build fork PRs
automatically — a fork PR could read the project's secrets — and posts a failing
check linking to `vercel.com/git/authorize`. That is not a broken build. Khoa has
to authorise it, every time, until the access question above is settled.

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

Verified 22 Sep 2026 by reading the source, not by running it:

| | Here | Their port |
|---|---|---|
| Scan, classify, bulk change, expiry, watched folders, pagination | yes | yes |
| Remind owner, `canFix` ownership gate | yes | yes, and refused at the write layer too |
| "Shared with me" scope | yes, hidden | no |
| Plan time to fix (Calendar) | yes | no |
| People picker when sharing | yes | no |
| Jump to section | yes | no |
| Docked phone action bar | yes | no |

**Their app has no width-based breakpoints at all** — `globals.css` carries only
`prefers-reduced-motion`, and there is no `matchMedia` hook anywhere. Porting the
phone action bar would introduce the first breakpoint in their codebase. That is
a convention decision for Khoa, not something to slip into a PR.
