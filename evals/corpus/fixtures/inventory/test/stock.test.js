import assert from 'node:assert/strict'
import test from 'node:test'

import { adjust, quantityOf, reserve, reset, seed } from '../src/stock.js'

test('reserve takes stock', async () => {
  reset()
  seed('a', 10)
  assert.equal(await reserve('a', 3), true)
  assert.equal(quantityOf('a'), 7)
})

test('reserve refuses when there is not enough', async () => {
  reset()
  seed('a', 2)
  assert.equal(await reserve('a', 5), false)
  assert.equal(quantityOf('a'), 2)
})

test('adjust adds and subtracts', async () => {
  reset()
  seed('a', 10)
  assert.equal(await adjust('a', 5), 15)
  assert.equal(await adjust('a', -2), 13)
})

test('a reserved amount is not visible to a later adjustment in sequence', async () => {
  reset()
  seed('a', 10)
  await reserve('a', 4)
  await adjust('a', -1)
  assert.equal(quantityOf('a'), 5)
})
