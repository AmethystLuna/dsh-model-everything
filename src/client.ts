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
import { palette, schemeNames, type Palette, type PaletteMode, type PaletteScheme } from './render/palette.js'
import { render } from './render/index.js'
import { toSvg } from './render/svg.js'
import { viewModel } from './render/viewmodel.js'
import { annotationMessage, fillComposer, pageCensus, pushNote, sessionFromLocation, submitComposer, type DocumentLike } from './annotation.js'

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
/**
 * The client context, kept from `apply`: a view has no other way to reach a client service.
 *
 * It is one module-level handle because there is one page. A null until `apply` runs, and every reader
 * checks it, so a view that renders before the plugin mounts simply takes the composer path.
 */
let services: SlotContext | undefined

export interface ToolCallProps {
  phase?: string
  toolName?: string
  block?: { args?: unknown; result?: unknown }
}

/** Tool names this package answers. A key that never dispatches simply never renders. */
/**
 * The drawing tool's wire name. A literal, not an import: the client bundle must not pull in the tool
 * surface, which imports the host's tool SDK.
 */
const DRAWING_TOOL = 'diagram_render'

/** Tool names this package answers. A key that never dispatches simply never renders. */
export const TOOL_NAMES: string[] = ['model_verify', DRAWING_TOOL]

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
 * One argument out of the host's lazy arguments view.
 *
 * A settled call exposes `value(key)`; a plain object (a test, or a replayed call) is read directly. The
 * view answers `undefined` until the field closes, which is exactly when a drawing should be attempted.
 */
function argOf(args: unknown, key: string): unknown {
  if (args === null || typeof args !== 'object') return undefined
  const view = args as { value?: (name: string) => unknown }
  if (typeof view.value === 'function') return view.value(key)
  return (args as Record<string, unknown>)[key]
}

/**
 * The card for a drawing: the source the call carried, drawn by the renderer that wrote the file.
 *
 * Drawing it here rather than replaying the SVG means the card and the file are one picture from one
 * engine, and it costs the result nothing. Lines the renderer refused are listed under the drawing: a
 * card that hid them would show a picture that is missing something, which is the failure the tool
 * exists to prevent.
 */
/** A create-element function with this package's calling convention, so a shared builder fits both seats. */
type H = (type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]) => unknown

/** What an annotation editor shows, shared by the two surfaces that offer one. */
export interface AnnotationState {
  picked: { id: string } | null
  note: string
  status: string
}


/**
 * The note editor: one component for both seats, because the reader's question is the same at either.
 *
 * It sits beside the drawing rather than in a modal, so the node it is about stays visible while writing;
 * Return is a newline because notes are sentences, and Ctrl/Cmd+Enter is the shortcut for the button.
 */
export function annotationPanel(h: H, state: AnnotationState, actions: { onNote: (value: string) => void; onPlace: () => void; onSend: () => void; onClear: () => void; hint?: string }): unknown {
  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: '4px', border: '1px solid rgba(127,127,127,0.35)', borderRadius: '6px', padding: '6px' } },
    h('div', { style: { fontSize: '12px', opacity: 0.8 } }, state.picked === null ? (actions.hint ?? '点一个节点，再写批注（也可以留空，只做标记）') : '节点 ' + state.picked.id),
    state.picked === null
      ? null
      : h('textarea', {
          value: state.note,
          rows: 3,
          placeholder: '批注…（Ctrl+Enter 直接发送）',
          style: { width: '100%', font: '12px system-ui, sans-serif', padding: '6px', resize: 'vertical' },
          onInput: (event: { target?: { value?: unknown } }) => actions.onNote(String(event?.target?.value ?? '')),
          onKeyDown: (event: { key?: string; ctrlKey?: boolean; metaKey?: boolean; preventDefault?: () => void }) => {
            if (event?.key === 'Enter' && (event?.ctrlKey === true || event?.metaKey === true)) { event.preventDefault?.(); actions.onSend() }
          },
        }),
    h(
      'div',
      { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } },
      h('button', { type: 'button', disabled: state.picked === null, onClick: () => actions.onPlace() }, '放入输入框'),
      h('button', { type: 'button', disabled: state.picked === null, onClick: () => actions.onSend() }, '发送'),
      h('button', { type: 'button', onClick: () => actions.onClear() }, '清空'),
      state.status === '' ? null : h('span', { style: { fontSize: '11px', opacity: 0.75 } }, state.status),
    ),
  )
}

