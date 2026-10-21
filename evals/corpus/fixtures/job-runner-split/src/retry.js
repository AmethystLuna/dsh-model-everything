import { getJob, recordFailure, rehydrate, createJob } from './store.js'

export const MAX_ATTEMPTS = 3

/**
 * Called after every failed attempt. Rehydrates the job from the heap it was popped from
 * so the count is rebuilt rather than carried in a closure, then decides.
 */
export function afterFailure(id, error, snapshot) {
  const job = snapshot === undefined ? getJob(id) : rehydrate(id, snapshot)
  if (job === null) throw new Error('no job ' + id)
  recordFailure(id, error)

  if (error?.transient !== true) {
    job.status = 'parked'
    return 'parked'
  }
  if (job.attempts >= MAX_ATTEMPTS) {
    job.status = 'parked'
    return 'parked'
  }
  job.status = 'queued'
  return 'retry'
}

export function afterSuccess(id) {
  const job = getJob(id) ?? createJob(id)
  job.attempts = 0
  job.status = 'done'
  return 'done'
}
