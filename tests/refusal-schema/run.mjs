// Every refusal a tool returns carries the family's schema, so a consumer keying on it is told the truth.
//
// Measured before this suite existed: a shape refusal came back with no `schema`, and the rendered body printed a fallback
// id - `model-everything/report` - that is in no registry. A reader who keyed on `schema` was told the report was of a kind
// that does not exist, and the `_UNDECIDED`-style advice applies: read `schema` before trusting what the body says it is.
const { modelVerifyTool } = await import('../../lib/tool.js')
const { modelComposeTool } = await import('../../lib/compose-tool.js')
const { modelAutomatonTool } = await import('../../lib/automaton-tool.js')
const { modelDataModelVerifyTool } = await import('../../lib/data-tool.js')
const { REPORT_SCHEMAS } = await import('../../lib/engine.js')
const { renderReportText } = await import('../../lib/report-view.js')

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

const registered = new Set(Object.values(REPORT_SCHEMAS))

await test('a shape refusal names the family schema, and the id is registered', async () => {
  // Each input is one the host's own argument validator accepts and the tool cannot read: a value of the wrong shape, not a
  // value of the wrong type (that is refused before `execute` runs).
  const model = { schemaVersion: 1, init: 'a', states: [{ id: 'a' }] }
  const cases = [
    [modelVerifyTool, { model, beforeModel: model, stateMapping: 'x' }, REPORT_SCHEMAS.verify],
    [modelComposeTool, { machines: 'nope' }, REPORT_SCHEMAS.compose],
    [modelAutomatonTool, { automaton: 7 }, REPORT_SCHEMAS.automaton],
    [modelDataModelVerifyTool, { model: { schemaVersion: 1, entities: [] }, copyPairs: 'x' }, REPORT_SCHEMAS.datamodel],
  ]
  for (const [tool, args, expected] of cases) {
    const result = await tool.execute(args)
    if (result.ran !== false) throw new Error(tool.name + ' ran on bad input')
    if (result.schema !== expected) throw new Error(tool.name + ' answered ' + String(result.schema) + ', not ' + expected)
    if (!registered.has(result.schema)) throw new Error(tool.name + ' named an unregistered schema')
  }
})

await test('the rendered refusal body carries that schema as its first token', async () => {
  const refusal = await modelComposeTool.execute({ machines: 'nope' })
  const first = renderReportText(refusal).split('\n')[0]
  if (!first.startsWith(REPORT_SCHEMAS.compose)) throw new Error('the body starts ' + JSON.stringify(first.slice(0, 40)))
})

await test('a payload with no schema says so instead of naming a family', async () => {
  // The control: the old fallback named a report family that does not exist.
  const body = renderReportText({ ok: true, ran: true, verdict: 'pass' })
  const first = body.split('\n')[0]
  if (first.startsWith('model-everything/')) throw new Error('a schema-less payload was given a family id: ' + first.slice(0, 40))
})

if (failures > 0) {
  console.log('refusal-schema tests failed:', failures)
  process.exit(1)
}
console.log('all refusal-schema tests passed')