// Writing a drawing to disk: where it lands, what it contains, and what a failed write answers.
//
// The tool's own comment says one shape for every answer. A write that throws breaks that: the caller gets an exception instead of the SVG, and the
// description never mentioned the possibility. So a failed write is checked to be a refusal like any other, with the drawing still returned.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const renderTool = (await import('../../lib/diagram-render-tool.js')).diagramRenderTool

const scratch = mkdtempSync(join(tmpdir(), 'dme-out-'))
process.on('exit', () => rmSync(scratch, { recursive: true, force: true }))

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

await test('a drawing asked for on disk is there, and is the markup that was returned', async () => {
  const target = join(scratch, 'one.svg')
  const report = await renderTool.execute({ source: SOURCE, out: target })
  if (!existsSync(target)) throw new Error('no file was written')
  if (readFileSync(target, 'utf8') !== report.svg) throw new Error('the file differs from the returned markup')
  if (report.path !== target) throw new Error('the report names ' + String(report.path))
  if (report.bytes !== report.svg.length) throw new Error('bytes ' + String(report.bytes) + ' against ' + String(report.svg.length))
})

await test('a second call replaces the file rather than appending to it', async () => {
  const target = join(scratch, 'twice.svg')
  await renderTool.execute({ source: SOURCE, out: target })
  const first = readFileSync(target, 'utf8').length
  const bigger = 'graph TD\n  a[A] --> b[B]\n  b --> c[C]'
  await renderTool.execute({ source: bigger, out: target })
  const second = readFileSync(target, 'utf8').length
  if (second <= first) throw new Error('the file did not grow: ' + String(first) + ' -> ' + String(second))
  if (!readFileSync(target, 'utf8').trimEnd().endsWith('</svg>')) throw new Error('the file does not end with the closing tag of one document')
})

await test('a path that cannot be written is a refusal, and the drawing still comes back', async () => {
  const target = join(scratch, 'no-such-directory', 'deep', 'x.svg')
  const report = await renderTool.execute({ source: SOURCE, out: target })
  if (report.ok !== false) throw new Error('the call reports ok')
  if (!(report.refused ?? []).some((line) => String(line).includes('could not write'))) {
    throw new Error('refused: ' + JSON.stringify(report.refused).slice(0, 120))
  }
  if (String(report.svg).length === 0) throw new Error('the drawing was lost with the write')
  if (report.path !== undefined) throw new Error('the report names a path it did not write')
})

await test('a source with nothing in it writes nothing', async () => {
  const target = join(scratch, 'empty.svg')
  const report = await renderTool.execute({ source: '   ', out: target })
  if (report.ok !== false) throw new Error('an empty source reports ok')
  if (existsSync(target)) throw new Error('a file was written for an empty source')
})

if (failures > 0) {
  console.log('diagram-out tests failed:', failures)
  process.exit(1)
}
console.log('all diagram-out tests passed')