/**
 * The card for a drawing: the source the call carried, drawn by the renderer that wrote the file.
 *
 * Drawing it here rather than replaying the SVG means the card and the file are one picture from one
 * engine, and it costs the result nothing. Lines the renderer refused are listed under the drawing: a
 * card that hid them would show a picture that is missing something, which is the failure the tool
 * exists to prevent.
 *
 * With hooks the card also annotates: the picture is the subject, so the editor stays behind one button
 * until the reader asks for it, and a click then marks a node instead of doing nothing.
 */
function drawingCard(React: ReactLike, props: ToolCallProps, overrides: Partial<Palette>): unknown {
  const block = (props.block ?? {}) as { args?: unknown }
  const source = argOf(block.args, 'source')
  const asked = argOf(block.args, 'scheme')
  const scheme = schemeNames().includes(asked as PaletteScheme) ? (asked as PaletteScheme) : 'default'
  // The arguments are the lazy view while the call runs; by the time it settles the host may hand back only
  // the result. Both carry the drawing, so the card reads whichever one is there.
  const payload = (props.block as { result?: unknown } | undefined)?.result
  const returned = payload !== null && typeof payload === 'object' ? (payload as { svg?: unknown }).svg : undefined
  const markup = typeof returned === 'string' && returned !== '' ? returned : null
  const useState = React.useState
  if (useState === undefined) return cardSurface(React, source, markup, scheme, overrides, null, null, null)
  const [annotate, setAnnotate] = useState(false)
  const [picked, setPicked] = useState<{ id: string } | null>(null)
  const [note, setNote] = useState('')
  const [status, setStatus] = useState('')
  const document = (globalThis as { document?: DocumentLike }).document
  const caption = typeof source === 'string' ? (source.split(String.fromCharCode(10)).map((line) => line.trim()).find((line) => line !== '') ?? '') : ''
  const onPick = (event: { target?: { closest?: (selector: string) => { getAttribute?: (name: string) => string | null } | null } }): void => {
    if (!annotate) return
    const id = event?.target?.closest?.('[data-node-id]')?.getAttribute?.('data-node-id')
    if (typeof id === 'string' && id !== '') { setPicked({ id }); setStatus('') }
  }
  const toggle = React.createElement(
    'div',
    { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
    React.createElement('button', { type: 'button', title: 'Point at a node and send a note about it', onClick: () => { setAnnotate(!annotate); setStatus(''); if (annotate) { setPicked(null); setNote('') } } }, annotate ? '批注: 开' : '批注'),
    annotate && picked === null ? React.createElement('span', { style: { fontSize: '11px', opacity: 0.7 } }, '点一个节点') : null,
  )
  const panel = annotate
    ? annotationPanel(
        (type, options, ...children) => React.createElement(type, options, ...children),
        { picked, note, status },
        { onNote: setNote, onPlace: () => setStatus(pushNote(document, picked, note, caption, false)), onSend: () => { if (picked === null) return; setStatus('正在发送…'); void probePush(annotationMessage({ nodeId: picked.id, note, caption })).then((outcome) => setStatus(outcome === 'ok' ? '已发送（会话命令）' : pushNote(document, picked, note, caption, true) + ' · 命令通道：' + outcome + ' · 页面：' + pageCensus(document))) }, onClear: () => { setPicked(null); setNote(''); setStatus('') } },
      )
    : null
  return cardSurface(React, source, markup, scheme, overrides, onPick, toggle, panel)
}

/** The drawing itself, plus whatever the reader is doing to it. One surface, drawn once. */
function cardSurface(React: ReactLike, source: unknown, returned: string | null, scheme: PaletteScheme, overrides: Partial<Palette>, onClick: ((event: never) => void) | null, toggle: unknown, panel: unknown): unknown {
  if (returned === null && (typeof source !== 'string' || source.trim() === '')) {
    return React.createElement('div', { style: { fontSize: '12px', opacity: 0.7 } }, 'the drawing appears when the call settles')
  }
  // A settled result already carries the drawing the file got; a running call has only its source. Either way
  // it is the same picture from the same renderer.
  const drawn = returned === null
    ? render({ source: String(source), folded: [] }, overrides, { mode: themeMode(), scheme })
    : { markup: returned, refused: [] as string[], colours: palette(overrides, { mode: themeMode(), scheme }) }
  // The pane decides the width: a drawing wider than the card scrolls nowhere, so it scales instead.
  const scaled = drawn.markup.replace('<svg ', '<svg style="width: 100%; height: auto; display: block" ')
  const refused =
    drawn.refused.length === 0
      ? null
      : React.createElement('pre', { style: { fontSize: '11px', color: '#b7791f', whiteSpace: 'pre-wrap', margin: '6px 0' } }, drawn.refused.join(String.fromCharCode(10)))
  const drawing = onClick === null
    ? React.createElement('div', { dangerouslySetInnerHTML: { __html: scaled } })
    : React.createElement('div', { onClick: onClick as never, style: { cursor: 'crosshair' }, dangerouslySetInnerHTML: { __html: scaled } })
  const children = [toggle, drawing, refused, panel].filter((child) => child !== null)
  return React.createElement(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: '4px', background: drawn.colours.background, color: drawn.colours.text, borderRadius: '6px', overflow: 'auto' } },
    ...children,
  )
}

