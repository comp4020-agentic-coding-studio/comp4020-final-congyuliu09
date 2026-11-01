# CarCheck

A small, single-purpose tool for recording a used-car inspection: the vehicle,
and what was found wrong with it. Rewritten at the week 11 cutoff — this is
the project's current definition of "good", not the week 9 draft.

## Who it's for

Someone inspecting a used car before buying it, alone or with a friend doing
the same walk-around on their own phone, who wants somewhere better than a
phone note to write down what they find under the bonnet, and to see what the
other person just found without asking out loud. Not a dealership's
fleet-inspection tool: one inspection at a time, low stakes if it's rough.

## What good means here

- **Nothing gets lost.** An inspection and its findings survive a closed tab,
  a day's gap, a container restart. Enforced in
  [`spec/inspections.test.ts`](spec/inspections.test.ts): create, add, reread
  through a fresh request.
- **Each visitor sees only their own inspections.** "Multi-user" means an
  anonymous cookie, set on first visit, that the app trusts as "this
  person" — no accounts, since the people this app is for don't need one.
  What it must do honestly is keep visitors apart: viewing or adding to
  someone else's inspection 404s, checked server-side, not hidden by the UI.
  Enforced in the spec's authorization tests.
- **A finding appears for whoever else is looking, within about a second.**
  Two people on the same page — one crouched by a tyre, one reading the
  odometer — see each other's notes land without reloading. Built on
  Server-Sent Events, scoped per-inspection ([`live.ts`](live.ts)); enforced
  by a test that opens the stream, adds a finding from a second request, and
  asserts the event arrives within two seconds.
- **Every mutation is logged server-side, and the log outlives the UI.**
  Written to the same SQLite file the inspections live in, so it survives a
  restart and reads without clicking through anyone's session. `/logs` is
  gated behind a token, not open to any visitor: it lists every inspection's
  findings across every owner, so leaving it unauthenticated would undo the
  per-visitor isolation above.
- **Severity is visible at a glance; entry is fast, standing next to the
  car.** Carried over from week 9: severity is a small, fixed vocabulary
  rather than free text, and the two forms ask only what's needed to tell
  cars and findings apart.

## What's deliberately not here, and why

- **Named accounts.** The cookie model answers "tells visitors apart"
  honestly at this app's scale, without passwords or email verification a
  one-person (or one-pair) tool doesn't need.
- **Inviting a second cookie into one inspection.** A real pair shares one
  phone's or laptop's cookie for the session; nothing in the brief's fixed
  requirements asks for an "invite someone else in" flow, and adding one
  would reopen the identity question this version just closed.
- **Photos, report export, templates.** Still out of scope, as at week 9.

## What I read while deciding this

- Robin Sloan, ["An app can be a home-cooked meal"](https://www.robinsloan.com/notes/home-cooked-app/)
  — the case for small, personal software, why CarCheck answers "multi-user"
  with a cookie rather than an account system.
- Martin Kleppmann et al., ["Local-first software"](https://www.inkandswitch.com/local-first/)
  (Ink & Switch, 2019) — shaped the persistence bar: a finding should feel
  like it's yours and still there.
- [Small Technology Foundation](https://small-tech.org/research-and-development/),
  tools built at human scale — keeping identity to "this browser" rather than
  growing an accounts system for its own sake.

## Enforced vs. judged

- **Enforced** (`spec/`): persistence across a restart; visitor isolation
  (stranger gets 404, not a hidden link); real-time delivery within two
  seconds; activity logging.
- **Judged**: whether entry is fast standing next to the car, and whether
  one cookie per inspecting pair is a reasonable reading of "multi-user"
  rather than a dodge of it.
