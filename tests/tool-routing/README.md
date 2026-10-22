# Tool routing, scored by hand

The routing table (`src/routing.ts`) says which tool owns the case beside each other tool. `cases.json`
writes requests at each of those boundaries: the tool that should answer, and the neighbour a reader could
mistake for it.

## What runs in the gate

No model involved:

- every case names two tools the table covers;
- every routed tool is the answer to at least one case;
- every route's own neighbour appears beside it in a case;
- **every route has at least one case where both tools could be argued for.** A corpus that pairs each
  request with exactly one tool can be answered by elimination; the ambiguous case is what forces a reading
  of the descriptions. An ambiguous case also has to say, in `why`, which phrase decides it — otherwise a
  scoring miss cannot be turned into a fix.

## Scoring a model

```bash
node tests/tool-routing/run.mjs --print-prompt                  # one message: the cases, then the descriptions
node tests/tool-routing/run.mjs --decisions answers.json        # {"0": "<tool>", ...}
```

`--print-prompt` hands over the shipped descriptions and nothing else, so it measures the descriptions. A
live session measures the descriptions plus the system prompt plus the model; that is what a user
experiences, and it costs a session to get.

## Two scored runs

**First, the corpus as it started: 14 cases, 14 tools, one tool per request — 14 of 14.** That number was
worth nothing. The prompt let a solver pair the two lists off by elimination without reading a description.

**Second, after the corpus was hardened: 32 of 36.** Thirty-six requests against fourteen tools, with a case
at every boundary where two tools could both be argued for. Four misses, and they are worth reading one by
one because three of them were the corpus's fault rather than the descriptions':

| Case | Expected | Answered | What it was |
|---|---|---|---|
| is there an import edge from API to store | `uml_structure_verify` | `model_design_review` | a fact question answered with the judging tool; the reader said the choice was arguable |
| does the design's rule allow that call | `model_design_review` | `uml_structure_verify` | the mirror image, on the same pair |
| draw the loader's states, then say if unreachable | `uml_render` | `uml_review` | a compound request |
| draw the machine, and flag anything unsound | `uml_render` | `uml_review` | a compound request |

The two compound requests were measuring which half of a two-part job a reader picks, which is not routing.
They are single-purpose now. The two on the structure/design pair are a real finding: one request about a
fact and one about a rule, and the descriptions did not separate them for a reader in a hurry. That is the
kind of defect this corpus exists to expose, and the next move is to sharpen those two descriptions rather
than to change the expectation.

Both runs are description-level. A description that routes well in this test can still fail in a live
session, where the model also has the system prompt, the skill catalog and its own priors; the way to
measure that is a sample of live sessions, one request per domain, and it costs a session each.
