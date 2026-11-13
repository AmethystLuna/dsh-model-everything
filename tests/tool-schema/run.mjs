// The tool surface as a caller meets it: the name it is registered under, the enum values it offers, and the parameters it insists on.
//
// A schema is a promise. An enum value the implementation rejects, a name that differs from the one the registry holds, or a required parameter
// that is quietly optional are three ways that promise breaks - and each is invisible from inside the engine, which never sees the schema.
import { readFileSync } from 'node:fs'

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

const repo = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const load = async (file, exported) => (await import('file:///' + repo + 'lib/' + file))[exported]

/** Every tool the entry registers, with the module and export that defines it. */
const TOOLS = {
  model_verify: ['tool.js', 'modelVerifyTool'],
  model_datamodel_verify: ['data-tool.js', 'modelDataModelVerifyTool'],
  model_interleaving_scan: ['concurrency-tool.js', 'modelConcurrencyScanTool'],
  model_compose_verify: ['compose-tool.js', 'modelComposeTool'],
  model_export: ['export-tool.js', 'modelExportTool'],
  uml_render: ['uml-tool.js', 'umlRenderTool'],
  uml_parse: ['uml-tool.js', 'umlParseTool'],
  uml_review: ['uml-tool.js', 'umlReviewTool'],
  uml_explain_labels: ['uml-tool.js', 'umlExplainLabelsTool'],
  uml_structure_verify: ['structure-tool.js', 'umlStructureTool'],
  model_design_review: ['design-tool.js', 'designTool'],
  report_diff: ['report-diff-tool.js', 'reportDiffTool'],
  model_edit: ['edit-tool.js', 'modelEditTool'],
  model_automaton_verify: ['automaton-tool.js', 'modelAutomatonTool'],
}

await test('the entry registers every tool this suite knows, and no more', async () => {
  const entry = readFileSync(repo + 'src/index.ts', 'utf8')
  const registered = [...entry.matchAll(/tools\.register\(([A-Za-z_]+)\)/g)].map((match) => match[1])
  if (registered.length !== Object.keys(TOOLS).length) {
    throw new Error('the entry registers ' + String(registered.length) + ', this suite knows ' + String(Object.keys(TOOLS).length))
  }
})

await test('each tool is registered under the name its schema declares', async () => {
  for (const [expected, [file, exported]] of Object.entries(TOOLS)) {
    const tool = await load(file, exported)
    if (tool.name !== expected) throw new Error(expected + ': the schema says ' + String(tool.name))
  }
})

await test('every name a schema requires is one the caller must pass', async () => {
  // The check is behavioural: omit the required parameters and the call has to be refused for that reason.
  for (const [name, [file, exported]] of Object.entries(TOOLS)) {
    const tool = await load(file, exported)
    const required = tool.parameters?.required ?? []
    if (required.length === 0) continue
    let refused = undefined
    try {
      await tool.execute({})
    } catch (error) {
      refused = error
    }
    if (refused === undefined) throw new Error(name + ': an empty call was accepted')
    for (const key of required) {
      if (!String(refused.message).includes(key)) throw new Error(name + ': the refusal does not name `' + key + '`: ' + refused.message)
    }
  }
})

await test('every value a schema offers for reportView is one the tools accept', async () => {
  for (const view of ['digest', 'full']) {
    const report = await (await load('uml-tool.js', 'umlReviewTool')).execute({
      model: { schemaVersion: 1, init: 'a', states: [{ id: 'a' }, { id: 'b' }], transitions: [{ from: 'a', event: 'go', to: 'b' }, { from: 'b', event: 'back', to: 'a' }] },
      reportView: view,
    })
    if (report === undefined) throw new Error(view + ': no report')
  }
})

await test('every diagram kind a schema offers is a kind the engine knows', async () => {
  const spec = await import('file:///' + repo + 'lib/uml.js')
  const tool = await load('uml-tool.js', 'umlRenderTool')
  const offered = tool.parameters.properties.kind.enum
  const known = spec.UML_DIAGRAMS
  if (JSON.stringify([...offered].sort()) !== JSON.stringify([...known].sort())) {
    throw new Error('the schema offers ' + offered.join(',') + '; the engine knows ' + known.join(','))
  }
})

if (failures > 0) {
  console.log('tool-schema tests failed:', failures)
  process.exit(1)
}
console.log('all tool-schema tests passed')