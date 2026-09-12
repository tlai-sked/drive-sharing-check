# Hard-won gotchas

Read the entry before changing the code it names. Every one of these cost
somebody real time, and none of them announce themselves — they fail silently,
or blame the wrong thing.


**OAuth scope strings are prefixes of each other.**
`.../auth/drive.metadata.readonly` *contains* `.../auth/drive`. Comparing with
`indexOf` silently accepts a read-only grant as write access. Split on
whitespace and compare whole scopes. This caused a 403 that reported itself as
"the account may not own this file".

**Google may return a token without the scope you asked for.** If a grant
already exists, GIS can return it silently. Always check `r.scope` on the
callback and re-request with `prompt: "consent"` if the needed scope is absent.

**Setting `input.value` in code does not fire an `input` event.** The email
suggestion picker wrote the field directly, so validation kept acting on the
half-typed text and the Save button stayed disabled. Dispatch an `input` event
after any programmatic write, or revalidate on `change` and `blur`.

**`:first-child` / `:last-child` still match hidden elements.** Hiding the
"Shared with me" button left the segmented control's end cap on an invisible
button. `markSegEnds()` marks the first and last *visible* buttons with
`seg-first` / `seg-last`. Anything that rebuilds a `.seg` with `innerHTML` must
call it again — `renderDurations()` does.

**Trim does not remove zero-width or non-breaking spaces.** They survive
`.trim()`, are invisible on screen, and fail every validator. `cleanEmail()`
strips them.

**Absent keys in the settings file must not inherit old values.** `paused` is
read as `cfg.paused === true`, not "keep whatever CONFIG had". An earlier
version let a stale value persist and monitoring silently stayed off.

**A file ID is 15+ characters.** `idFromRef_` rejects anything shorter. Test
fixtures using `'F'` as an ID will silently scan nothing.

**MailApp rejects recipients with a leading space.** `"a@x.com, b@y.com"` sends
only to the first. Save the list joined with `","` and strip spaces per address.

**The script spells the em dash as an escape.** `Code.gs` has
`'Drive sharing check \u2014 settings'` where the page has a literal `—`. Same
string at runtime, so grepping for the em dash finds only the page's copy and
you will conclude there is just one. Search for `SETTINGS_NAME` or
`STATUS_NAME` instead.

**`capabilities.canShare` is not ownership.** Drive reports it true on a file
somebody granted you manage rights to, which you still do not own. Gating the
Change button on it alone let you rewrite another team's sharing. `canFix()` is
the single test — `ownedByMe && canShare` — and everything that offers to
change something goes through it: the tick box, the row action, `Select all`,
the access dialog, and the plan's estimate.

**Drive hides named grants on files owned by other people.** Risk levels are
reliable there; "who exactly has access" is not. Do not invent it.
