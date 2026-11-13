// What is a name and what is a decoration on it.
//
// The same defect arrived four times before this function existed: a stereotype, a cardinality or a colour left in a name gave an
// id nobody could point at - `a "1"`, `p <<layer>>`, `\"网关\" as gw`. The cases here are the four sources' own forms, plus the
// near miss that must not be stripped.
import { bareName } from '../../lib/render/names.js'
import { boundaryOf } from '../../lib/render/plantuml-reference.js'

let failures = 0
function test(name, body) {
  try {
    body()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', error instanceof Error ? error.message : String(error))
  }
}

const expectName = (text, expected) => {
  const { name } = bareName(text)
  if (name !== expected) throw new Error(JSON.stringify(text) + ' -> ' + JSON.stringify(name))
}

test('a bare name is left alone', () => {
  expectName('gateway', 'gateway')
  expectName("orders-service", 'orders-service')
  expectName('订单服务', '订单服务')
})

test('a stereotype comes off the end', () => {
  expectName('gateway <<service>>', 'gateway')
  expectName('layer <<layer>> <<inner>>', 'layer')
  const { stripped } = bareName('gateway <<service>>')
  if (stripped.length !== 1 || stripped[0] !== '<<service>>') throw new Error('stripped: ' + JSON.stringify(stripped))
})

test('a colour comes off the end', () => {
  expectName('gateway #lightblue', 'gateway')
  // Two decorations in a row both come off, whichever order the source writes them.
  expectName('gateway <<service>> #red', 'gateway')
  // A `#` inside a name is not a colour: the near miss that must survive.
  expectName('"v1#2"', '"v1#2"')
})

test('a cardinality comes off either end', () => {
  expectName('order "1"', 'order')
  expectName('"*" order', 'order')
  expectName('order (0..n)', 'order')
})

test('the decorations are reported in the order they are found', () => {
  const { stripped } = bareName('"1" order <<entity>> #red')
  if (JSON.stringify(stripped) !== JSON.stringify(['#red', '<<entity>>', '"1"'])) throw new Error(JSON.stringify(stripped))
})

test('a quoted name keeps its quotes: they are the name, not a decoration', () => {
  // `"网关" as gw` is handled by the alias reader after this one; the quotes here are part of a quoted name only when the
  // whole token is quoted, which the alias reader takes.
  expectName('"网关"', '"网关"')
})

// A boundary declaration states an alias, a label and what decorates it. It is read here rather than in a diagram, so the three
// answers can be asserted one at a time.
test('a boundary declaration gives its alias as the id and its name as the label', () => {
  const quoted = boundaryOf('package "订单域" as orders', 'package', 1)
  if (quoted.id !== 'orders' || quoted.label !== '订单域') throw new Error(JSON.stringify(quoted))
  const plain = boundaryOf('package billing', 'package', 2)
  if (plain.id !== 'group-2' || plain.label !== 'billing') throw new Error(JSON.stringify(plain))
})

test('a boundary that decorates its name keeps the name and reports the decoration', () => {
  const decorated = boundaryOf('package payments <<layer>> #lightblue', 'package', 3)
  if (decorated.label !== 'payments') throw new Error('label: ' + decorated.label)
  if (JSON.stringify(decorated.decorations) !== JSON.stringify(['#lightblue', '<<layer>>'])) throw new Error(JSON.stringify(decorated.decorations))
})

test('a boundary with no name falls back to its keyword', () => {
  const empty = boundaryOf('package', 'package', 4)
  if (empty.label !== 'package') throw new Error('label: ' + empty.label)
})

if (failures > 0) {
  console.log('names tests failed:', failures)
  process.exit(1)
}
console.log('all names tests passed')