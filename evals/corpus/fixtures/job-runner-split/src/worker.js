import { afterFailure, afterSuccess } from './retry.js'
import { getJob, recordFailure, setStatusSafe } from './store.js'

/** One attempt. The worker owns the increment; the retry policy owns the decision. */
export function attempt(id, handler) {
  const job = getJob(id)
  if (job === null) throw new Error('no job ' + id)
  job.status = 'running'
  try {
    handler()
    return afterSuccess(id)
  } catch (error) {
    job.attempts += 1
    recordFailure(id, error)
    return afterFailure(id, error)
  }
}
