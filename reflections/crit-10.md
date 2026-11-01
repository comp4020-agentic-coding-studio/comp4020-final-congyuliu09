# Crit 10 reflection

Like crit 9's, this reflection is written after the fact: the crit 10 session
(week 11) ran before multi-user, authorization and logging existed in the
repo, so there was no pod to run the "two classmates use it from the URL
alone" check against at the time. The feature and this account were built
together at the week 12 cutoff.

**The breakthrough** was a single question that reshaped the authorization
design: what should a stranger who guesses, or stumbles on, someone else's
inspection id actually see? My first pass returned a 403 for a mismatched
owner, which felt like the obvious HTTP-correct answer. Sitting with it
longer, a 403 confirms the id exists and belongs to *someone* --- which is
real information to hand to a stranger probing ids, even if they learn
nothing about whose car it is or what's wrong with it. Switching the denial
to the same 404 an unknown id already returns closes that leak entirely: the
response to "wrong car" and "no such car" is now identical, which is the
actual guarantee "what each person may see is checked on the server" should
mean. That one line in `CLAUDE.md` (404, not 403, for every per-inspection
route) is the rule I'd point to if asked what crit 10 actually added to the
project.

**What it changed** is how I think about "the server checks it" as a claim.
It's easy to write a check that's technically server-side but still leaks
through its response shape --- a different status code, a different error
message, a response time difference. The discipline I want to carry forward
is asking not just "does the server enforce this" but "does the server's
*response*, in every case, actually hide what it's supposed to hide." The
late timing here is also something to carry forward honestly: this
reflection and the crit 9 one both admit a gap between when the spec was due
and when the work landed, and the lesson from that gap is procedural as much
as technical --- build against each crit's spec in the week it's assigned,
not in a batch against the next hard deadline.
