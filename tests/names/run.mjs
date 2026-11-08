// What is a name and what is a decoration on it.
//
// The same defect arrived four times before this function existed: a stereotype, a cardinality or a colour left in a name gave an
// id nobody could point at - `a "1"`, `p <<layer>>`, `\"网关\" as gw`. The cases here are the four sources' own forms, plus the
// near miss that must not be stripped.
import { bareName } from '../../lib/render/names.js'

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

if (failures > 0) {
  console.log('names tests failed:', failures)
  process.exit(1)
}
console.log('all names tests passed')