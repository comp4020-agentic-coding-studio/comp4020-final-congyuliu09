# Crit 9 reflection

Written honestly against the timeline: the crit 9 session (week 10) passed
without the real-time work landing in the repo, and this reflection, along
with the feature itself, was done together at the week 12 cutoff rather than
in week 10. I'd rather say that plainly than write a reflection that implies
a week-10 breakthrough that didn't happen.

**The breakthrough**, once I did sit down with it, was realising "real-time"
didn't need a new piece of infrastructure, just a narrower scope for the one
I already had. My first instinct was a single broadcast channel that pushed
every update to every connected client, which is the obvious reading of "a
change appears in every other open session" if you don't read the rest of the
sentence. What actually matters for CarCheck is "every other open session
*showing it*" --- someone looking at a different inspection has no reason to
be woken up for a finding on a car they're not looking at. Scoping
subscribers to a `Map` keyed by inspection id, instead of one global set, was
a small code change but a real decision: it's the one crit 9 asks to be
written down, and it only became obvious once I stopped assuming "real-time"
meant "global."

**What it changed** is how I read a spec line like "a change appears in every
other open session" --- not as a literal instruction to broadcast everything,
but as a constraint to design the smallest mechanism that satisfies it. The
late timing of this work was also its own lesson: catching up on two crits'
worth of requirements at once made it much harder to argue, convincingly,
that each decision had been pressure-tested against real use across a week
rather than reasoned through once, under deadline. I want "built the week the
crit asks for it" to actually be true for crit 10 and whatever the course
asks of me after this, not just a line in a reflection.
