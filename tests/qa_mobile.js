// Mobile: the phone action bar, and the controls a change-access flow needs at
// 390px.
//
// jsdom applies no @media rules at all — getComputedStyle returns desktop
// values at every window width, verified. So layout claims are asserted
// against the stylesheet text, and behaviour is asserted against the DOM. A
// test here that calls getComputedStyle and believes the answer is testing
// nothing.

import { loadPage, suite, assert, equal, includes } from "./harness.mjs";

const s = suite("Mobile flow");

const PHONE = 390;
const styleText = (page) =>
  [...page.document.querySelectorAll("style")].map((n) => n.textContent).join("\n");

/** The phone block is, by convention, the last `max-width: 640px` block. */
function phoneBlock(css) {
  const marker = "@media (max-width: 640px) {";
  const start = css.lastIndexOf(marker);
  assert(start !== -1, "no phone block in the stylesheet");
  let depth = 0;
  for (let i = start + marker.length - 1; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(start, i + 1);
    }
  }
  throw new Error("the phone block is not balanced");
}

s.test("jsdom still ignores @media, so these tests must read the stylesheet", () => {
  const page = loadPage({ width: PHONE });
  const bar = page.el("mobileBar");
  equal(page.window.getComputedStyle(bar).display, "none",
    "jsdom started applying @media — these tests can be rewritten to use computed styles");
  page.close();
});

s.test("the phone block exists and is last, as the convention says", () => {
  const page = loadPage();
  const css = styleText(page);
  const block = phoneBlock(css);
  assert(block.length > 200, "the phone block is suspiciously small");
  assert(css.indexOf("@media (max-width: 900px)") < css.lastIndexOf("@media (max-width: 640px)"),
    "the tablet block now comes after the phone block, so it overrides it");
  page.close();
});

s.test("the action bar is hidden by default and shown only on phones", () => {
  const page = loadPage();
  const css = styleText(page);
  assert(/\.mobile-bar\s*\{\s*display:\s*none/.test(css),
    "the action bar must be hidden by default, or it appears on desktop");
  includes(phoneBlock(css), ".mobile-bar");
  page.close();
});

s.test("the selection bar replaces the action bar rather than stacking on it", () => {
  const page = loadPage();
  includes(phoneBlock(styleText(page)), "body.sel-open .mobile-bar",
    "without this rule both bars sit on top of each other at the bottom of the screen");
  page.close();
});

// ── the bar mirrors the real controls ─────────────────────────────
// It owns no logic. Everything below is about that mirroring staying true,
// because a phone user has no other way to reach these actions.

s.test("the phone Run button forwards to the real one", () => {
  const page = loadPage({ width: PHONE });
  let clicked = 0;
  page.el("run").addEventListener("click", () => { clicked += 1; });
  page.el("mRun").dispatchEvent(new page.window.MouseEvent("click", { bubbles: true }));
  equal(clicked, 1, "the phone Run button did not reach the real Run button");
  page.close();
});

s.test("the phone Plan button forwards to the real one", () => {
  const page = loadPage({ width: PHONE });
  let clicked = 0;
  page.el("planBtn").addEventListener("click", () => { clicked += 1; });
  page.el("mPlan").dispatchEvent(new page.window.MouseEvent("click", { bubbles: true }));
  equal(clicked, 1);
  page.close();
});

s.test("disabling Run disables the phone button too", async () => {
  const page = loadPage({ width: PHONE });
  equal(page.el("mRun").disabled, page.el("run").disabled, "they start out of step");

  page.el("run").disabled = true;
  await new Promise((r) => setTimeout(r, 0));       // MutationObserver is async
  equal(page.el("mRun").disabled, true,
    "the phone button stayed live while the real one was disabled");

  page.el("run").disabled = false;
  await new Promise((r) => setTimeout(r, 0));
  equal(page.el("mRun").disabled, false);
  page.close();
});

s.test("showing Plan shows the phone Plan button", async () => {
  const page = loadPage({ width: PHONE });
  page.el("planBtn").hidden = false;
  await new Promise((r) => setTimeout(r, 0));
  equal(page.el("mPlan").hidden, false);

  page.el("planBtn").hidden = true;
  await new Promise((r) => setTimeout(r, 0));
  equal(page.el("mPlan").hidden, true);
  page.close();
});

s.test("opening the selection bar marks the body so the bars do not collide", async () => {
  const page = loadPage({ width: PHONE });
  page.el("selectionBar").hidden = false;
  await new Promise((r) => setTimeout(r, 0));
  assert(page.document.body.classList.contains("sel-open"),
    "body.sel-open was not set, so both bottom bars would show at once");

  page.el("selectionBar").hidden = true;
  await new Promise((r) => setTimeout(r, 0));
  assert(!page.document.body.classList.contains("sel-open"));
  page.close();
});

// ── change access, on a phone ─────────────────────────────────────

s.test("every control the change-access flow needs is present and reachable", () => {
  const page = loadPage({ width: PHONE });
  for (const id of ["accessScrim", "accessWho", "broadChoice", "accessRole",
                    "applyAccess", "cancelAccess"]) {
    const node = page.el(id);
    assert(node, `#${id} is missing — the change flow cannot complete on a phone`);
  }
  page.close();
});

s.test("the access dialog's segmented controls get their end caps on a phone too", () => {
  const page = loadPage({ width: PHONE });
  page.window.markSegEnds();
  for (const id of ["broadChoice", "accessRole"]) {
    const seg = page.el(id);
    const shown = [...seg.querySelectorAll("button")].filter((b) => !b.hidden);
    assert(shown.length > 0, `#${id} has no visible buttons`);
    assert(shown[0].classList.contains("seg-first"), `#${id} lost its first cap`);
    assert(shown[shown.length - 1].classList.contains("seg-last"), `#${id} lost its last cap`);
  }
  page.close();
});

// ── the scope picker at 390px ─────────────────────────────────────
// Both bugs below were reported from a phone and measured in Chrome at 390px.
// jsdom cannot lay out, so these guard the CSS that produced the numbers rather
// than the numbers themselves. The measurements are in the comments; redo them
// in a browser if you change these rules.

s.test("the scope field's flex-basis cannot become a height", () => {
  // .combo is sized `flex: 1 1 340px` for the desktop row. The phone block
  // turns that row into a column, and flex-basis is measured along the main
  // axis — so 340px silently became a HEIGHT. The results list is positioned at
  // `top: calc(100% + 4px)` of .combo, so it landed 344px below the field:
  // measured gap between field and results was 310px, results off-screen.
  const page = loadPage();
  const css = styleText(page);
  const block = phoneBlock(css);

  assert(/\.combo\s*\{[^}]*flex:\s*1\s+1\s+340px/.test(css),
    "the desktop .combo rule changed — re-measure before trusting this guard");
  assert(/\.scope-target\s*\{[^}]*flex-direction:\s*column/.test(block),
    "the scope row no longer stacks on phones, so this guard may be obsolete");

  const rule = /\.scope-target\s+\.combo\s*\{([^}]*)\}/.exec(block);
  assert(rule, ".scope-target has no phone rule for .combo at all");
  assert(/flex:\s*0\s+0\s+auto/.test(rule[1]),
    "the combo keeps its 340px flex-basis, which a column reads as a height");
  page.close();
});

