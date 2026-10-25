// Dump the painted shapes for one real report, so a rasterizer can draw them without a browser.
// Same pipeline as the card: report -> viewModel -> layout/paint. The SVG writer is skipped on purpose;
// this is evidence that the drawing is in the model, not in the markup.
import { writeFileSync } from 'node:fs'
import { modelVerifyTool } from '../lib/tool.js'
import { renderReportText } from '../lib/report-view.js'
import { paintWith } from '../lib/render/paint.js'
import { viewModel } from '../lib/render/viewmodel.js'

const model = {
  schemaVersion: 1,
  init: 'idle',
  states: [{ id: 'idle' }, { id: 'loading' }, { id: 'done' }, { id: 'error' }],
  transitions: [
    { from: 'idle', event: 'load', to: 'loading' },
    { from: 'loading', event: 'ok', to: 'done' },
    { from: 'loading', event: 'fail', to: 'error' },
    { from: 'error', event: 'retry', to: 'loading' },
  ],
}

const report = await modelVerifyTool.execute({ model })
const block = {
  kind: 'tool-result',
  name: 'model_verify',
  args: { value: (key) => (key === 'model' ? model : undefined) },
  content: [{ type: 'text', text: renderReportText(report) }],
}
const diagram = viewModel({ phase: 'result', toolName: 'model_verify', block })
const { canvas, colours } = paintWith(diagram)

writeFileSync(
  'F:/workspace/.dshstore-fix/dme-eval/shapes.json',
  JSON.stringify({ canvas, colours, caption: diagram.caption }, null, 1),
  'utf8',
)
console.log('canvas', canvas.width, 'x', canvas.height, '| shapes', canvas.shapes.length)
