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

import { readFileSync, readdirSync, existsSync } from "node:fs";

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");
const problems = [];
const fail = (check, detail, why) => problems.push({ check, detail, why });

// ── 1. There must be exactly one HTML file ────────────────────────
// There were three, all carrying the same build stamp yet differing in
// content — so the stamp could not tell them apart, and the oldest was
// missing a whole feature. A second copy is how that starts again.
{
  const stray = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === ".git" || e.name === "node_modules") continue;
      const p = dir === "." ? e.name : `${dir}/${e.name}`;
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".html") && p !== "index.html") stray.push(p);
    }
  };
  walk(".");
  for (const p of stray) {
    fail("second-html-copy", p,
      "only index.html should exist — rename or symlink at deploy time instead");
  }
  if (!existsSync("index.html")) {
    fail("missing-tool", "index.html", "the tool itself is gone");
  }
}

// ── 2. Files named in the CLAUDE.md table must exist ──────────────
// The Files table listed apps-script/README.md, which was never written. A
// table of contents pointing at nothing is worse than no table.
//
// Only TABLE ROWS are checked. Prose may name a file that is deliberately gone
// — the history of why a copy was deleted is worth keeping.
{
  for (const line of read("CLAUDE.md").split("\n")) {
    if (!line.trimStart().startsWith("|")) continue;
    for (const [, path] of line.matchAll(/`([\w./-]+\.(?:html|gs|json|md|command|mjs))`/g)) {
      if (!existsSync(path)) {
        fail("doc-names-missing-file", `CLAUDE.md table lists \`${path}\``, "no such file");
      }
    }
  }
}

// ── 3. OAuth scopes must stay pinned ──────────────────────────────
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

// ── 4. Constants duplicated across the page and the script ────────
// index.html and apps-script/Code.gs are separate programs that have to agree.
// Nothing at runtime notices when they drift: a changed Drive query returns
// zero rows and no error, so the report says everything is fine, and a changed
// settings/status filename makes the two halves stop finding each other's
// files in silence. Grep will not catch it either — the script spells the em
// dash as the escape \u2014 where the page uses a literal one, so the two
// spellings of the same string do not match as text. Compare decoded values.
{
  const SHARED = ["LINK_Q", "DOMAIN_Q", "OWNED", "SETTINGS_NAME", "STATUS_NAME"];
  const page = read("index.html");
  const script = read("apps-script/Code.gs");

  const decode = (lit) =>
    lit
      .slice(1, -1)
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\(.)/g, "$1");

  const valueOf = (src, name) => {
    const m = src.match(
      new RegExp(`\\bconst ${name}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*"|'(?:[^'\\\\]|\\\\.)*')\\s*;`)
    );
    return m ? decode(m[1]) : null;
  };

  if (page && script) {
    for (const name of SHARED) {
      const inPage = valueOf(page, name);
      const inScript = valueOf(script, name);
      if (inPage === null || inScript === null) {
        const where = inPage === null ? "index.html" : "apps-script/Code.gs";
        fail("shared-constant-missing", name,
          `not found in ${where} — if it was renamed, this check is now blind to it`);
      } else if (inPage !== inScript) {
        fail("shared-constant-drift", name,
          `index.html has ${JSON.stringify(inPage)}, ` +
          `apps-script/Code.gs has ${JSON.stringify(inScript)}`);
      }
    }
  }
}

// ── 5. CLAUDE.md has to stay short enough to be read ──────────────
// It is loaded into context on every session, so length is a cost paid every
// time. When it outgrew this, the detail moved into docs/ and CLAUDE.md kept
// the rules and the pointers. Raising the cap is not the fix.
{
  const LIMIT = 200;
  const lines = read("CLAUDE.md").split("\n").length;
  if (lines > LIMIT) {
    fail("claude-md-too-long", `CLAUDE.md is ${lines} lines`,
      `over the ${LIMIT}-line cap — move detail into docs/ and link to it, do not raise the cap`);
  }
}

// ── 6. Nothing may point at instructions that are not there ───────
// Trimming CLAUDE.md moved the build-stamp recipe out and left a pointer to a
// document that did not contain it. The pointer looked fine; the recipe was
// gone. Anything named as "the recipe is in X" has to actually be in X.
{
  const stamp = read("docs/hosting.md");
  if (!stamp.includes("hashlib") || !stamp.includes("buildStamp")) {
    fail("missing-build-stamp-recipe", "docs/hosting.md",
      "CLAUDE.md sends people here for the build-stamp recipe, and it is not here");
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
