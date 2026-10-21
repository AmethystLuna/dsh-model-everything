import assert from 'node:assert/strict'
import test from 'node:test'

import { PermanentError, TransientError } from '../src/errors.js'
import { MAX_ATTEMPTS, onFailure, onSuccess } from '../src/retry.js'
import { createJob, getJob, reset } from '../src/store.js'
import { drain } from '../src/worker.js'

test('a permanent error parks the job immediately', () => {
  reset()
  createJob('a')
  assert.equal(onFailure('a', new PermanentError('bad payload')), 'parked')
  assert.equal(getJob('a').status, 'parked')
})

test('a transient error re-queues the job', () => {
  reset()
  createJob('a')
  assert.equal(onFailure('a', new TransientError('timeout')), 'retry')
  assert.equal(getJob('a').status, 'queued')
})

test('success marks the job done and clears its attempts', () => {
  reset()
  createJob('a')
  assert.equal(onSuccess('a'), 'done')
  assert.equal(getJob('a').attempts, 0)
})

test('a handler that fails once transiently is retried', () => {
  reset()
  createJob('a')
  const result = drain('a', () => { throw new TransientError('timeout') }, 1)
  assert.equal(result.transition, 'retry')
  assert.equal(getJob('a').status, 'queued')
})

test('the attempt budget is three', () => {
  assert.equal(MAX_ATTEMPTS, 3)
})
