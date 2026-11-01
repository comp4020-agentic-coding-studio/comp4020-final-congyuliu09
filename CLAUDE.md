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
- **Visitor identity is a plain cookie, not a secret.** `shortId()` in
  `routes.ts` is the only form a visitor id should ever appear in HTML or
  logs --- the full id is enough to view that visitor's data (there's no
  password behind it), so it shouldn't be handed around any more than it
  already is by the cookie itself.
