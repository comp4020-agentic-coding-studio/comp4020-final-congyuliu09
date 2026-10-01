# Process overview

This is the week 9 (crit 8) version. It gets rewritten, not appended to, at
each of the crit 9 and crit 10 cutoffs so it always describes the project as
it currently stands.

## From the brief to this slice

The [final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/)
leaves what to build entirely open; [crit 8](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/crits/08-its-alive/)
only asks for proof of life. I picked CarCheck — a single-person tool for
recording a used-car inspection (vehicle details, then a list of findings each
with a category and severity) — and scoped crit 8 down to one slice: create an
inspection, add findings, persist them, and see them again on a later,
independent visit. Multi-user, realtime, auth, photos and export are
explicitly later crits' problems, not missing features of this one.

## Stack decision

**Plain Node.js: `node:http` + `node:sqlite`, server-rendered HTML, no
framework, no client JS, no build step.** Reasoning, in order of how much it
mattered:

1. The slice is 2 tables and 5 routes. A framework (Express/Hono) or an ORM
   (Prisma/Drizzle) buys routing and query-building conveniences this slice
   is too small to need — hand-rolling both is a page of code, not a
   maintenance burden, at this size.
2. `node:sqlite` writes straight to a file on the `/data` volume, which is the
   one thing `fly.toml` promises survives a restart or redeploy. That's
   exactly the persistence the spec asks for, with no second service to fit
   inside the 256 MB machine.
3. Zero new runtime dependencies at all (only `devDependencies` the template
   already shipped are used, for typecheck/test). Smaller image, closer to
   the course's "small web" framing, and nothing to update or audit later.
4. Node 24 (pinned in `mise.toml`) runs `.ts` files directly and the
   template's `tsconfig.json` already assumed that (`allowImportingTsExtensions`),
   so there's no bundler or transpile step to configure either.

**Trade-off, written down rather than discovered the hard way:** no framework
means no built-in router, so route matching is four `if`s and two regexes in
[`routes.ts`](routes.ts). That's fine at 5 routes; if crit 9's realtime
requirement pushes the route count up a lot, revisiting this is the first
thing I'd do, and I'd write a new record here saying why, per the brief's
[architecture decision record](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)
suggestion. The other near-term pressure point is realtime itself: plain
`node:http` can take a raw WebSocket upgrade without adding a framework, so
this choice isn't a dead end for crit 9, just not solved yet.

## Schema

`inspections` carries vehicle details directly (make/model/year/odometer) —
no separate `vehicles` table, since nothing in this slice's scope reuses a
vehicle across inspections yet. `findings` references an inspection and has a
closed, checked `severity` enum (`low`/`medium`/`high`) but a free-text
`category`, since the category vocabulary isn't closed by anything in scope
([`db.ts`](db.ts)).

## Agentic workflow

I described the app (CarCheck, the entities, the exact crit-8 scope list
including what to leave out) and asked the agent to propose the stack and
schema before writing any code, rather than scaffold immediately — that
proposal is the "Stack decision" and "Schema" sections above, which I reviewed
and approved before anything was written
([`054159b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-congyuliu09/commit/054159b)
is the first commit that followed from it). I grounded the build at each
step rather than trusting it blind: the agent ran `pnpm typecheck` after
scaffolding, started the app locally against a scratch data directory, and
drove it with `curl` (create an inspection, add two findings, kill the
process, restart it against the same directory, confirm the data was still
there) *before* writing the persistence spec test or committing — so the
"it's alive" claim was checked against a real running process, not just
asserted. `pnpm check` (
[`a77e050`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-congyuliu09/commit/a77e050))
automates exactly that same check (create → add finding → fresh, independent
request) so it doesn't depend on me re-running curl by hand next week.

Nothing needed correcting in `CLAUDE.md` or `spec/` this week — the scope was
specified precisely up front (the exact create/persist/reload list, and the
explicit exclusions), so there wasn't a wrong turn to catch after the fact.
`CLAUDE.md` is still the template's empty arrival state; it starts picking up
real rules once crit 9's realtime work gives me something concrete to hold
the agent to (e.g. "every mutation must reach every other open session within
~1s"), rather than rules invented ahead of having a reason for them.

## This week's reflection

[`reflections/crit-8.md`](reflections/crit-8.md).
