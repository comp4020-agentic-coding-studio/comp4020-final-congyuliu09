# Your harness

Nothing about the template is recorded here. What the repo ships is explained
where it lives --- `fly.toml`, the `Dockerfile`, the CI workflow and
`spec/README.md` each say what they fix --- and the course website publishes the
[final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/).

## Rules that came out of crit 9 and 10

- **Every mutation reaches every other open session on the same inspection
  within ~1s, with no reload.** Added when crit 9 made real-time a fixed
  requirement. Enforced in `spec/inspections.test.ts` (opens the SSE stream,
  adds a finding from a second request, asserts the event arrives within 2s).
  If you add a new kind of mutation (editing or deleting a finding, say), it
  must publish through `live.ts` the same way `addFinding` does --- don't ship
  a mutation that only updates the page that made it.
- **Authorization is server-side, and a denial looks exactly like "doesn't
  exist".** Every route that reads or writes an inspection checks
  `inspection.owner_id === visitorId` before doing anything else, and the
  failure path is the same `notFound()` as an unknown id --- never a 403,
  never a different error message. This was a direct decision at crit 10: a
  visitor probing for someone else's inspection id should learn nothing from
  the response. If you add a new per-inspection route, copy this check; don't
  assume the UI hiding a link is enough.
- **Every mutation is logged to `activity_log`, server-side, before the
  response is sent.** Not console output, not in-memory --- a DB row, so it
  survives a restart and is readable at `/logs` without touching anyone's
  session. This is what crit 10's "narrate from the logs" demand reads from;
  a mutation that doesn't call `logActivity` is invisible to that narration
  and is a bug, not a style choice.
- **`/logs` is gated behind `LOGS_TOKEN`, 404ing (not 401/403) without it.**
  The log holds every visitor's findings across every owner, so leaving it
  open the way an inspection page is would undo the isolation rule above for
  the one page that shows everyone's data at once. The token is a Fly secret
  on the deployed app (`flyctl secrets set LOGS_TOKEN=...`), never committed;
  CI generates a throwaway one per run so the gating test has something to
  check. If a route ever needs to show cross-visitor data again, gate it the
  same way rather than leaving it open "because it's low-stakes."
- **Visitor identity is a plain cookie, not a secret, unless it's an account.**
  `shortId()` in `routes.ts` is the only form a visitor id should ever appear
  in HTML or logs. A guest id has no password behind it; an account id
  (`accounts.id`) does, via `auth.ts`'s `password_hash` --- either way, the
  bare id itself still isn't treated as a capability secret, so it's never
  the thing standing between a visitor and someone else's data (ownership
  checks are).

## Rules added for accounts and photos

- **Registering a guest promotes their existing id; it never creates a new
  one.** `registerAccount` in `auth.ts` takes the caller's current
  `visitor_id` cookie value as the account's id. Never generate a fresh id at
  registration --- that would orphan everything the guest already recorded
  under the old id, silently.
- **Passwords are hashed with `node:crypto`'s `scrypt`, never stored or
  logged in plain text.** No bcrypt/argon2 dependency --- consistent with the
  zero-runtime-dependency stack. If you ever add a "forgot password" flow,
  it still can't recover the original password, only reset it.
- **A finding's owner is derived through `findingOwner()`, never assumed.**
  Findings and photos don't carry their own `owner_id` column; ownership is
  always inspection.owner_id, reached by one hop. Don't add a duplicate
  owner field to `findings` or `finding_photos` --- a second copy of
  ownership is a second place it can drift out of sync with the first.
- **The 9-photos-per-finding cap is enforced in `addPhoto` (`db.ts`), not
  just the upload form.** `<input multiple>` and the per-request remaining
  count in the UI are conveniences; a flood of files in one multipart
  request must still stop accepting at 9, which is why the check happens on
  every insert, not once per request.
- **Only `image/jpeg`, `image/png`, `image/webp` and `image/gif` are
  accepted as photo uploads**, checked against the browser-supplied
  `Content-Type` in `routes.ts`. This is a weak check (a client can lie
  about content type) but it's a sufficient one for a low-stakes photo
  store with no further processing of the bytes --- don't start trusting the
  stored `content_type` for anything more sensitive than the `img` tag's
  own `src` without re-deriving it from the bytes first.
