/**
 * The Client half: a lazy factory the page binds to this package's name.
 *
 * Everything that decides anything lives in `render/`; this file only turns shapes into React elements and
 * registers them where the page offers a seat. Two seats are used, and they fail independently:
 *
 * - `tool.call.toolview` replaces the card of a tool whose result this package can draw;
 * - `sidebar.right.pane.tab` is the whiteboard: a tab that renders whatever the reader pastes, with no tool
 *   and no host data at all, so it keeps working when the card seat does not.
 *
 * This module is not a page script: it exports the factory, and `scripts/build-client.mjs` wraps the
 * compiled output in `window.__ModuleLoader__.load(...)`, which is the loader contract itself.
 */

import { paintWith } from './render/paint.js'
import type { Palette } from './render/palette.js'
import { render } from './render/index.js'
import { toSvg } from './render/svg.js'
import { viewModel } from './render/viewmodel.js'

export interface ReactLike {
  createElement: (type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]) => unknown
  useState?: <T>(initial: T) => [T, (next: T) => void]
}

export interface SlotContext {
  slots: {
    inject: (slot: string, callback: () => unknown) => unknown
    register: (options: Record<string, unknown>, component: unknown) => unknown
  }
  get?: (service: string) => unknown
}

export interface PluginShape {
  inject: string[]
  apply: (ctx: SlotContext) => void
}

/** A settled tool call, as the host hands it to a view. */
export interface ToolCallProps {
  phase?: string
  toolName?: string
  block?: { args?: unknown; result?: unknown }
}

/** Tool names this package answers. A key that never dispatches simply never renders. */
export const TOOL_NAMES: string[] = ['model_verify']

/** The whiteboard's seat key, in both the tab registry and the body slot. */
export const WHITEBOARD_ID = 'model-everything-diagram'

/** What the whiteboard opens with: a diagram the reader can edit rather than an empty box. */
export const WHITEBOARD_SAMPLE = ['graph TD', '  a[Idea] --> b{Feasible?}', '  b -->|yes| c[Build]', '  b -->|no| d[Revise]', '  d --> a'].join('\n')

/**
 * The view for one tool name.
 *
 * The drawing is emitted as markup, so React receives it through `dangerouslySetInnerHTML`. That is safe
 * only because the writer escapes every value that came from a report or a model, which the render suite
 * pins with an injection case.
 */
export function viewFor(React: ReactLike, overrides: Partial<Palette> = {}): (props: ToolCallProps) => unknown {
  return (props: ToolCallProps): unknown => {
    // The whole block goes to the view model: the host shapes it differently per phase (a lazy arguments
    // view while running, content blocks once settled), and only that module knows how to read it.
    const diagram = viewModel({ phase: props.phase, toolName: props.toolName, block: props.block })
    const { canvas, colours } = paintWith(diagram, overrides)
    const written = toSvg(canvas, colours, diagram.kind === 'none' ? diagram.caption : diagram.title + ': ' + diagram.caption)
    return React.createElement('div', {
      style: { padding: '4px 0', overflowX: 'auto' },
      dangerouslySetInnerHTML: { __html: written.markup },
    })
  }
}

/**
 * The whiteboard: paste a diagram, get a drawing, zoom it.
 *
 * It holds no host data, which is the point: it is a place to think about a diagram while writing one, and
 * it cannot be broken by a change to any tool's result shape. The source it draws is whatever is in its own
 * box.
 */
