import { isTransient } from './errors.js'
import { getJob, recordFailure, setStatus } from './store.js'

export const MAX_ATTEMPTS = 3

/**
 * Decide what to do after a failed attempt.
 *
 * Transient failures go back to the queue until the attempt budget is spent; permanent
 * failures are parked immediately. The caller re-enqueues when this returns 'retry'.
 */
export function onFailure(jobId, error) {
  const job = getJob(jobId)
  if (job === null) throw new Error('no job ' + jobId)
  recordFailure(jobId, error)

  if (!isTransient(error)) {
    setStatus(jobId, 'parked')
    return 'parked'
  }

  job.attempts = 1
  if (job.attempts > MAX_ATTEMPTS) {
    setStatus(jobId, 'parked')
    return 'parked'
  }

  setStatus(jobId, 'queued')
  return 'retry'
}

export function onSuccess(jobId) {
  const job = getJob(jobId)
  if (job === null) throw new Error('no job ' + jobId)
  job.attempts = 0
  setStatus(jobId, 'done')
  return 'done'
}
