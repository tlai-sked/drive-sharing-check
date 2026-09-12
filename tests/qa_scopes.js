// Scope handling: a read-only grant must be detected and re-consented, never
// used. This is the failure that reported itself as "the account may not own
// this file" — a 403 at the point of changing sharing, hours from its cause.

import { loadPage, suite, assert, equal, includes, rejects } from "./harness.mjs";

const s = suite("Scope handling");

const READONLY = "https://www.googleapis.com/auth/drive.metadata.readonly";
const WRITE = "https://www.googleapis.com/auth/drive";

/**
 * Stands in for Google Identity Services. Hands back the queued responses in
 * order and records what was asked for, so a test can assert on the second
 * request as well as the first.
 */
function stubGoogle(page, responses) {
  const asked = [];
  page.window.google = {
    accounts: {
      oauth2: {
        initTokenClient(config) {
          return {
            requestAccessToken(opts) {
              asked.push({ scope: config.scope, prompt: (opts || {}).prompt });
              const next = responses.shift();
              if (!next) throw new Error("the code asked for more tokens than the test queued");
              if (next.errorType) config.error_callback({ type: next.errorType });
              else config.callback(next);
            },
          };
        },
      },
    },
  };
  return asked;
}

function freshPage(responses) {
  const page = loadPage();
  page.window.eval("clientId = 'test-client-id'; fixToken = null; account = null;");
  const asked = stubGoogle(page, responses);
  return { page, asked };
}

s.test("the write scope constant is the bare drive scope", () => {
  const page = loadPage();
  equal(page.read("FIX_SCOPE"), WRITE);
  page.close();
});

s.test("a grant carrying the write scope is used as-is", async () => {
  const { page, asked } = freshPage([{ access_token: "tok-write", scope: WRITE }]);
  const token = await page.window.getFixToken();
  equal(token, "tok-write");
  equal(asked.length, 1, "should not have needed a second prompt");
  page.close();
});

// The gotcha itself. ".../auth/drive.metadata.readonly" CONTAINS ".../auth/drive",
// so any substring test accepts a read-only grant as write access.
s.test("a read-only grant is not mistaken for write access", async () => {
  const { page, asked } = freshPage([
    { access_token: "tok-readonly", scope: READONLY },
    { access_token: "tok-write", scope: WRITE },
  ]);
  const token = await page.window.getFixToken();
  assert(token !== "tok-readonly", "the read-only token was accepted as write access");
  equal(token, "tok-write");
  equal(asked.length, 2, "should have re-requested after the read-only grant");
  page.close();
});

s.test("the re-request forces the consent screen", async () => {
  const { page, asked } = freshPage([
    { access_token: "tok-readonly", scope: READONLY },
    { access_token: "tok-write", scope: WRITE },
  ]);
  await page.window.getFixToken();
  equal(asked[1].prompt, "consent",
    'a silent retry would loop on the same grant; it must ask with prompt "consent"');
  page.close();
});

s.test("a substring check would have passed this, proving the test is real", () => {
  // Guards the test above against being trivially true: if this assertion ever
  // fails, the two scope strings no longer overlap and the gotcha is gone.
  assert(READONLY.indexOf(WRITE) !== -1,
    "the read-only scope no longer contains the write scope — this suite is testing nothing");
});

s.test("re-consent is attempted once, not in a loop", async () => {
  const { page } = freshPage([
    { access_token: "tok-readonly", scope: READONLY },
    { access_token: "tok-still-readonly", scope: READONLY },
  ]);
  await rejects(page.window.getFixToken(), /NEEDS_CONSENT/,
    "a grant that stays read-only must surface, not retry forever");
  page.close();
});

s.test("a scope-less response is taken at face value", async () => {
  // Google does not always echo `scope`. Rejecting a token for saying nothing
  // would break the normal path, so absence is treated as "fine" on purpose.
  const { page, asked } = freshPage([{ access_token: "tok-no-scope" }]);
  equal(await page.window.getFixToken(), "tok-no-scope");
  equal(asked.length, 1);
  page.close();
});

s.test("extra scopes alongside the write scope are fine", async () => {
  const { page } = freshPage([
    { access_token: "tok-multi", scope: `openid ${WRITE} ${READONLY}` },
  ]);
  equal(await page.window.getFixToken(), "tok-multi");
  page.close();
});

s.test("a closed permission window says so plainly", async () => {
  const { page } = freshPage([{ errorType: "popup_closed" }]);
  const err = await rejects(page.window.getFixToken());
  includes(err.message, "closed");
  page.close();
});

s.test("a cached write token is reused without prompting again", async () => {
  const { page, asked } = freshPage([{ access_token: "tok-write", scope: WRITE }]);
  await page.window.getFixToken();
  equal(await page.window.getFixToken(), "tok-write");
  equal(asked.length, 1, "the second call should not have prompted");
  page.close();
});

s.test("scanning asks only for metadata, never for write", () => {
  const page = loadPage();
  equal(page.read("SCOPE"), READONLY,
    "the scan must never request a scope that can change anything");
  page.close();
});

s.test("no client ID is an explained refusal, not a Google error", async () => {
  const page = loadPage();
  page.window.eval("clientId = null; fixToken = null;");
  await rejects(page.window.getFixToken(), /client ID/i);
  page.close();
});

await s.done();
