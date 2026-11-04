# Process overview

This is the final-submission version, rewritten rather than appended to, so
it describes the project as it currently stands: crit 8's persistence slice,
crit 9's real-time requirement and crit 10's multi-user/authorization/logging
requirement, plus two post-crit-10 additions — optional accounts and photo
evidence on findings — built once the three crits' fixed requirements were
already in place. The honest account of the crit 9/10 timing gap, and how
every later addition was directed and checked, is below.

## From the brief to this build

The [final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/)
fixes three things — multi-user, real-time, persistent — and leaves
everything else, including what "good" means, to the student. Crit 8 scoped
down to proof of life: create an inspection, add findings, persist them.
Crit 9 asked for real-time and one written decision about multi-person
behaviour. Crit 10 asked for multi-user with server-side authorization and
server-side logging that outlives the crit. Those three now exist in one
build: a per-browser identity (guest by default, promotable to an account)
identifies a visitor, inspections are scoped to their owner, findings push to
every other open session on the same inspection within about a second over
Server-Sent Events, and every mutation writes a row to a SQLite
`activity_log` table readable at `/logs`.

## The crit 9/10 gap, and how it was closed

Crit 8's five commits shipped the persistence slice and a first README. The
crit 9 and crit 10 sessions ran in the following weeks with nothing
committed against their specs. Rather than invent a history that didn't
happen, this account says so directly: the real-time and multi-user/
authorization/logging work was designed and built together after both
sessions had already run, against both specs at once. The reflections for
both crits are written honestly against that timeline rather than backdated.

## Decisions made, and why

**Identity started as an anonymous cookie, then grew an optional account on
top.** The first version argued a cookie was the smallest honest answer to
"tell people apart" — true for a single browser, but it couldn't survive a
cleared cache or carry a photo-heavy inspection from a phone to a laptop.
Rather than replace the cookie model, accounts extend it: `auth.ts` lets a
visitor register, which inserts a row into `accounts` using their *existing*
guest id as the account id. Nothing about `inspections.owner_id` changes, so
no migration step exists to get wrong — a registered user's old guest data is
already theirs. Logging in from elsewhere just swaps the cookie onto that
same id (`setVisitorId` in `session.ts`). A guest who never registers loses
nothing: every feature works without an account.

**Authorization denies by 404, not 403, and now covers photos too.** Every
per-owner route — inspection, finding, and now photo — checks ownership
before doing anything else, and a mismatch returns the same `notFound()` an
unknown id would, so a 403 never confirms a record exists for someone else.
Photos extend this chain by one hop: a photo belongs to a finding, which
belongs to an inspection, which has an owner, so `findingOwner()` in
`routes.ts` re-derives ownership through that chain on every photo request
rather than trusting a cached or duplicated owner field.

**Photos are capped at 9 per finding, enforced server-side against a flood,
not just the form.** `addPhoto` in `db.ts` counts existing photos and refuses
to insert past the cap — checked again on every insert, so sending 15 files
in one multipart request stops accepting at 9, it doesn't reject the whole
batch or silently accept more. Multipart parsing (`multipart.ts`) is
hand-written rather than a dependency, consistent with the zero-runtime-
dependency stack: the format a plain `<input type=file>` sends is narrow
enough that implementing just that subset is a page of code, not a
maintenance burden.

**Real-time is Server-Sent Events, scoped per-inspection.** Subscribers are
kept in a `Map<inspectionId, Set<ServerResponse>>` (`live.ts`) rather than
one global broadcast set, so an open tab is only woken for the inspection
it's actually looking at.

**The activity log is a DB table, not console output**, written in the same
request as the mutation it records, so it survives a restart and needs no
container log access to read.

## Stack

Still plain `node:http` + `node:sqlite`, no framework, no client build.
Passwords use `node:crypto`'s built-in `scrypt` rather than a bcrypt/argon2
dependency — one more feature added with zero new runtime dependencies,
which was the original argument for this stack and still holds after four
rounds of additions.

## Agentic workflow

Each new decision (accounts-on-top-of-guests, the 404-chain for photos, the
server-side photo cap) was proposed and reviewed before being implemented,
the same grounding discipline as earlier weeks. Grounding was done by hand
first: registering a guest's existing data and confirming it was still
reachable afterward, logging in from a second, empty cookie jar and
confirming the same data appeared, uploading past the 9-photo cap in one
request and confirming exactly 9 landed — all driven with `curl` against a
running instance before any of it became an automated spec test.
`spec/accounts-and-photos.test.ts` now automates exactly those checks.

One correction landed in the harness rather than being silently retried: an
early logout implementation tried to reuse a helper function's name as a
boolean check instead of generating a fresh id, caught by re-reading the
diff before committing rather than by a failing test — a reminder that
`pnpm typecheck` passing is not the same as the logic being right.

## This week's reflections

[`reflections/crit-9.md`](reflections/crit-9.md),
[`reflections/crit-10.md`](reflections/crit-10.md).
