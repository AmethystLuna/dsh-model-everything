// Reading a drawing for two routes drawn as one line, as arithmetic on pieces.
//
// The rows a caller keeps while it tries moves must total exactly what a fresh walk of the drawing totals: that equality is
// the whole reason the separation pass can try a move without re-walking every pair, so it is asserted rather than assumed.
import { NEAR_LINE, piecesFrom, sharedLength, sharedWith, totalFromRows } from '../../lib/render/separate.js'

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

const route = (...pairs) => pairs.map(([x, y]) => ({ x, y }))

test('a piece is the axis it runs on, where, and how far', () => {
  const pieces = piecesFrom(route([0, 0], [40, 0], [40, 30]))
  if (pieces.length !== 2) throw new Error('pieces: ' + String(pieces.length))
  const [across, down] = pieces
  if (across.axis !== 'y' || across.at !== 0 || across.lo !== 0 || across.hi !== 40) throw new Error('horizontal: ' + JSON.stringify(across))
  if (down.axis !== 'x' || down.at !== 40 || down.lo !== 0 || down.hi !== 30) throw new Error('vertical: ' + JSON.stringify(down))
})

test('a diagonal leg is not a piece', () => {
  if (piecesFrom(route([0, 0], [10, 4])).length !== 0) throw new Error('a diagonal became a piece')
})

test('two routes on one line share the length they overlap', () => {
  const one = piecesFrom(route([0, 0], [100, 0]))
  const two = piecesFrom(route([40, 0], [140, 0]))
  // One short of the geometric overlap of sixty: the arithmetic subtracts a pixel so that two routes meeting at a
  // corner share nothing at all, instead of counting the point they touch.
  if (sharedLength([one, two]) !== 59) throw new Error('shared: ' + String(sharedLength([one, two])))
})

test('two routes a few points apart still read as one line', () => {
  const one = piecesFrom(route([0, 0], [100, 0]))
  const two = piecesFrom(route([0, NEAR_LINE - 1], [100, NEAR_LINE - 1]))
  if (sharedLength([one, two]) <= 0) throw new Error('a near line was not counted')
})

test('two routes further apart than the near line do not', () => {
  const one = piecesFrom(route([0, 0], [100, 0]))
  const two = piecesFrom(route([0, NEAR_LINE + 1], [100, NEAR_LINE + 1]))
  if (sharedLength([one, two]) !== 0) throw new Error('a separate line was counted')
})

test('a crossing at one point is not a shared length', () => {
  const across = piecesFrom(route([0, 0], [100, 0]))
  const down = piecesFrom(route([50, -40], [50, 40]))
  if (sharedLength([across, down]) !== 0) throw new Error('a crossing counted as a shared line')
})

test('the rows total exactly what a fresh walk totals', () => {
  const routes = [
    piecesFrom(route([0, 0], [100, 0], [100, 60])),
    piecesFrom(route([0, 2], [90, 2], [90, 60])),
    piecesFrom(route([10, 60], [120, 60])),
    piecesFrom(route([0, 0], [40, 0])),
  ]
  const rows = routes.map((_, index) => sharedWith(routes, index))
  const direct = sharedLength(routes)
  if (Math.abs(totalFromRows(rows) - direct) > 1e-9) {
    throw new Error('rows ' + totalFromRows(rows).toFixed(3) + ' vs direct ' + direct.toFixed(3))
  }
})

if (failures > 0) {
  console.log('separate tests failed:', failures)
  process.exit(1)
}
console.log('all separate tests passed')