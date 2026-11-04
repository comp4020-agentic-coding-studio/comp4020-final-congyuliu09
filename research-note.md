# Critical research note: where verification should live in agentic development

**Position:** Good agentic development practice is defined less by how carefully
a developer reviews an agent's output and more by where the burden of
verification is placed — in a human's in-the-moment vigilance, or in a
persistent, executable check the agent's own claims must pass before they
count as true. The field's current advice leans heavily on the first and
under-invests in the second, and that choice is backwards given what's
already known about when human vigilance fails.

Two camps dominate practitioner discourse on agentic coding. The first, call
it the *vigilant-review* camp, holds that the developer's job is to read
every diff closely, since an agent can produce confident, fluent, wrong code
indistinguishable on its face from correct code — a specific instance of the
broader hallucination problem Ji et al. (2023) survey across generative
language models, where plausibility and correctness come apart with no
reliable surface signal to tell them apart. The second, the *fast-iteration*
camp, treats heavy review as the thing agentic coding was supposed to make
unnecessary: if the agent is fast enough and the stakes are low enough,
iterate and fix forward rather than front-load scrutiny. Simon Willison's
distinction between vibe coding and what he calls disciplined AI-assisted
programming sits between these — he doesn't reject fast iteration, but draws
the line at a single test: he won't commit code he couldn't explain to
someone else, which still requires understanding the output even when it was
generated quickly.

Both camps locate verification in the same place: a human, at the moment of
review, deciding whether to trust what the agent just produced. This is
exactly the condition under which human vigilance is weakest. Parasuraman and
Riley's (1997) account of automation use, misuse and disuse shows that
operators' critical oversight of an automated system degrades precisely under
time pressure and high perceived reliability — the operator starts trusting
the automation's output more, and checking it less, right when checking
matters most. Agentic coding reproduces this condition closely: the appeal of
the tool is speed, the speed pressure is highest near a deadline, and that is
exactly when a tired developer's line-by-line review is least reliable. A
practice that depends on the developer staying maximally vigilant at the
moment they are least equipped to be vigilant is not a safe practice; it is a
practice that works until it doesn't, and fails silently when it doesn't.

The alternative the vigilant-review/fast-iteration framing misses is older
than agentic coding itself: Beck's (2002) test-driven development argument
that a specification, once written as an executable check, verifies every
future change without depending on anyone's attention at the time of that
change. Converting a one-time review judgment ("this persists correctly,"
"this doesn't leak another user's data") into a check that runs on every
build moves the verification cost from the worst possible moment — a tired
developer near a deadline — to the best possible one: a single careful
sitting, done once, paid for every time after. Anthropic's own engineering
guidance on agentic coding converges on the same idea from the production
side, recommending that an agent be made to run and verify its own work
against a real environment before a human accepts the result, rather than
asking the human to infer correctness from the diff alone.

The strongest objection is cost: writing an executable check takes longer
than skimming a diff, and under real deadline pressure that cost is exactly
what gets cut. This objection proves the position rather than refuting it.
Skimming is cheap precisely because it's unreliable, and its unreliability
compounds with every future change nobody reverifies. A check paid for once
is cheap on every subsequent run; vigilance paid for repeatedly is expensive
and degrading on every run. The field's open problem isn't whether to verify
agentic output — it's making the executable check as fast to write as the
prompt that produced the code it's checking, so paying that cost up front
stops looking like the slower path.

## References

- Beck, K. (2002). *Test-Driven Development: By Example*. Addison-Wesley.
- Ji, Z., Lee, N., Frieske, R., et al. (2023). Survey of hallucination in
  natural language generation. *ACM Computing Surveys*, 55(12), article 248.
- Parasuraman, R., & Riley, V. (1997). Humans and automation: Use, misuse,
  disuse, abuse. *Human Factors*, 39(2), 230–253.
- Willison, S. (2025, March 19). Not all AI-assisted programming is vibe
  coding (but vibe coding rocks). *Simon Willison's Weblog*.
  https://simonwillison.net/2025/Mar/19/vibe-coding/