s.test("both scope buttons keep a bottom border", () => {
  // They sit side by side, so each needs its whole box. The stacked-layout rule
  // above treats the bottom edge as a divider between rows and drops it.
  const page = loadPage();
  const block = phoneBlock(styleText(page));

  const base = /\.scope-bar\s+\.seg\s+button\s*\{([^}]*)\}/.exec(block);
  assert(base, "no phone rule for the scope buttons");
  assert(!/border-bottom-width:\s*0(?!\.)/.test(base[1]),
    "the scope buttons zero their bottom border, leaving the row open underneath");
  assert(/border-bottom-width:\s*1px/.test(base[1]), "no bottom border width is set");
  page.close();
});

s.test("the last scope button restores the border style, not only its width", () => {
  // The stacked rule sets `border-bottom: none`. `none` is a border STYLE, and
  // a border with no style computes to 0px however wide it is declared — so
  // setting the width alone left the right-hand button open at the bottom.
  // Verified in Chrome: borderBottomStyle "none", borderBottomWidth "0px".
  const page = loadPage();
  const block = phoneBlock(styleText(page));

  assert(/\.seg\s+button\.seg-last\s*\{[^}]*border-bottom:\s*none/.test(block),
    "the stacked rule no longer drops the bottom edge — this guard may be obsolete");

  const last = /\.scope-bar\s+\.seg\s+button\.seg-last\s*\{([^}]*)\}/.exec(block);
  assert(last, "no phone rule for the last scope button");
  assert(/border-bottom-width:\s*1px/.test(last[1]), "seg-last sets no bottom width");
  assert(/border-bottom-style:\s*solid/.test(last[1]),
    "seg-last restores the width but not the style, so it still computes to 0px");
  page.close();
});

s.test("the pressed scope button's bottom edge matches its other three", () => {
  // Without this the selected button is a blue box with one grey edge.
  const page = loadPage();
  const block = phoneBlock(styleText(page));
  assert(/\.scope-bar\s+\.seg\s+button\[aria-pressed="true"\]\s*\{[^}]*border-bottom-color:\s*var\(--blue800\)/.test(block),
    "the pressed button would show a grey bottom edge on a blue box");
  page.close();
});

s.test("the results table drops its column headers rather than overflowing", () => {
  const page = loadPage();
  const css = phoneBlock(styleText(page));
  includes(css, ".thead");
  assert(/\.thead\s*\{\s*display:\s*none/.test(css),
    "column headers must be hidden on a phone, where there are no columns");
  includes(css, ".cell-label", "each cell needs its own label once the headers are gone");
  page.close();
});

s.test("the drawer takes the whole screen on a phone", () => {
  const page = loadPage();
  includes(phoneBlock(styleText(page)), ".drawer");
  page.close();
});

await s.done();
