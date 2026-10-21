# Job runner design

## Retries

A job that fails with a transient error is retried. The runner guarantees:

> **A failed job is attempted at most three times, after which it is parked for a human.**

Permanent errors are not retried at all: the job goes straight to `parked`.

## State

A job is `queued`, `running`, `done` or `parked`. Once parked, a job stays parked
until an operator releases it; the runner never retries a parked job on its own.