export function whiteboardFor(React: ReactLike, overrides: Partial<Palette> = {}): () => unknown {
  const h = (type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]): unknown => React.createElement(type, props, ...children)
  return function Whiteboard(): unknown {
    const useState = React.useState as (<T>(initial: T) => [T, (next: T) => void]) | undefined
    if (useState === undefined) {
      // A host without hooks: the same board, read-only. It still draws, which is the part that matters.
      return h(
        'div',
        { style: { padding: '8px' } },
        h('textarea', {
          value: WHITEBOARD_SAMPLE,
          readOnly: true,
          spellcheck: false,
          rows: WHITEBOARD_SAMPLE.split('\n').length,
          style: { width: '100%', font: '12px ui-monospace, SFMono-Regular, Menlo, monospace' },
        }),
        whiteboardBody(React, overrides, WHITEBOARD_SAMPLE, 1),
      )
    }
    const [source, setSource] = useState(WHITEBOARD_SAMPLE)
    const [zoom, setZoom] = useState(1)
    const drawn = drawSample(React, overrides, source, zoom)
    const textarea = h('textarea', {
      value: source,
      spellcheck: false,
      rows: Math.min(12, Math.max(4, String(source).split('\n').length)),
      style: { width: '100%', font: '12px ui-monospace, SFMono-Regular, Menlo, monospace', padding: '6px', resize: 'vertical' },
      onInput: (event: { target?: { value?: unknown } }) => setSource(String(event?.target?.value ?? '')),
    })
    const controls = h(
      'div',
      { style: { display: 'flex', gap: '6px', alignItems: 'center', padding: '4px 0' } },
      h('button', { type: 'button', onClick: () => setZoom(Math.max(0.5, Math.round((Number(zoom) - 0.25) * 100) / 100)) }, '−'),
      h('span', { style: { fontSize: '12px', color: '#6b7280' } }, String(Math.round(Number(zoom) * 100)) + '%'),
      h('button', { type: 'button', onClick: () => setZoom(Math.min(3, Math.round((Number(zoom) + 0.25) * 100) / 100)) }, '+'),
      h('button', { type: 'button', onClick: () => setZoom(1) }, 'reset'),
    )
    return h('div', { style: { padding: '8px', overflow: 'auto' } }, textarea, controls, drawn)
  }
}

function drawSample(React: ReactLike, overrides: Partial<Palette>, source: string, zoom: number): unknown {
  return whiteboardBody(React, overrides, source, zoom)
}

/** Render one source at one zoom, or say why it could not be drawn. */
function whiteboardBody(React: ReactLike, overrides: Partial<Palette>, source: string, zoom: number): unknown {
  if (String(source).trim() === '') {
    return React.createElement('p', { style: { fontSize: '12px', color: '#6b7280' } }, 'Paste Mermaid or PlantUML above.')
  }
  const drawn = render({ source: String(source) }, overrides)
  const zoomed = drawn.markup.replace('<svg ', '<svg style="zoom: ' + String(zoom) + '" ')
  const refused = drawn.refused.length === 0 ? null : React.createElement('pre', {
    style: { fontSize: '11px', color: '#b7791f', whiteSpace: 'pre-wrap', margin: '6px 0' },
  }, drawn.refused.join('\n'))
  return React.createElement(
    'div',
    null,
    React.createElement('div', { dangerouslySetInnerHTML: { __html: zoomed } }),
    refused,
  )
}

export default function factory(require: (name: string) => unknown): PluginShape {
  // Captured under a plain name: a static `require('react')` would be rewritten by the bundler and then
  // resolve against a scope the factory body does not have. A call through this alias stays a call.
  const hostRequire = require
  const React = hostRequire('react') as ReactLike
  return {
    inject: ['slots'],
    apply(ctx: SlotContext) {
      for (const name of TOOL_NAMES) {
        // Only the options a keyed slot declares: `key`. An extra `id` is not part of this slot's
        // registration schema, and the working community reference (dsh-deepread) passes exactly this much.
        ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: name }, viewFor(React)))
      }
      // The whiteboard seat only exists on a host with the official right sidebar. Presence of the slot is
      // the capability check: if the callback never runs, this host has no sidebar and nothing is lost.
      ctx.slots.inject('sidebar.right.pane.tab', () => {
        const tabs = typeof ctx.get === 'function' ? (ctx.get('sidebarRightTabs') as { register?: (options: Record<string, unknown>) => unknown } | undefined) : undefined
        if (tabs === undefined || typeof tabs.register !== 'function') return
        tabs.register({
          id: WHITEBOARD_ID,
          kind: 'panel',
          keepMounted: true,
          title: () => 'Diagram',
          guide: [
            {
              id: 'diagram-whiteboard',
              order: 120,
              title: () => 'Diagram',
              description: () => 'Paste Mermaid or PlantUML and read the drawing',
            },
          ],
        })
        return ctx.slots.register({ name: 'sidebar.right.pane.tab', key: WHITEBOARD_ID }, whiteboardFor(React))
      })
    },
  }
}
