import { TransientError } from './errors.js'
import { onFailure, onSuccess } from './retry.js'
import { getJob, setStatus } from './store.js'

/** Run one attempt of a job. Returns the transition the runner should take next. */
export function runOnce(jobId, handler) {
  const job = getJob(jobId)
  if (job === null) throw new Error('no job ' + jobId)
  if (job.status === 'parked') return 'parked'

  setStatus(jobId, 'running')
  try {
    handler(job.payload)
    return onSuccess(jobId)
  } catch (error) {
    if (error instanceof TransientError) {
      // The attempt count lives on the job, so the budget is shared across runs.
      job.attempts += 1
    }
    return onFailure(jobId, error)
  }
}

/** Drive a job to a terminal state, up to `limit` attempts, returning how many were made. */
export function drain(jobId, handler, limit = 10) {
  let attempts = 0
  let transition = 'retry'
  while (transition === 'retry' && attempts < limit) {
    transition = runOnce(jobId, handler)
    attempts += 1
  }
  return { attempts, transition }
}
