// The two hash-bearing UML actions, and what a reader can tie together with them.
//
// A rendered diagram is text someone will paste elsewhere, so its report has to say which model it shows (`modelHash`) and under which scheme
// (`hashSpec`). A parse then reports the hash of the text it read and of the model it recovered, which is the whole round-trip proof in two strings.
const { umlRenderTool, umlParseTool } = await import('../../lib/uml-tool.js')
const { modelHash } = await import('../../lib/engine.js')

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

const MODEL = {
  schemaVersion: 1, init: 'idle',
  states: [{ id: 'idle' }, { id: 'done', terminal: true }],
  transitions: [{ from: 'idle', event: 'go', to: 'done' }],
}

await test('a rendered diagram names the model it shows, under a stated scheme', async () => {
  const rendered = await umlRenderTool.execute({ model: MODEL, notation: 'mermaid', kind: 'state' })
  if (typeof rendered.hashes?.hashSpec !== 'string') throw new Error('no hashSpec: ' + JSON.stringify(rendered.hashes))
  if (rendered.hashes.modelHash !== modelHash(MODEL)) throw new Error('modelHash ' + String(rendered.hashes.modelHash).slice(0, 16))
  if (typeof rendered.hashes.diagram !== 'string' || rendered.hashes.diagram.length === 0) throw new Error('no diagram hash')
})

await test('reading the diagram back recovers the same model, and says so in the hash', async () => {
  const rendered = await umlRenderTool.execute({ model: MODEL, notation: 'mermaid', kind: 'state' })
  const parsed = await umlParseTool.execute({ diagram: String(rendered.diagram), notation: 'mermaid' })
  if (parsed.hashes.modelHash !== modelHash(MODEL)) throw new Error('the recovered model hashes differently')
  if (parsed.hashes.diagram !== rendered.hashes.diagram) throw new Error('the two sides hash the text differently')
})

await test('a plantuml round trip gives the same two hashes', async () => {
  const rendered = await umlRenderTool.execute({ model: MODEL, notation: 'plantuml', kind: 'state' })
  const parsed = await umlParseTool.execute({ diagram: String(rendered.diagram), notation: 'plantuml' })
  if (parsed.hashes.modelHash !== rendered.hashes.modelHash) throw new Error('model took a different shape')
  if (parsed.hashes.diagram !== rendered.hashes.diagram) throw new Error('diagram hash differs')
})

await test('a different model gets a different diagram hash', async () => {
  // The control: a hash that never moved would pass every case above.
  const other = { ...MODEL, transitions: [{ from: 'idle', event: 'stop', to: 'idle' }, ...MODEL.transitions] }
  const first = await umlRenderTool.execute({ model: MODEL, notation: 'mermaid', kind: 'state' })
  const second = await umlRenderTool.execute({ model: other, notation: 'mermaid', kind: 'state' })
  if (first.hashes.diagram === second.hashes.diagram) throw new Error('two models rendered to one hash')
  if (first.hashes.modelHash === second.hashes.modelHash) throw new Error('two models hashed alike')
})

if (failures > 0) {
  console.log('uml-hash tests failed:', failures)
  process.exit(1)
}
console.log('all uml-hash tests passed')