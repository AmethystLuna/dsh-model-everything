/** Allowed transitions, as [from, event, to]. */
export const TRANSITIONS = [
  ['draft', 'place', 'placed'],
  ['placed', 'pack', 'packed'],
  ['packed', 'ship', 'shipped'],
  ['placed', 'ship', 'shipped'],
  ['draft', 'cancel', 'cancelled'],
  ['placed', 'cancel', 'cancelled'],
  ['packed', 'cancel', 'cancelled'],
  // A cancelled order can be re-shipped after an operator re-approves it.
  ['cancelled', 'approve', 'placed'],
]

export class OrderError extends Error {}

export function move(state, event) {
  const found = TRANSITIONS.find(([from, name]) => from === state && name === event)
  if (found === undefined) throw new OrderError(`cannot ${event} from ${state}`)
  return found[2]
}

export function canMove(state, event) {
  return TRANSITIONS.some(([from, name]) => from === state && name === event)
}

export function reachable(from, to) {
  const seen = new Set([from])
  const queue = [from]
  while (queue.length > 0) {
    const state = queue.shift()
    if (state === to) return true
    for (const [source, , target] of TRANSITIONS) {
      if (source === state && !seen.has(target)) {
        seen.add(target)
        queue.push(target)
      }
    }
  }
  return false
}
