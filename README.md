# CarCheck

A small, single-purpose tool for recording a used-car inspection: the vehicle,
and what was found wrong with it. This is a first, rough definition of what
"good" means for it, written before the crit 9/10 work — expect it to change.

## Who it's for

Someone inspecting a used car before buying it — on their own, or helping a
friend — who wants somewhere better than a phone note to write down what they
find while they're under the bonnet or crouched by a tyre, and to look at it
again afterward without re-remembering it. Not a dealership's fleet-inspection
tool, not a mechanic's shop system: one person (for now), one car at a time,
low stakes if it's a bit rough around the edges.

## What good means here, this week

- **Nothing gets lost.** The whole point of writing a finding down instead of
  remembering it is that it survives a closed tab, a refresh, a day's gap
  before the test drive. An inspection app that can't be trusted to still have
  your notes tomorrow is worse than the phone note it's replacing. This is
  enforced: `spec/inspections.test.ts` creates an inspection and its findings,
  then reads them back through a fresh request, and the deploy only ships if
  the record survives a container restart.
- **Severity is visible at a glance.** A list of findings with no sense of
  which ones matter is just a longer phone note. Severity (low/medium/high) is
  a small, fixed, checked vocabulary rather than free text, specifically so it
  can be read at a glance and, later, sorted or filtered on.
- **Entry is fast, standing next to the car.** Two short forms (new inspection,
  add a finding), no required fields beyond what's needed to tell cars apart
  and findings apart. This is judged, not tested: whether the forms stay fast
  to fill in under real use is something the crit has to weigh in on.

## What's deliberately not here yet, and why

Crit 8 asks for the smallest slice that is genuinely alive end to end, not the
whole final project. Left out on purpose, for later crits:

- **Accounts or sharing** — this version is single-player; nothing distinguishes
  one visitor from another, so there's no "your" inspections yet. Crit 9's
  multi-user requirement is where that has to get answered honestly rather
  than bolted on early.
- **Photos** — a huge part of a real inspection, but it adds storage and
  display decisions this slice doesn't need yet to prove persistence works.
- **Report export, inspection templates, realtime** — all reasonable future
  features, none of them part of proving "it's alive."

## What I read while deciding this

- Robin Sloan, ["An app can be a home-cooked meal"](https://www.robinsloan.com/notes/home-cooked-app/)
  — the case for small, personal software built for one use rather than a
  general audience, which is why CarCheck doesn't try to be a dealership tool.
- Martin Kleppmann et al., ["Local-first software: you own your data, in spite
  of the cloud"](https://www.inkandswitch.com/local-first/) (Ink & Switch,
  2019) — shaped the persistence bar above: an inspection you wrote down
  should feel like it's yours and still there, not something a server might
  have dropped.
- The [Small Technology Foundation](https://small-tech.org/research-and-development/)
  framing of tools built at human scale — informs keeping the scope to "one
  person, one car" rather than growing feature surface for its own sake.

## Enforced vs. judged

- **Enforced** (`spec/inspections.test.ts`): an inspection and its findings
  persist and are readable after the request that created them is long over;
  an unknown inspection id 404s rather than erroring.
- **Judged** (by the crit, not a test): whether entry is actually fast enough
  "standing next to the car", and whether severity is genuinely legible at a
  glance rather than just present.
