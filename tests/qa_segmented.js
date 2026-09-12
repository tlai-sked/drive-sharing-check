// Segmented controls: the end caps must land on the first and last *visible*
// buttons.
//
// :first-child and :last-child still match hidden elements. Hiding the
// "Shared with me" button therefore left the group's right-hand end cap on an
// invisible button — no right border, no rounded corner, and nothing in the
// markup to suggest why.

import { loadPage, suite, assert, equal } from "./harness.mjs";

const s = suite("Segmented controls");

const visible = (seg) => [...seg.querySelectorAll("button")].filter((b) => !b.hidden);
const capped = (seg, cls) => [...seg.querySelectorAll("button")].filter((b) => b.classList.contains(cls));

s.test("the CSS still relies on the classes, not on :last-child", () => {
  const page = loadPage();
  const css = page.document.querySelector("style").textContent;
  assert(css.includes(".seg-first"), "no .seg-first rule — has the approach changed?");
  assert(css.includes(".seg-last"), "no .seg-last rule — has the approach changed?");
  page.close();
});

s.test("the hidden scope button exists, so the gotcha is still live", () => {
  const page = loadPage();
  const hidden = page.document.querySelector('#scopeSeg button[data-scope="shared"]');
  assert(hidden, 'the "Shared with me" button is gone');
  assert(hidden.hidden, "it is no longer hidden — this suite guards a case that no longer exists");
  assert(hidden === page.el("scopeSeg").querySelector("button:last-child"),
    ":last-child no longer points at the hidden button — the trap has moved");
  page.close();
});

s.test("the end cap lands on the last visible button, not the hidden one", () => {
  const page = loadPage();
  const seg = page.el("scopeSeg");
  page.window.markSegEnds();

  const shown = visible(seg);
  equal(capped(seg, "seg-last").length, 1, "exactly one button should carry seg-last");
  assert(shown[shown.length - 1].classList.contains("seg-last"),
    "seg-last is not on the last visible button");
  assert(!seg.querySelector('button[data-scope="shared"]').classList.contains("seg-last"),
    "the hidden button carries the end cap");
  equal(shown[shown.length - 1].dataset.scope, "folder");
  page.close();
});

s.test("the first cap lands on the first visible button", () => {
  const page = loadPage();
  const seg = page.el("scopeSeg");
  page.window.markSegEnds();
  equal(capped(seg, "seg-first").length, 1);
  assert(visible(seg)[0].classList.contains("seg-first"));
  page.close();
});

s.test("restoring the hidden scope moves the cap back onto it", () => {
  const page = loadPage();
  const seg = page.el("scopeSeg");
  const shared = seg.querySelector('button[data-scope="shared"]');
  shared.hidden = false;
  page.window.markSegEnds();
  assert(shared.classList.contains("seg-last"),
    "un-hiding the button should give it the end cap");
  equal(capped(seg, "seg-last").length, 1, "the old end cap was not cleared");
  page.close();
});

s.test("re-running does not leave two buttons wearing the same cap", () => {
  const page = loadPage();
  const seg = page.el("scopeSeg");
  page.window.markSegEnds();
  seg.querySelector('button[data-scope="shared"]').hidden = false;
  page.window.markSegEnds();
  page.window.markSegEnds();
  equal(capped(seg, "seg-first").length, 1);
  equal(capped(seg, "seg-last").length, 1);
  page.close();
});

s.test("a group whose buttons are all hidden is left alone, not crashed on", () => {
  const page = loadPage();
  const seg = page.el("scopeSeg");
  seg.querySelectorAll("button").forEach((b) => { b.hidden = true; });
  page.window.markSegEnds();
  equal(capped(seg, "seg-first").length, 0);
  equal(capped(seg, "seg-last").length, 0);
  page.close();
});

s.test("every segmented control on the page gets caps, not just the scope one", () => {
  const page = loadPage();
  page.window.markSegEnds();
  const segs = [...page.document.querySelectorAll(".seg")].filter((seg) => visible(seg).length);
  assert(segs.length > 1, "expected more than one .seg on the page");
  for (const seg of segs) {
    equal(capped(seg, "seg-first").length, 1, `${seg.id} has no first cap`);
    equal(capped(seg, "seg-last").length, 1, `${seg.id} has no last cap`);
  }
  page.close();
});

// ── surviving a re-render ─────────────────────────────────────────
// renderDurations() rebuilds its group with innerHTML, which wipes the classes.

s.test("rebuilding the duration group restores its end caps", () => {
  const page = loadPage();
  const seg = page.el("planDuration");
  page.window.renderDurations();

  const buttons = [...seg.querySelectorAll("button")];
  assert(buttons.length >= 2, "the duration group did not render");
  equal(capped(seg, "seg-first").length, 1, "renderDurations did not re-mark the first cap");
  equal(capped(seg, "seg-last").length, 1, "renderDurations did not re-mark the last cap");
  assert(buttons[0].classList.contains("seg-first"));
  assert(buttons[buttons.length - 1].classList.contains("seg-last"));
  page.close();
});

s.test("the generated markup carries no caps, so the re-mark is load-bearing", () => {
  // renderDurations builds its buttons from a template with no class attribute.
  // Writing that template is what drops the caps — so if the markSegEnds() call
  // at the end of the function ever goes away, the group silently loses its
  // end borders. Reproduce the template write, without the re-mark.
  const page = loadPage();
  const seg = page.el("planDuration");
  page.window.renderDurations();
  equal(capped(seg, "seg-last").length, 1, "precondition: the group starts correctly capped");

  seg.innerHTML = '<button type="button" data-min="30">30 min</button>' +
                  '<button type="button" data-min="60">1 hour</button>';
  equal(capped(seg, "seg-last").length, 0,
    "freshly generated buttons should carry no cap until markSegEnds runs");

  page.window.markSegEnds();
  equal(capped(seg, "seg-last").length, 1);
  page.close();
});

s.test("scopeAvailable answers for the hidden button", () => {
  const page = loadPage();
  equal(page.window.scopeAvailable("owned"), true);
  equal(page.window.scopeAvailable("folder"), true);
  equal(page.window.scopeAvailable("shared"), false, "a hidden scope must not count as available");
  equal(page.window.scopeAvailable("nonsense"), false);
  page.close();
});

await s.done();
