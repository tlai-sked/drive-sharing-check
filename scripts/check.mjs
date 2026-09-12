// Checks the couplings nothing else can see.
//
// This project has no build step and no test suite, so there is nothing that
// would ever tell you the two HTML copies drifted apart — the tool keeps
// working, just differently depending on which file you opened.
//
//   node scripts/check.mjs
//
// Exits non-zero, so it works in a pre-push hook.
//
// ── HOW TO EXTEND ────────────────────────────────────────────────
// Add a check the FIRST time something gets past you, not before. Every check
// below names a mistake that had already happened when it was written.

import { readFileSync, existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const problems = [];
const fail = (check, detail, why) => problems.push({ check, detail, why });

// ── 1. The HTML copies must be byte-identical ─────────────────────
// CLAUDE.md states the rule: "Byte-identical copy, named for web hosting.
// Keep in sync after every change." Nothing enforced it, and they drifted by
// 207 chunks — so the hosted page and the local page behaved differently.
{
  const copies = ["index.html", "drive-sharing-check-local.html", "drive-check/index.html"]
    .filter(existsSync);

  const hash = (p) => createHash("md5").update(readFileSync(p)).digest("hex");
  const seen = new Map();
  for (const p of copies) seen.set(p, hash(p));

  const distinct = new Set(seen.values());
  if (distinct.size > 1) {
    const newest = copies.reduce((a, b) => (statSync(a).mtimeMs > statSync(b).mtimeMs ? a : b));
    for (const [p, h] of seen) {
      if (h !== seen.get(newest)) {
        fail("html-copies-drifted", p,
          `differs from ${newest} (the newest). CLAUDE.md requires these be identical`);
      }
    }
  }
}

// ── 2. Files named in CLAUDE.md must exist ────────────────────────
// The Files table listed apps-script/README.md, which was never written. A
// table of contents pointing at nothing is worse than no table.
{
  const doc = read("CLAUDE.md");
  for (const [, path] of doc.matchAll(/`([\w./-]+\.(?:html|gs|json|md|command|mjs))`/g)) {
    if (!existsSync(path)) {
      fail("doc-names-missing-file", `CLAUDE.md mentions \`${path}\``, "no such file");
    }
  }
}

// ── 3. Every HTML copy must be listed in CLAUDE.md ────────────────
// drive-check/index.html appeared as a third copy and was documented nowhere,
// so nobody could know whether it mattered.
{
  const doc = read("CLAUDE.md");
  for (const p of ["index.html", "drive-sharing-check-local.html", "drive-check/index.html"]) {
    if (existsSync(p) && !doc.includes(p)) {
      fail("undocumented-copy", p, "exists but CLAUDE.md never mentions it");
    }
  }
}

// ── 4. OAuth scopes must stay pinned ──────────────────────────────
// appsscript.json pins the scopes on purpose: without it Apps Script infers
// broader ones from the code. An empty or missing list is a silent widening.
{
  const raw = read("apps-script/appsscript.json");
  if (raw) {
    try {
      const scopes = JSON.parse(raw).oauthScopes;
      if (!Array.isArray(scopes) || scopes.length === 0) {
        fail("scopes-not-pinned", "apps-script/appsscript.json",
          "oauthScopes is empty — Apps Script will infer broader scopes");
      }
    } catch {
      fail("bad-json", "apps-script/appsscript.json", "not valid JSON");
    }
  }
}

// ── report ────────────────────────────────────────────────────────
if (problems.length === 0) {
  console.log("✓ checks passed");
  process.exit(0);
}
const byCheck = {};
for (const p of problems) (byCheck[p.check] ||= []).push(p);
for (const [check, list] of Object.entries(byCheck)) {
  console.log(`\n${check} (${list.length})`);
  for (const p of list) console.log(`  ${p.detail}\n     ${p.why}`);
}
console.log(`\n${problems.length} problem(s).`);
process.exit(1);
