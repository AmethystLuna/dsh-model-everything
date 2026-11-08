// The last repair: ask the router twice, take the first answer that clears, and give up honestly.
//
// The order matters - with the channel stage's ports first, then with the router's own choice of sides - and so does the
// refusal: a repair that still crosses is not a repair, and the caller reports the route instead of moving it.
import { repairedRoute } from '../../lib/render/repair.js'

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

const path = (name) => [{ x: 0, y: 0, name }, { x: 10, y: 0, name }]
const crossing = (value) => value.some((point) => point.name === 'crossing')

test('a path that does not cross is not repaired', () => {
  const asked = []
  const repaired = repairedRoute(path('clear'), 'ports', {
    crosses: crossing,
    route: (anchors) => { asked.push(anchors); return path('clear') },
  })
  if (repaired !== undefined) throw new Error('a clear path was repaired')
  if (asked.length !== 0) throw new Error('the router was asked about a clear path')
})

test('the ports are tried first, and the first clear answer wins', () => {
  const asked = []
  const repaired = repairedRoute(path('crossing'), 'ports', {
    crosses: crossing,
    route: (anchors) => { asked.push(anchors); return path('clear') },
  })
  if (repaired === undefined) throw new Error('a clear answer was refused')
  if (asked.length !== 1) throw new Error('the second question was asked anyway: ' + JSON.stringify(asked))
  if (asked[0] !== 'ports') throw new Error('the ports were not offered first: ' + JSON.stringify(asked))
})

test('a crossing answer falls through to the router own sides', () => {
  const asked = []
  const repaired = repairedRoute(path('crossing'), 'ports', {
    crosses: crossing,
    route: (anchors) => { asked.push(anchors); return path(anchors === undefined ? 'clear' : 'crossing') },
  })
  if (repaired === undefined) throw new Error('the second answer was refused')
  if (asked.length !== 2) throw new Error('the ladder was not walked: ' + JSON.stringify(asked))
  if (asked[1] !== undefined) throw new Error('the second question carried ports')
})

test('when every answer crosses, nothing is repaired', () => {
  const repaired = repairedRoute(path('crossing'), 'ports', {
    crosses: crossing,
    route: () => path('crossing'),
  })
  if (repaired !== undefined) throw new Error('a crossing answer was taken as a repair')
})

if (failures > 0) {
  console.log('repair tests failed:', failures)
  process.exit(1)
}
console.log('all repair tests passed')