# Order lifecycle

An order moves through `draft`, `placed`, `packed`, `shipped` and can be `cancelled`
at any point before it ships.

Two guarantees the fulfilment team depends on:

> **1. `cancelled` is terminal: nothing leaves the cancelled state.**
> **2. `shipped` is reachable from `placed` without going through `packed` when the
> warehouse already has the item in stock (direct ship).**

The transition table in `src/lifecycle.js` is the single source of truth; every
caller goes through `move()`.
