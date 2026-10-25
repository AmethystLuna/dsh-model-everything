// Render one real report to a standalone SVG, using the same pure modules the card would use.
//
// This is the renderer's whole pipeline minus React and minus the browser: a settled tool call goes in,
// an SVG file comes out. If this looks right, the only missing piece for the card is the client half
// showing it inline.
import { writeFileSync } from 'node:fs'
import { modelVerifyTool } from '../lib/tool.js'
import { renderReportText } from '../lib/report-view.js'
import { paintWith } from '../lib/render/paint.js'
import { toSvg } from '../lib/render/svg.js'
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

// Exactly what the host hands a settled tool view: a lazy arguments view plus content blocks.
const block = {
  kind: 'tool-result',
  name: 'model_verify',
  args: { value: (key) => (key === 'model' ? model : undefined) },
  content: [{ type: 'text', text: renderReportText(report) }],
  isError: false,
}

const diagram = viewModel({ phase: 'result', toolName: 'model_verify', block })
const { canvas, colours } = paintWith(diagram)
const { markup, dropped } = toSvg(canvas, colours, diagram.title + ': ' + diagram.caption)

writeFileSync('F:/workspace/.dshstore-fix/dme-eval/state-machine.svg', markup, 'utf8')
writeFileSync(
  'F:/workspace/.dshstore-fix/dme-eval/state-machine.html',
  '<!doctype html><meta charset="utf-8"><title>model_verify drawing</title><body style="font:14px system-ui;padding:24px;background:#fff">' +
    markup +
    '<p style="color:#555;max-width:640px">' + diagram.caption.replaceAll('&', '&amp;').replaceAll('<', '&lt;') + '</p>' +
    '</body>',
  'utf8',
)

console.log('kind:', diagram.kind)
console.log('nodes:', diagram.nodes.length, 'edges:', diagram.edges.length)
console.log('caption:', diagram.caption)
console.log('shapes dropped:', dropped)
console.log('svg bytes:', markup.length)
