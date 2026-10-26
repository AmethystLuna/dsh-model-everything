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
import { schemeNames, type Palette, type PaletteMode, type PaletteScheme } from './render/palette.js'
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
  /** The whiteboard mount, with its scheduler injectable. `apply` calls this with the default. */
  mount: (ctx: SlotContext, options?: MountOptions) => unknown
}

/** A settled tool call, as the host hands it to a view. */
export interface ToolCallProps {
  phase?: string
  toolName?: string
  block?: { args?: unknown; result?: unknown }
}

/** Tool names this package answers. A key that never dispatches simply never renders. */
export const TOOL_NAMES: string[] = ['model_verify']

/**
 * Which surface the page is painting the drawing on.
 *
 * The host publishes its palette as private CSS variables, so naming them here would break on the next theme.
 * The one fact that cannot drift is the rendered background: read it, and fall back to the media query, then
 * to light. Never throws - a view that cannot read the document still draws.
 */
export function themeMode(): PaletteMode {
  try {
    // Reached through a loose view of the globals: this module is also loaded in Node by the bundle suite,
    // where `document` does not exist at all.
    const scope = globalThis as unknown as {
      document?: { body?: unknown }
      getComputedStyle?: (element: unknown) => { backgroundColor?: string }
    }
    const body = scope.document?.body
    const computed = typeof scope.getComputedStyle === 'function' && body !== undefined ? scope.getComputedStyle(body) : undefined
    const colour = computed?.backgroundColor ?? ''
    const rgb = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(colour)
    if (rgb !== null) {
      const [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
      // Rec. 601 luma: good enough to tell a light surface from a dark one, and cheap.
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5 ? 'dark' : 'light'
    }
  } catch {
    // A document that refuses to be read is not a reason to fail a render.
  }
  return 'light'
}

/** The background a drawing sits on, so a card does not paint dark lines on a dark page. */
function surfaceStyle(colours: Palette): Record<string, string> {
  return { background: colours.background, color: colours.text, padding: '4px 0', overflowX: 'auto' }
}


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
    const { canvas, colours } = paintWith(diagram, overrides, { mode: themeMode() })
    const written = toSvg(canvas, colours, diagram.kind === 'none' ? diagram.caption : diagram.title + ': ' + diagram.caption)
    return React.createElement('div', {
      style: surfaceStyle(colours),
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
        // The picker is present but inert: a host without hooks cannot hold the choice, and hiding the
        // option would make the board look like it has none.
        h('select', { disabled: true, style: { margin: '4px 0', fontSize: '12px' } },
          ...schemeNames().map((name) => h('option', { value: name, selected: name === 'default' }, name))),
        whiteboardBody(React, overrides, WHITEBOARD_SAMPLE, 1),
      )
    }
    const [source, setSource] = useState(WHITEBOARD_SAMPLE)
    const [zoom, setZoom] = useState(1)
    const [scheme, setScheme] = useState<PaletteScheme>('default')
    const drawn = drawSample(React, overrides, source, zoom, scheme)
    const textarea = h('textarea', {
      value: source,
      spellcheck: false,
      rows: Math.min(12, Math.max(4, String(source).split('\n').length)),
      style: { width: '100%', font: '12px ui-monospace, SFMono-Regular, Menlo, monospace', padding: '6px', resize: 'vertical' },
      onInput: (event: { target?: { value?: unknown } }) => setSource(String(event?.target?.value ?? '')),
    })
    const controls = h(
      'div',
      { style: { display: 'flex', gap: '6px', alignItems: 'center', padding: '4px 0', flexWrap: 'wrap' } },
      h('button', { type: 'button', onClick: () => setZoom(Math.max(0.5, Math.round((Number(zoom) - 0.25) * 100) / 100)) }, '−'),
      h('span', { style: { fontSize: '12px', opacity: 0.7 } }, String(Math.round(Number(zoom) * 100)) + '%'),
      h('button', { type: 'button', onClick: () => setZoom(Math.min(3, Math.round((Number(zoom) + 0.25) * 100) / 100)) }, '+'),
      h('button', { type: 'button', onClick: () => setZoom(1) }, 'reset'),
      h(
        'select',
        {
          value: scheme,
          title: 'Colour scheme',
          style: { marginLeft: 'auto', fontSize: '12px' },
          onChange: (event: { target?: { value?: unknown } }) => setScheme(String(event?.target?.value ?? 'default') as PaletteScheme),
        },
        ...schemeNames().map((name) => h('option', { value: name, selected: name === scheme }, name)),
      ),
    )
    return h('div', { style: { padding: '8px', overflow: 'auto' } }, textarea, controls, drawn)
  }
}

