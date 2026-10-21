const CENT = 1
export function lineTotal(line) {
  const gross = line.price * line.qty
  const net = line.discount ? gross - Math.round(gross * line.discount) : gross
  return Math.round(net)   // 分为单位
}
export function orderTotal(lines) {
  const sum = lines.reduce((a, l) => a + lineTotal(l), 0)
  const tax = Math.round(sum * 0.13)
  return Math.round(sum + tax)
}
