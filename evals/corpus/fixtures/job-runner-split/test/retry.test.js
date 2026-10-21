import assert from 'node:assert/strict'
import test from 'node:test'

import { afterFailure, afterSuccess, MAX_ATTEMPTS } from '../src/retry.js'
import { createJob, getJob, rehydrate, reset } from '../src/store.js'
import { attempt } from '../src/worker.js'

test('a permanent failure parks immediately', () => {
  reset()
  createJob('a')
  assert.equal(afterFailure('a', { transient: false, message: 'bad' }), 'parked')
})

test('the policy parks once the budget is spent', () => {
  reset()
  createJob('a')
  getJob('a').attempts = MAX_ATTEMPTS
  assert.equal(afterFailure('a', { transient: true, message: 'timeout' }), 'parked')
})

test('a transient failure below the budget re-queues', () => {
  reset()
  createJob('a')
  assert.equal(afterFailure('a', { transient: true, message: 'timeout' }), 'retry')
})

test('rehydrate rebuilds attempts from the history', () => {
  reset()
  createJob('a')
  const job = rehydrate('a', { history: ['attempt', 'attempt'], failures: [] })
  assert.equal(job.attempts, 2)
})

test('success marks done and clears the counter', () => {
  reset()
  createJob('a')
  assert.equal(afterSuccess('a'), 'done')
  assert.equal(getJob('a').attempts, 0)
})

test('one failed attempt goes through the worker and re-queues', () => {
  reset()
  createJob('a')
  const transition = attempt('a', () => { throw { transient: true, message: 'timeout' } })
  assert.equal(transition, 'retry')
})