function drawSample(React: ReactLike, overrides: Partial<Palette>, source: string, zoom: number, scheme: PaletteScheme): unknown {
  return whiteboardBody(React, overrides, source, zoom, scheme)
}

/** Render one source at one zoom, or say why it could not be drawn. */
function whiteboardBody(React: ReactLike, overrides: Partial<Palette>, source: string, zoom: number, scheme: PaletteScheme = 'default'): unknown {
  if (String(source).trim() === '') {
    return React.createElement('p', { style: { fontSize: '12px', opacity: 0.7 } }, 'Paste Mermaid or PlantUML above.')
  }
  const drawn = render({ source: String(source) }, overrides, { mode: themeMode(), scheme })
  const zoomed = drawn.markup.replace('<svg ', '<svg style="zoom: ' + String(zoom) + '" ')
  const refused = drawn.refused.length === 0 ? null : React.createElement('pre', {
    style: { fontSize: '11px', color: '#b7791f', whiteSpace: 'pre-wrap', margin: '6px 0' },
  }, drawn.refused.join('\n'))
  return React.createElement(
    'div',
    { style: { background: drawn.colours.background, color: drawn.colours.text, borderRadius: '6px' } },
    React.createElement('div', { dangerouslySetInnerHTML: { __html: zoomed } }),
    refused,
  )
}


/** How long to wait for the optional services, and how often. A page that never offers them registers nothing. */
const SIDEBAR_POLL_MS = 250
const SIDEBAR_POLL_ATTEMPTS = 40

interface SidebarTabsService {
  register?: (options: Record<string, unknown>) => unknown
}

export interface MountOptions {
  /** Injected so the suite can drive the poll without waiting. Defaults to `setTimeout`. */
  schedule?: (run: () => void, delay: number) => unknown
}

/**
 * Register the whiteboard tab once the sidebar's optional services are ready.
 *
 * The slot can be declared before `sidebarRightTabs` exists - the host composes services and seats in an
 * order this plugin does not control - and a single `ctx.get` there is a race that loses the tab silently.
 * So it polls, like the reference implementation does, and stops after a bounded number of attempts.
 */
export function mountWhiteboard(React: ReactLike, ctx: SlotContext, options: MountOptions = {}): unknown {
  const schedule =
    options.schedule ??
    ((run: () => void, delay: number) => {
      // A host (or a test sandbox) without timers simply gets no retry, rather than an exception.
      const timer = (globalThis as unknown as { setTimeout?: (f: () => void, ms: number) => unknown }).setTimeout
      return typeof timer === 'function' ? timer(run, delay) : undefined
    })
  let attempts = 0

  const attempt = (): unknown => {
    attempts += 1
    const tabs = typeof ctx.get === 'function' ? (ctx.get('sidebarRightTabs') as SidebarTabsService | undefined) : undefined
    if (tabs === undefined || typeof tabs.register !== 'function') {
      if (attempts < SIDEBAR_POLL_ATTEMPTS) schedule(attempt, SIDEBAR_POLL_MS)
      return undefined
    }
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
  }

  return attempt()
}

export default function factory(require: (name: string) => unknown): PluginShape {
  // Captured under a plain name: a static `require('react')` would be rewritten by the bundler and then
  // resolve against a scope the factory body does not have. A call through this alias stays a call.
  const hostRequire = require
  const React = hostRequire('react') as ReactLike
  return {
    inject: ['slots'],
    mount: (ctx: SlotContext, options: MountOptions = {}) => mountWhiteboard(React, ctx, options),
    apply(ctx: SlotContext) {
      for (const name of TOOL_NAMES) {
        // Only the options a keyed slot declares: `key`. An extra `id` is not part of this slot's
        // registration schema, and the working community reference (dsh-deepread) passes exactly this much.
        ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: name }, viewFor(React)))
      }
      // The whiteboard seat only exists on a host with the official right sidebar. Presence of the slot is
      // the capability check: if the callback never runs, this host has no sidebar and nothing is lost.
      ctx.slots.inject('sidebar.right.pane.tab', () => mountWhiteboard(React, ctx))
    },
  }
}
