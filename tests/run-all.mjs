// Runs every suite and aggregates the result.
//
//   node tests/run-all.mjs          all suites
//   node tests/run-all.mjs email    only suites whose name contains "email"
//
// A suite that crashes prints no summary line, so an aggregate that only
// counted "N passed, M failed" lines would quietly report success for a suite
// that never ran a single test. Each suite is therefore judged on three things:
// its exit code, the presence of a summary, and the summary's own numbers.

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2] || "";

const suites = readdirSync(HERE)
  .filter((name) => name.startsWith("qa_") && name.endsWith(".js"))
  .filter((name) => name.includes(filter))
  .sort();

if (!suites.length) {
  console.error(filter ? `No suite matches "${filter}".` : "No suites found.");
  process.exit(1);
}

const SUMMARY = /^(\d+) passed, (\d+) failed$/m;
let totalPassed = 0;
let totalFailed = 0;
const broken = [];

for (const name of suites) {
  const run = spawnSync(process.execPath, [join(HERE, name)], { encoding: "utf8" });
  const output = (run.stdout || "") + (run.stderr || "");
  const match = SUMMARY.exec(output);

  if (!match) {
    broken.push(name);
    console.log(`\n${name}  — CRASHED, no summary printed`);
    console.log(output.trim().split("\n").slice(-12).map((l) => `    ${l}`).join("\n"));
    continue;
  }

  const passed = Number(match[1]);
  const failed = Number(match[2]);
  totalPassed += passed;
  totalFailed += failed;

  // A summary saying zero failures while the process exited non-zero means the
  // suite fell over after printing. Treat it as broken, not as a pass.
  if (failed === 0 && run.status !== 0) {
    broken.push(name);
    console.log(`\n${name}  — exited ${run.status} despite a clean summary`);
    continue;
  }

  console.log(`${failed ? "FAIL" : "ok  "}  ${name.padEnd(22)} ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    for (const line of output.split("\n")) {
      if (line.startsWith("  FAIL") || line.startsWith("        ")) console.log(`  ${line}`);
    }
  }
}

console.log("\n" + "-".repeat(52));
console.log(`${suites.length} suites · ${totalPassed} passed, ${totalFailed} failed` +
  (broken.length ? ` · ${broken.length} crashed` : ""));

if (broken.length) {
  console.log(`crashed: ${broken.join(", ")}`);
}
process.exit(totalFailed || broken.length ? 1 : 0);
