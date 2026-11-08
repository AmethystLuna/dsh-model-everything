// Packing the ports of one side: how far apart they sit, and where a row lands.
//
// The defect this guards is two edges leaving one side from the same pixel: a reader sees one line split, and no stage below
// can recover the two statements. The other half is the opposite mistake - a row that fits at the full separation must not be
// squeezed just because another box's side is narrow.
import { centreRun, packPorts, PORT_SEPARATION } from '../../lib/render/ports.js'

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

const gaps = (placed) => placed.slice(1).map((value, index) => value - placed[index])

test('two ports on a side with room keep the full separation', () => {
  const placed = packPorts([40, 60], 10, 90)
  if (placed.length !== 2) throw new Error('ports: ' + String(placed.length))
  if (Math.abs(placed[0] - placed[1]) < PORT_SEPARATION) throw new Error('gaps: ' + JSON.stringify(gaps(placed)))
})

test('a crowded side squeezes instead of stacking two ports on one pixel', () => {
  // Ten ports into sixty-eight points of side: the full separation does not fit, so it shrinks.
  const placed = packPorts([10, 10, 10, 10, 10, 10, 10, 10, 10, 10], 10, 78)
  if (placed.length !== 10) throw new Error('ports: ' + String(placed.length))
  for (const gap of gaps(placed)) if (gap < 0.5) throw new Error('two ports coincide: ' + JSON.stringify(placed))
  if (Math.max(...gaps(placed)) >= PORT_SEPARATION) throw new Error('the row was not squeezed: ' + JSON.stringify(gaps(placed)))
})

test('the order the ports arrive in is the order they are placed in', () => {
  // The caller sorts; the walk does not, and it says so. Given ascending wants the row comes out ascending, and given
  // wants handed over out of order it still walks forward in the order it was given.
  const ascending = packPorts([20, 40, 60], 0, 100)
  if (!(ascending[0] < ascending[1] && ascending[1] < ascending[2])) throw new Error('ascending: ' + JSON.stringify(ascending))
  const handed = packPorts([60, 20, 40], 0, 100)
  if (!(handed[0] < handed[1] && handed[1] < handed[2])) throw new Error('handed: ' + JSON.stringify(handed))
})

test('every port ends up on the side it was packed into', () => {
  const placed = packPorts([0, 0, 0, 0, 0], 20, 50)
  for (const value of placed) if (value < 20 - 0.01 || value > 50 + 0.01) throw new Error('off the side: ' + String(value))
})

test('a row is centred on the side it sits on', () => {
  const placed = centreRun(packPorts([40, 60], 10, 90), 10, 90)
  const middle = (10 + 90) / 2
  if (Math.abs((placed[0] + placed[1]) / 2 - middle) > 0.01) throw new Error('not centred: ' + JSON.stringify(placed))
})

test('a row that cannot travel stops at the end of the side', () => {
  const placed = centreRun([10, 20, 30], 0, 40)
  if (placed[0] < -0.01) throw new Error('a port left the side: ' + JSON.stringify(placed))
})

test('an empty row stays empty', () => {
  if (centreRun([], 0, 40).length !== 0) throw new Error('an empty row grew')
  if (packPorts([], 0, 40).length !== 0) throw new Error('an empty side produced a port')
})

if (failures > 0) {
  console.log('ports tests failed:', failures)
  process.exit(1)
}
console.log('all ports tests passed')