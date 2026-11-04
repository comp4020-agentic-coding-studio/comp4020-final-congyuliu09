# CarCheck

A small, single-purpose tool for recording a used-car inspection: the vehicle,
what was found wrong with it, and photo evidence of each finding. Rewritten
after week 11 — this is the project's current definition of "good".

## Who it's for

Someone inspecting a used car before buying it, alone or with a friend on
their own phone, who wants somewhere better than a note to write down what
they find — photos included — and to see what the other found without
asking aloud. Not a dealership tool: one inspection at a time, low stakes.

## What good means here

- **Nothing gets lost.** An inspection, its findings and their photos survive
  a closed tab, a day's gap, a container restart. Enforced in `spec/`.
- **Guests are first-class; accounts are optional.** Every visitor gets a
  working app on first visit, no signup wall. An account exists for one
  reason: finding your data from a different device. Registering promotes
  your guest data into an account with the same id, so nothing migrates;
  logging in elsewhere finds it. Viewing or changing someone else's data
  404s, checked server-side, never by hiding a link.
- **A finding appears for whoever else is looking, within a second.**
  Server-Sent Events, scoped per-inspection ([`live.ts`](live.ts)); enforced
  by a test that opens the stream and asserts the event arrives in time.
- **A finding can carry up to 9 photos, each with a caption.** A photo is
  evidence, not decoration: "worn tread" is a claim a close-up photo lets
  someone judge. The cap and image-type check are enforced server-side, not
  just the form, and a photo is served only to the finding's owner.
- **Every mutation is logged server-side, and the log outlives the UI.**
  `/logs` is gated behind a token: it spans every owner, so leaving it
  unauthenticated would undo the per-visitor isolation above.
- **Severity is visible at a glance; entry is fast, standing next to the
  car.** A small, fixed severity vocabulary, forms that ask only what's
  needed to tell cars, findings and photos apart.

## What changed, and why

An earlier draft argued against accounts — a cookie was "the smallest honest
answer." That held while the only question was telling two people apart. It
stopped holding once photos made a phone-recorded inspection worth reaching
from a laptop later, and a bare cookie can't survive a cleared cache.
Accounts close that gap without undoing the original reasoning — a guest
still gets the full app, free, no signup.

## What's deliberately not here, and why

- **Password reset, email verification.** An email service and verification
  flow is too much surface for a tool whose stakes are lost notes, not
  money or identity.
- **Sharing one inspection across two accounts.** A pair inspecting together
  shares one browser's identity; nothing in the brief asks for an "invite"
  flow on one record.
- **Report export, inspection templates.** Still out of scope.

## What I read while deciding this

- Robin Sloan, ["An app can be a home-cooked meal"](https://www.robinsloan.com/notes/home-cooked-app/)
  — shaped the guest-first design even after accounts arrived: an account is
  a convenience, not a gate.
- Martin Kleppmann et al., ["Local-first software"](https://www.inkandswitch.com/local-first/)
  (Ink & Switch, 2019) — the persistence bar: a finding, now a photo, should
  feel like it's yours and still there.
- [Small Technology Foundation](https://small-tech.org/research-and-development/),
  tools at human scale — kept accounts to one username and password, no
  profile, no social surface.

## Enforced vs. judged

- **Enforced** (`spec/`): persistence across a restart; isolation for
  inspections, findings and photos; real-time delivery within two seconds;
  the 9-photo cap even when more arrive in one request; a guest's data
  survives registering and is found by logging in elsewhere; activity
  logging.
- **Judged**: whether entry is fast standing next to the car, and whether
  photos read as evidence rather than clutter on a small screen.
