// The drawing card: what a picture carries, and what it must not pretend to carry.
//
// A diagram has no verdict. The card is the one place a wrong one could appear - and a card that answered `verdict: pass` for a drawing would be
// the same mistake as a zeroed delta on a report nothing was compared against: a claim about work that never happened.
const renderTool = (await import('../../lib/diagram-render-tool.js')).diagramRenderTool

let failures = 0
async function test(name, body) {
  try {
    await body()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', error instanceof Error ? error.message : String(error))
  }
}

const SOURCE = 'graph TD\n  a[A] --> b[B]'

const card = async (args) => {
  const value = await renderTool.execute(args)
  return { value, meta: renderTool.output.presentationMeta(args, value) }
}

await test('a drawing card carries the source it was drawn from', async () => {
  // The card is where a view finds the source after the arguments are gone, so it has to be verbatim.
  const { meta } = await card({ source: SOURCE })
  if (meta.source !== SOURCE) throw new Error('the card carries ' + JSON.stringify(meta.source).slice(0, 60))
})

await test('a drawing card carries no verdict', async () => {
  for (const args of [{ source: SOURCE }, { source: '   ' }]) {
    const { meta } = await card(args)
    if ('verdict' in meta) throw new Error('the card answers a verdict for ' + JSON.stringify(args.source).slice(0, 20))
    if ('verdictReason' in meta) throw new Error('the card answers a verdictReason')
  }
})

await test('an empty source is refused with a reason rather than drawn', async () => {
  const { value } = await card({ source: '   ' })
  if (value.ok !== false) throw new Error('an empty source was drawn')
  if (!Array.isArray(value.refused) || value.refused.length === 0) throw new Error('no refusal was reported')
  if (!/empty/.test(String(value.refused[0]))) throw new Error('the refusal does not say why: ' + String(value.refused[0]))
})

await test('both answers have the same shape, so a consumer never special-cases', async () => {
  const good = (await card({ source: SOURCE })).value
  const empty = (await card({ source: '   ' })).value
  if (JSON.stringify(Object.keys(good).sort()) !== JSON.stringify(Object.keys(empty).sort())) {
    throw new Error('the two shapes differ: ' + Object.keys(good).join(',') + ' against ' + Object.keys(empty).join(','))
  }
  if (typeof good.caption !== 'string' || typeof empty.caption !== 'string') throw new Error('a caption is not a string')
})

await test('a drawing reports what it refused, and counts what it drew', async () => {
  const { value } = await card({ source: 'graph TD\n  a[A] --> b[B]' })
  if (value.nodes !== 2) throw new Error('nodes: ' + String(value.nodes))
  if (value.edges !== 1) throw new Error('edges: ' + String(value.edges))
  if (value.dropped !== 0) throw new Error('dropped: ' + String(value.dropped))
  if (String(value.svg).length === 0) throw new Error('no svg')
})

if (failures > 0) {
  console.log('diagram-card tests failed:', failures)
  process.exit(1)
}
console.log('all diagram-card tests passed')