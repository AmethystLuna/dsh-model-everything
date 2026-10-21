const jobs = new Map()

export function createJob(id, payload = {}) {
  const job = { id, payload, status: 'queued', attempts: 0, lastError: null }
  jobs.set(id, job)
  return job
}

export function getJob(id) {
  return jobs.get(id) ?? null
}

export function setStatus(id, status) {
  const job = jobs.get(id)
  if (job === undefined) throw new Error('no job ' + id)
  job.status = status
  return job
}

export function recordFailure(id, error) {
  const job = jobs.get(id)
  if (job === undefined) throw new Error('no job ' + id)
  job.lastError = error?.message ?? String(error)
  return job
}

export function reset() {
  jobs.clear()
}
