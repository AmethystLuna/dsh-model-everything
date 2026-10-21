import assert from 'node:assert/strict'
import test from 'node:test'

import { canMove, move, reachable } from '../src/lifecycle.js'
import { Order } from '../src/orders.js'

test('a placed order can be packed and shipped', () => {
  assert.equal(move('placed', 'pack'), 'packed')
  assert.equal(move('packed', 'ship'), 'shipped')
})

test('an unknown event is rejected', () => {
  assert.throws(() => move('draft', 'ship'), /cannot ship from draft/)
})

test('a placed order can ship directly', () => {
  assert.equal(move('placed', 'ship'), 'shipped')
})

test('cancel is reachable from every pre-ship state', () => {
  assert.equal(move('draft', 'cancel'), 'cancelled')
  assert.equal(move('placed', 'cancel'), 'cancelled')
  assert.equal(move('packed', 'cancel'), 'cancelled')
})

test('an order records its history', () => {
  const order = new Order('o1')
  order.apply('place')
  order.apply('cancel')
  assert.equal(order.state, 'cancelled')
  assert.equal(order.history.length, 2)
})

test('shipped is reachable from placed', () => {
  assert.equal(reachable('placed', 'shipped'), true)
})

test('applyIfPossible does nothing when the transition is absent', () => {
  const order = new Order('o2')
  assert.equal(order.applyIfPossible('ship'), false)
  assert.equal(order.state, 'draft')
})
