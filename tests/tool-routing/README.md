# Tool routing, scored by hand

The routing table (`src/routing.ts`) says which tool owns the case beside each other tool. `cases.json`
writes one request at each of those boundaries, with the tool it should reach and the neighbour it must
not.

## What runs in the gate

The structural half, no model involved:

- every case names two tools the table covers;
- every routed tool is the answer to at least one case;
- every route's own neighbour appears beside it in a case, so a route cannot exist without a case that
  puts the two side by side;
- a case without a near miss is rejected, because a request nothing could confuse measures reading, not
  routing.

## Scoring a model

```bash
node tests/tool-routing/run.mjs --print-prompt                  # one message: the cases, then the descriptions
node tests/tool-routing/run.mjs --decisions answers.json        # {"0": "<tool>", ...}
```

`--print-prompt` hands over the shipped descriptions and nothing else, so it measures the descriptions.
A live session measures the descriptions plus the system prompt plus the model; that is the number a user
experiences, and it costs a session to get.

## The first scored run, and what it is worth

The prompt was handed to a model with no repository access, answering from that text alone: **14 of 14**.

Read it as a floor, not as a result. The prompt listed the cases and the tools that answer them, and every
tool appeared exactly once, so a solver could pair them off by elimination without reading a description.
The right next step for this suite is to break that correspondence — more cases than tools, two tools that
could both answer one request — and to re-score. Until then the honest statement is that the descriptions
did not defeat a reader who could count.
