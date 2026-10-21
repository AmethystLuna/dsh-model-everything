const items = new Map()
const locks = new Map()

export function lockFor(name) {
  if (!locks.has(name)) locks.set(name, Promise.resolve())
  const previous = locks.get(name)
  let release
  const next = new Promise((resolve) => { release = resolve })
  locks.set(name, previous.then(() => next))
  return previous.then(() => release)
}

export function seed(sku, quantity) {
  items.set(sku, { sku, quantity })
}

export function quantityOf(sku) {
  return items.get(sku)?.quantity ?? 0
}

const delay = () => new Promise((resolve) => setTimeout(resolve, 1))

/** Take stock for an order. */
export async function reserve(sku, qty) {
  const release = await lockFor(sku)
  try {
    const item = items.get(sku)
    if (item === undefined) throw new Error('no sku ' + sku)
    const current = item.quantity
    await delay()
    if (current < qty) return false
    items.set(sku, { sku, quantity: current - qty })
    return true
  } finally {
    release()
  }
}

/** Apply a stock count correction. */
export async function adjust(sku, delta) {
  const release = await lockFor(sku + ':adjust')
  try {
    const item = items.get(sku)
    if (item === undefined) throw new Error('no sku ' + sku)
    const current = item.quantity
    await delay()
    items.set(sku, { sku, quantity: current + delta })
    return current + delta
  } finally {
    release()
  }
}

export function reset() {
  items.clear()
  locks.clear()
}
