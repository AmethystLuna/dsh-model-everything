// Moving a run that hugs a box into the middle of its channel.
//
// The renderer guarantees that a route never crosses a box and says nothing about running half a pixel beside one. The arithmetic is
// small enough to decide without a drawing, which is what these cases do.
import { channelTarget, CLEARANCE, interiorRuns, movedRun } from '../../lib/render/clearance.js'

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

const run = (points) => interiorRuns(points)[0]
const box = (x, y, width, height) => ({ x, y, width, height })

test('only an interior run can be moved', () => {
  const points = [{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 50, y: 20 }, { x: 50, y: 40 }]
  const runs = interiorRuns(points)
  if (runs.length !== 1) throw new Error('runs: ' + String(runs.length))
  // The middle piece is the one that can move: its two neighbours absorb the shift.
  if (runs[0].index !== 1 || runs[0].axis !== 'y' || runs[0].at !== 20) throw new Error('run: ' + JSON.stringify(runs[0]))
  if (interiorRuns([{ x: 0, y: 0 }, { x: 0, y: 20 }]).length !== 0) throw new Error('a two-point line has an interior run')
})

test('a run just left of a box clears that side, not the far side', () => {
  // The box spans x 100..140 and the run sits at 99: it has to end up at 100 - CLEARANCE, never past the far edge.
  const target = channelTarget(run([{ x: 0, y: 50 }, { x: 99, y: 50 }, { x: 99, y: 150 }, { x: 200, y: 150 }]), [box(100, 60, 40, 80)])
  if (target === undefined) throw new Error('no target')
  if (target > 100 - CLEARANCE + 0.01) throw new Error('target: ' + String(target))
})

test('a run just right of a box clears the far side', () => {
  const target = channelTarget(run([{ x: 0, y: 50 }, { x: 141, y: 50 }, { x: 141, y: 150 }, { x: 200, y: 150 }]), [box(100, 60, 40, 80)])
  if (target === undefined) throw new Error('no target')
  if (target < 140 + CLEARANCE - 0.01) throw new Error('target: ' + String(target))
})

test('a run squeezed between two boxes is left where it is', () => {
  // Clearing one side would hug the other: the drawing keeps the line it had rather than trading one hug for another.
  const target = channelTarget(
    run([{ x: 0, y: 50 }, { x: 99, y: 50 }, { x: 99, y: 150 }, { x: 200, y: 150 }]),
    [box(100, 60, 40, 80), box(20, 60, 78, 80)],
  )
  if (target !== undefined) throw new Error('a squeezed run moved to ' + String(target))
})

test('a run with room around it is left alone', () => {
  const target = channelTarget(run([{ x: 0, y: 50 }, { x: 300, y: 50 }, { x: 300, y: 150 }, { x: 400, y: 150 }]), [box(100, 60, 40, 80)])
  if (target !== undefined) throw new Error('a free run was moved to ' + String(target))
})

test('a box that only reaches the end of the run does not count', () => {
  // A graze of two pixels at the very end of a long line is a corner, not a corridor, and moving the whole line for it would
  // be wrong. The threshold is where the box meets the run, not a share of its length.
  const points = [{ x: 0, y: 50 }, { x: 99, y: 50 }, { x: 99, y: 400 }, { x: 200, y: 400 }]
  const corner = channelTarget(run(points), [box(100, 398, 40, 12)])
  if (corner !== undefined) throw new Error('a corner moved the run to ' + String(corner))
  const alongside = channelTarget(run(points), [box(100, 380, 40, 12)])
  if (alongside === undefined) throw new Error('a box along the run did not move it')
})

test('moving a run moves its two points and nothing else', () => {
  const points = [{ x: 0, y: 50 }, { x: 99, y: 50 }, { x: 99, y: 150 }, { x: 200, y: 150 }]
  const moved = movedRun(points, run(points), 80)
  if (moved.length !== points.length) throw new Error('points: ' + String(moved.length))
  if (moved[1].x !== 80 || moved[2].x !== 80) throw new Error('the run moved: ' + JSON.stringify(moved))
  if (moved[0].x !== 0 || moved[0].y !== 50) throw new Error('a neighbour moved')
  if (points[1].x !== 99) throw new Error('the original was mutated')
})

if (failures > 0) {
  console.log('clearance tests failed:', failures)
  process.exit(1)
}
console.log('all clearance tests passed')