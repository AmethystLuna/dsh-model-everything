import { canMove, move } from './lifecycle.js'

export class Order {
  constructor(id) {
    this.id = id
    this.state = 'draft'
    this.history = []
  }

  apply(event) {
    const next = move(this.state, event)
    this.history.push({ from: this.state, event, to: next })
    this.state = next
    return this.state
  }

  applyIfPossible(event) {
    if (!canMove(this.state, event)) return false
    this.apply(event)
    return true
  }
}
