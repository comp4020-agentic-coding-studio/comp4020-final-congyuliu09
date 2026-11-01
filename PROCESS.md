# Process overview

This is the week 12 (final) version, rewritten rather than appended to, so it
describes the project as it currently stands: crit 8's slice plus real-time
(crit 9) and multi-user/authorization/logging (crit 10), built in one pass at
the week 12 studio session after the crit 9 and crit 10 sessions themselves
had already run without the corresponding commits landing. The honest account
of that gap, and how the remaining work was directed and checked, is below.

## From the brief to this slice

The [final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/)
fixes three things --- multi-user, real-time, persistent --- and leaves
everything else, including what "good" means, to the student. Crit 8 scoped
down to proof of life: create an inspection, add findings, persist them. Crit
9 ([`All at once`](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/09-all-at-once/))
asks for real-time and one written decision about multi-person behaviour.
Crit 10 ([`Fly by instruments`](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/10-fly-by-instruments/))
asks for multi-user with server-side authorization and server-side logging
that outlives the crit. All three requirements now exist in one build: an
anonymous per-browser cookie identifies a visitor, inspections are scoped to
their owner, findings on an open inspection page push to every other open
session on that same inspection within about a second over Server-Sent
Events, and every mutation writes a row to a SQLite `activity_log` table
readable at `/logs`.

## The gap, and how it was closed

Crit 8's five commits (through [`3aa801b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-congyuliu09/commit/3aa801b))
shipped the persistence slice and a first README. The crit 9 and crit 10
sessions ran in the following weeks with nothing committed against their
specs --- no real-time, no authorization, no `reflections/crit-9.md` or
`crit-10.md`. Rather than invent a history that didn't happen, this account
says so directly: the remaining three fixed requirements (real-time,
multi-user, the decisions each spec asks to be written down) were designed
and built together at the week 12 cutoff, against both crit specs at once,
not incrementally across the weeks they were due. The reflections for both
crits were written honestly against that timeline rather than backdated.

The stack itself didn't change from week 9's decision (plain `node:http` +
`node:sqlite`, no framework, no client-side build): real-time and
authorization both fit inside it without a new runtime dependency, which was
the strongest argument for that stack in the first place. SSE needs nothing
`node:http` doesn't already provide (a long-lived response with the right
headers), and authorization is a single equality check against a column
already on the `inspections` table. If anything, the lack of a framework made
these additions more legible, not less: there's no middleware chain to trace
to find where a check should live, just the route handler itself.

## Decisions made, and why

**Identity is an anonymous cookie, not an account.** "Multi-user" only
requires that the app tell people apart, not that it know who they are.
Given the brief's framing ("one street, one book club, one afternoon" is
on-brief), a cookie set on first visit is the smallest honest answer: no
password, no email, and it still satisfies "two people, each in their own
browser, act on shared state, and the app tells them apart" exactly as
specified. The cost, written down rather than hidden, is that one inspecting
pair sharing one device shares one identity --- the README names this as a
deliberate non-goal rather than a gap.

**Authorization denies by 404, not 403.** Every per-inspection route now
checks `inspection.owner_id === visitorId` before doing anything else
(`routes.ts`), and a mismatch returns the same `notFound()` an unknown id
would. This was chosen over a 403 or a "not your inspection" message because
a 403 confirms the id exists for someone, which is itself information a
stranger probing ids shouldn't get. `CLAUDE.md` now states this rule
explicitly so a future change to the routes doesn't regress it silently.

**Real-time is Server-Sent Events, scoped per-inspection, not a global
broadcast.** Considered WebSockets and polling; SSE was chosen because the
traffic is one-directional (server to client) and `node:http` serves it with
no new dependency, which matters on a 256 MB machine with zero runtime
dependencies already a stated constraint from week 9. Subscribers are kept in
a `Map<inspectionId, Set<ServerResponse>>` (`live.ts`) rather than one global
set, so a visitor's open tab is only woken for the one inspection it's
looking at --- the one written-down decision crit 9 asks for.

**The activity log is a DB table, not console output.** `logActivity`
(`db.ts`) writes a row on every mutation, in the same request that performs
it, to the same SQLite file as the inspections. This is what crit 10's
"narrate from the logs, no clicking through your own UI" demand needs: a
durable, queryable record independent of the server process's memory, not
something that would vanish on restart or require tailing a container's
stdout.

## Agentic workflow

The agent was given the full gap above --- what crit 8 shipped, what crit 9
and crit 10 asked for, that neither had been built --- and asked to design
the identity, authorization and real-time model before writing code, the same
grounding discipline as week 9. Each decision above was proposed, reviewed,
and only then implemented. Grounding was done by running the app locally
against a scratch data directory and driving it with `curl`: creating an
inspection as one cookie, confirming a second, unrelated cookie gets 404 on
the same inspection id (not silent failure, not success), then opening the
SSE stream and watching a `finding` event arrive after a `curl` POST from a
second terminal --- before any of this was written as an automated spec test.
`pnpm check` now automates exactly those three checks (persistence,
cross-visitor isolation, real-time delivery within two seconds) so they
don't depend on repeating the manual walkthrough.

One correction landed in the harness rather than being silently retried: the
agent's first authorization draft returned a 403 for a mismatched owner,
which was corrected to 404 once the "don't confirm an id exists" reasoning
was worked through, and `CLAUDE.md` now states the 404-not-403 rule so it
can't quietly regress.

## This week's reflections

[`reflections/crit-9.md`](reflections/crit-9.md),
[`reflections/crit-10.md`](reflections/crit-10.md).