/**
 * The view for one tool name.
 *
 * The drawing is emitted as markup, so React receives it through `dangerouslySetInnerHTML`. That is safe
 * only because the writer escapes every value that came from a report or a model, which the render suite
 * pins with an injection case.
 */
/** Where the page thinks it is, short enough to read in a status line. */
function shortAddress(location: { pathname?: string; search?: string } | undefined): string {
  if (location === undefined) return 'no location'
  return ((location.pathname ?? '') + (location.search ?? '')).slice(0, 80)
}

function reasonOf(error: unknown): string {
  const message = (error as { message?: unknown } | null)?.message
  return String(message ?? error).slice(0, 120)
}

/**
 * Try the session-command channel, and answer either `'ok'` or the reason it stopped.
 *
 * The client half sees no host API directly: its only route is a client service, and the only session it can
 * name is the one in the page's own address. Every step here answers with its reason, and the reader sees
 * that reason - so one click says whether the channel exists at all, and where it broke.
 */
async function probePush(text: string): Promise<string> {
  const location = (globalThis as { location?: { pathname?: string; search?: string; hash?: string } }).location
  const session = sessionFromLocation(location)
  if (session === undefined) return 'no session id in ' + shortAddress(location)
  const sessions = services?.get?.('sessions') as { scope?: (id: string) => unknown } | undefined
  if (sessions === undefined || typeof sessions.scope !== 'function') return 'no sessions service'
  let scope: unknown
  try { scope = sessions.scope(session) } catch (error) { return 'scope threw: ' + reasonOf(error) }
  const remote = (scope as { remote?: { commands?: { execute?: unknown } } } | undefined)?.remote
  if (remote === undefined) return 'the agent scope has no remote'
  const commands = remote.commands
  if (commands === undefined || typeof commands.execute !== 'function') return 'remote.commands.execute is missing'
  const Controller = (globalThis as { AbortController?: new () => { signal: unknown } }).AbortController
  try {
    await (commands.execute as (agent: unknown, line: string, attachments: unknown[], signal: unknown) => Promise<unknown>).call(commands, { id: session }, '/annotate ' + text, [], Controller === undefined ? undefined : new Controller().signal)
    return 'ok'
  } catch (error) {
    return 'execute threw: ' + reasonOf(error)
  }
}

