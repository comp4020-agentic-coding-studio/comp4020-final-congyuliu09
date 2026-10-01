# Crit 8 reflection

**The breakthrough** was realising how much the open-ended part of the brief
("make it good") front-loads onto a decision the static assignments mostly
made for me: what the *smallest honest slice* even is. Once I'd pinned that
down precisely — create an inspection, add findings with a severity, persist,
and prove it survives a restart and an independent request, nothing else —
the stack question answered itself. There was no framework or database
decision to agonise over, because a two-table, five-route slice doesn't need
one yet. I asked the agent to propose the stack and schema before writing
anything, specifically so that reasoning would get written down (in
`PROCESS.md`) rather than arrived at silently. The genuinely useful moment
wasn't the code; it was watching the app get killed and restarted against the
same data directory before I'd trust the word "persistent" in the spec test.

**What it changed** is how I think about "it works" claims from an agent. It
would have been easy to accept green tests as proof the app was alive. Making
the agent drive the running process by hand first — create, add findings,
kill it, restart it, check the data is still there — before it wrote the
automated version of that same check, caught the gap between "the code looks
right" and "I watched it survive the thing it's claiming to survive." I want
that to be the default order going forward: prove it by hand once, then
automate exactly what you proved, not the other way around.
