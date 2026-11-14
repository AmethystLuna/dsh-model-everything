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

await test('all three drawing tools declare the call and result card a host UI reads', async () => {
  // Without the pair, a host that is not this plugin's client falls back to raw content: the drawing arriver as JSON.
  const modules = await Promise.all([
    import('../../lib/diagram-render-tool.js'),
    import('../../lib/diagram-review-tool.js'),
    import('../../lib/diagram-diff-tool.js'),
  ])
  for (const mod of modules) {
    const tool = mod.diagramRenderTool ?? mod.diagramReviewTool ?? mod.diagramDiffTool
    if (typeof tool.presentCall !== 'function') throw new Error(tool.name + ' has no presentCall')
    if (typeof tool.presentResult !== 'function') throw new Error(tool.name + ' has no presentResult')
  }
})

await test('a drawing card states what was drawn and what was refused', async () => {
  const { diagramRenderTool } = await import('../../lib/diagram-render-tool.js')
  const value = await diagramRenderTool.execute({ source: 'graph TD\n  a[A] --> b[B]\n  cloud c1', notation: 'mermaid' })
  const view = diagramRenderTool.presentResult({}, { content: [], meta: value })
  if (view === undefined) throw new Error('no card for a drawing')
  const text = view.content.map((block) => block.text ?? '').join('\n')
  if (!/drawn: 2 box\(es\)/.test(text)) throw new Error('the card does not state what was drawn: ' + text.slice(0, 120))
  if (!/1 line\(s\) refused/.test(text)) throw new Error('the card does not state what was refused: ' + text.slice(0, 160))
})

await test('a review or a delta card leads with its verdict and its counts', async () => {
  // The other two shapes the same helper serves: a review has no node count but has a verdict and measured figures;
  // a delta has neither and leads with the number of changes.
  const { diagramReviewTool } = await import('../../lib/diagram-review-tool.js')
  const { diagramDiffTool } = await import('../../lib/diagram-diff-tool.js')
  const reviewed = await diagramReviewTool.execute({ source: 'graph TD\n  a[A] --> b[B]', notation: 'mermaid' })
  const reviewCard = diagramReviewTool.presentResult({}, { content: [], meta: reviewed })
  if (reviewCard === undefined) throw new Error('no card for a review')
  const reviewText = reviewCard.content.map((block) => block.text ?? '').join('\n')
  if (!/^PASS|^FAIL/.test(reviewText)) throw new Error('the review card does not lead with its verdict: ' + reviewText.slice(0, 80))
  if (!/measured:/.test(reviewText)) throw new Error('the review card states no measurement: ' + reviewText.slice(0, 120))
  // A node added, not a label changed: a relabelled box is not a containment change, so it produces no entry.
  const delta = await diagramDiffTool.execute({ before: 'graph TD\n  a[A] --> b[B]', after: 'graph TD\n  a[A] --> b[B]\n  b --> c[C]', notation: 'mermaid' })
  const deltaCard = diagramDiffTool.presentResult({}, { content: [], meta: delta })
  const deltaText = deltaCard.content.map((block) => block.text ?? '').join('\n')
  if (!/changes: [1-9]/.test(deltaText)) throw new Error('the delta card states no change count: ' + deltaText.slice(0, 120))
})

await test('the body a model reads starts with the family the payload states', async () => {
  // The three bodies used to print `dsh-diagram/...`, an id in no registry and not the payload's own: a reader keying on the
  // first token was told a family that does not exist. The body now prints `report.schema`.
  const modules = await Promise.all([
    import('../../lib/diagram-render-tool.js'),
    import('../../lib/diagram-review-tool.js'),
    import('../../lib/diagram-diff-tool.js'),
  ])
  const calls = [
    [modules[0].diagramRenderTool, { source: 'graph TD\n  a[A] --> b[B]', notation: 'mermaid' }],
    [modules[1].diagramReviewTool, { source: 'graph TD\n  a[A] --> b[B]', notation: 'mermaid' }],
    [modules[2].diagramDiffTool, { before: 'graph TD\n  a[A] --> b[B]', after: 'graph TD\n  a[A] --> b[B]\n  b --> c[C]', notation: 'mermaid' }],
  ]
  for (const [tool, args] of calls) {
    const value = await tool.execute(args)
    const body = tool.output.render(args, value)[0].text
    const first = body.split('\n')[0]
    if (!first.startsWith(value.schema)) throw new Error(tool.name + ' body starts ' + JSON.stringify(first.slice(0, 46)) + ', payload schema ' + value.schema)
    if (/dsh-diagram\//.test(body)) throw new Error(tool.name + ' body still names an unregistered family')
  }
})

await test('the card helper answers nothing for a payload it cannot describe', async () => {
  // The three early returns: no verdict and no numbers, a verdict with no reason, and a drawing with no refusals.
  const { drawingResultView } = await import('../../lib/presentation.js')
  const view = drawingResultView('labelled')
  if (view({}, { meta: { nothing: true } }) !== undefined) throw new Error('a payload with nothing to say still produced a card')
  const bare = view({}, { meta: { verdict: 'pass' } })
  if (bare === undefined) throw new Error('a verdict alone produced no card')
  if (/—/.test(bare.content[0].text)) throw new Error('a verdict with no reason printed a separator: ' + bare.content[0].text)
  const clean = view({}, { meta: { nodes: 3, edges: 2, refused: [], measured: null } })
  if (/refused/.test(clean.content[0].text)) throw new Error('a drawing that refused nothing says it refused something')
})

if (failures > 0) {
  console.log('diagram-card tests failed:', failures)
  process.exit(1)
}
console.log('all diagram-card tests passed')