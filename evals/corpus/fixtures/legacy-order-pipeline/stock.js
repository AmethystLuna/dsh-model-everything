const stock = new Map([['A', 1], ['B', 5]])
export function left(sku) { return stock.get(sku) ?? 0 }
export async function reserve(sku, qty) {
  const have = left(sku)
  if (have < qty) return { ok: false, reason: 'stock' }
  await new Promise((r) => setImmediate(r))   // 写库
  stock.set(sku, have - qty)
  return { ok: true }
}
export function restock(sku, qty) { stock.set(sku, left(sku) + qty) }