export function viewFor(React: ReactLike, overrides: Partial<Palette> = {}): (props: ToolCallProps) => unknown {
  return (props: ToolCallProps): unknown => {
    // A drawing is not a report: its card is the source, drawn by the renderer that wrote the file.
    if (props.toolName === DRAWING_TOOL) return drawingCard(React, props, overrides)
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
    const [fit, setFit] = useState(true)
    const [folded, setFolded] = useState<string[]>([])
    const [annotate, setAnnotate] = useState(false)
    const [picked, setPicked] = useState<{ id: string } | null>(null)
    const [note, setNote] = useState('')
    const [status, setStatus] = useState('')
    const drawn = drawSample(React, overrides, source, fit ? 0 : zoom, scheme, folded)
    // Where the note goes: the host's composer, marked with `data-focus-flow`. The board's own box above is not
    // the composer, which is what keeps an annotation from being typed into the diagram it describes.
    const document = (globalThis as { document?: DocumentLike }).document
    const caption = source.split('\n').map((line) => line.trim()).find((line) => line !== '') ?? ''
    const place = (): void => setStatus(pushNote(document, picked, note, caption, false))
    const send = (): void => {
      if (picked === null) return
      setStatus('正在发送…')
      void probePush(annotationMessage({ nodeId: picked.id, note, caption })).then((outcome) => {
        if (outcome === 'ok') { setStatus('已发送（会话命令）'); return }
        // The probe's reason travels with the fallback: it is the only way a reader can tell us why the
        // command channel is closed on this host.
        setStatus(pushNote(document, picked, note, caption, true) + ' · 命令通道：' + outcome + ' · 页面：' + pageCensus(document))
      })
    }
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
      h('button', { type: 'button', onClick: () => { setFit(false); setZoom(Math.max(0.5, Math.round((Number(zoom) - 0.25) * 100) / 100)) } }, '−'),
      h('span', { style: { fontSize: '12px', opacity: 0.7 } }, fit ? 'fit' : String(Math.round(Number(zoom) * 100)) + '%'),
      h('button', { type: 'button', onClick: () => { setFit(false); setZoom(Math.min(3, Math.round((Number(zoom) + 0.25) * 100) / 100)) } }, '+'),
      h('button', { type: 'button', title: 'Point at a node and send a note about it', onClick: () => { setAnnotate(!annotate); setStatus(''); if (annotate) { setPicked(null); setNote('') } } }, annotate ? '批注: 开' : '批注'),
      h('button', { type: 'button', onClick: () => { setFit(false); setZoom(1) } }, 'reset'),
      h('button', { type: 'button', title: 'Scale to the pane width', onClick: () => setFit(!fit) }, fit ? 'fit: on' : 'fit: off'),
      folded.length === 0
        ? null
        : h('button', { type: 'button', title: 'Unfold every group', onClick: () => setFolded([]) }, 'unfold ' + String(folded.length)),
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
    return h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '4px', height: '100%', boxSizing: 'border-box', padding: '8px' } },
      textarea,
      controls,
      // The note editor sits above the drawing rather than in a modal: the reader keeps seeing the node it is
      // about while writing, and a zoom or a source edit does not dismiss what they typed.
      annotate
        ? annotationPanel(h, { picked, note, status }, {
            onNote: setNote,
            onPlace: place,
            onSend: send,
            onClear: () => { setPicked(null); setNote(''); setStatus('') },
          })
        : null,
      // The drawing takes the rest of the pane and scrolls inside it, so an expanded tab uses its room.
      h(
        'div',
        {
          style: { flex: '1 1 auto', minHeight: '0', overflow: 'auto' },
          // A boundary carries its id in the markup, so one listener on the container is enough: no per-rect
          // handler, and the handling survives a re-render that replaced the whole SVG.
          onClick: (event: { target?: { closest?: (selector: string) => { getAttribute?: (name: string) => string | null } | null } }) => {
            // In annotation mode a click marks a node instead of folding a boundary: one gesture, one meaning,
            // chosen by the mode the reader just switched on.
            if (annotate) {
              const marked = event?.target?.closest?.('[data-node-id]')?.getAttribute?.('data-node-id')
              if (typeof marked === 'string' && marked !== '') { setPicked({ id: marked }); setStatus(''); return }
            }
            const hit = event?.target?.closest?.('[data-group-id]')
            const id = hit?.getAttribute?.('data-group-id')
            if (typeof id !== 'string' || id === '') return
            setFolded(folded.includes(id) ? folded.filter((entry) => entry !== id) : [...folded, id])
          },
        },
        drawn,
      ),
    )
  }
}

function drawSample(React: ReactLike, overrides: Partial<Palette>, source: string, zoom: number, scheme: PaletteScheme, folded: string[] = []): unknown {
  return whiteboardBody(React, overrides, source, zoom, scheme, folded)
}

/** Render one source at one zoom, or say why it could not be drawn. */
function whiteboardBody(React: ReactLike, overrides: Partial<Palette>, source: string, zoom: number, scheme: PaletteScheme = 'default', folded: string[] = []): unknown {
  if (String(source).trim() === '') {
    return React.createElement('p', { style: { fontSize: '12px', opacity: 0.7 } }, 'Paste Mermaid or PlantUML above.')
  }
  const drawn = render({ source: String(source), folded }, overrides, { mode: themeMode(), scheme })
  // Zoom 0 is "fill the pane": the SVG scales to the width it is given, which is what an expanded tab wants.
  const zoomed =
    zoom === 0
      ? drawn.markup.replace('<svg ', '<svg style="width: 100%; height: auto; display: block" ')
      : drawn.markup.replace('<svg ', '<svg style="zoom: ' + String(zoom) + '; display: block" ')
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
      services = ctx
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
