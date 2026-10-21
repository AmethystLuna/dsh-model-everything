import { reserve } from './stock.js'
import { orderTotal } from './pricing.js'
const orders = new Map()
export async function createOrder(id, lines) {
  for (const l of lines) {
    const r = await reserve(l.sku, l.qty)
    if (!r.ok) return { ok: false, reason: 'stock' }
  }
  orders.set(id, { id, lines, state: 'pending', paid: false })
  return { ok: true, total: orderTotal(lines) }
}
export function pay(id) {
  const o = orders.get(id)
  if (!o) return { ok: false }
  o.paid = true
  o.state = 'paid'
  return { ok: true }
}
export function cancel(id) {
  const o = orders.get(id)
  if (!o) return { ok: false }
  if (o.state === 'shipped') return { ok: false, reason: 'shipped' }
  o.state = 'cancelled'
  return { ok: true }
}
export function ship(id) {
  const o = orders.get(id)
  if (!o) return { ok: false }
  if (o.state !== 'paid' && o.paid) { o.state = 'shipped'; return { ok: true } }
  if (o.state === 'paid') { o.state = 'shipped'; return { ok: true } }
  return { ok: false, reason: 'unpaid' }
}
export function state(id) { return orders.get(id)?.state }
export function reset() { orders.clear() }
