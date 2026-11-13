// Two tools that look alike from outside and decide different questions.
//
// `uml_structure_verify` reads a drawing's dependency graph and reports its shape against a matrix (UML02x, MATRIX_*). `model_design_review`
// holds a design to the contracts it declares about itself (DES*). The same cycle and the same layer violation, given to both, must produce two
// different code families - each tool reporting only its own side is the whole reason there are two.
const structureTool = (await import('../../lib/structure-tool.js')).umlStructureTool
const designTool = (await import('../../lib/design-tool.js')).designTool

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

const DRAWING = ['component ui', 'component service', 'component db', 'ui --> service', 'service --> db', 'db --> ui'].join('\n')

const MATRIX = {
  rules: [{ id: 'no-up', source: 'db', deny: ['service', 'ui'] }],
  layers: [{ name: 'top', members: ['ui'] }, { name: 'bottom', members: ['db'] }],
  default: 'allow',
}

const DESIGN = {
  schemaVersion: 1,
  architecture: { nodes: ['ui', 'service', 'db'], edges: [['ui', 'service'], ['service', 'db'], ['db', 'ui']] },
  types: [
    { name: 'ui', stereotype: 'component', layer: 'top' },
    { name: 'service', stereotype: 'component', layer: 'middle' },
    { name: 'db', stereotype: 'component', layer: 'bottom' },
  ],
  declare: { layers: [{ name: 'top', members: ['ui'] }, { name: 'middle', members: ['service'] }, { name: 'bottom', members: ['db'] }] },
}

/** Every finding a report carries, wherever the family keeps them. */
const codesOf = (report) => [...new Set([...(report.findings ?? []), ...(report.checks ?? []).flatMap((check) => check.findings ?? [])].map((finding) => String(finding.code)))]

await test('the drawing tool reports the graph codes and none of the design codes', async () => {
  const report = await structureTool.execute({ diagram: DRAWING, matrix: MATRIX })
  const codes = codesOf(report)
  if (!codes.some((code) => code.startsWith('UML0'))) throw new Error('no UML0xx code: ' + codes.join(','))
  if (codes.some((code) => code.startsWith('DES'))) throw new Error('a design code leaked into the drawing tool: ' + codes.join(','))
  if (!codes.includes('UML022_CYCLE')) throw new Error('the cycle was not reported: ' + codes.join(','))
})

await test('the design tool reports the design codes and none of the graph codes', async () => {
  const report = await designTool.execute({ model: DESIGN })
  const codes = codesOf(report)
  if (!codes.some((code) => code.startsWith('DES'))) throw new Error('no DES code: ' + codes.join(','))
  if (codes.some((code) => code.startsWith('UML0') || code.startsWith('MATRIX_'))) {
    throw new Error('a graph code leaked into the design tool: ' + codes.join(','))
  }
  if (!codes.includes('DES1_CYCLE')) throw new Error('the cycle was not reported: ' + codes.join(','))
})

await test('the same shape is a cycle to both, and each calls it by its own name', async () => {
  const drawing = codesOf(await structureTool.execute({ diagram: DRAWING, matrix: MATRIX }))
  const design = codesOf(await designTool.execute({ model: DESIGN }))
  if (!drawing.includes('UML022_CYCLE')) throw new Error('drawing: ' + drawing.join(','))
  if (!design.includes('DES1_CYCLE')) throw new Error('design: ' + design.join(','))
})

await test('a design that declares nothing has skips, not passes, for the checks that need a declaration', async () => {
  // The doctrine: a check with nothing to hold the design to is `skip`. Both tools follow it, which is what makes their reports comparable.
  const report = await designTool.execute({ model: { schemaVersion: 1, architecture: { nodes: ['a', 'b'], edges: [['a', 'b']] } } })
  const checks = report.checks ?? []
  for (const id of ['DES2', 'DES3', 'DES5', 'DES6', 'DES7', 'DES8', 'DES9', 'DES10', 'DES11']) {
    const check = checks.find((entry) => entry.id === id)
    if (check === undefined) throw new Error(id + ' is not on the roster')
    if (check.status !== 'skip') throw new Error(id + ' reports ' + String(check.status) + ' with nothing declared')
    if (!String(check.detail).startsWith('skipped:')) throw new Error(id + ': ' + String(check.detail))
  }
})

if (failures > 0) {
  console.log('des-vs-uml tests failed:', failures)
  process.exit(1)
}
console.log('all des-vs-uml tests passed')