# Job runner: retry budget

The runner retries a job that fails with a transient error, and the campaign team
relies on this:

> **A job is attempted at most three times. After the third failure it is parked.**

Permanent errors park immediately without consuming the budget.

Attempts are counted in one place: the worker increments the job's counter, and the
store rebuilds it from the recorded history when a job is rehydrated. Both halves are
documented in their own modules so neither has to know about the other's invariants.
