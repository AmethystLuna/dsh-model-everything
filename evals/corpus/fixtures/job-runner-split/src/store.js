/** The job record: the single place the attempt counter lives. */
const jobs = new Map()

export function createJob(id) {
  const job = { id, status: 'queued', attempts: 0, failures: [], history: [] }
  jobs.set(id, job)
  return job
}

export function getJob(id) {
  return jobs.get(id) ?? null
}

export function recordFailure(id, error) {
  const job = getJob(id)
  if (job === null) throw new Error('no job ' + id)
  job.failures.push(error?.message ?? String(error))
  return job
}

export function recordSuccess(id, event) {
  const job = getJob(id)
  if (job === null) throw new Error('no job ' + id)
  job.history.push(event)
  return job
}

/** Rehydrate a job from its stored history (used when a job is picked up again). */
export function rehydrate(id, snapshot) {
  const job = getJob(id) ?? createJob(id)
  job.history = [...snapshot.history]
  job.failures = [...snapshot.failures]
  job.attempts = job.history.filter((entry) => entry === 'attempt').length
  return job
}

export function setStatusSafe(id, status) {
  const job = getJob(id)
  if (job === null) throw new Error('no job ' + id)
  job.status = status
  return job
}

export function reset() {
  jobs.clear()
}
