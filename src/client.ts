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
import { annotationBlock, annotationMessage, composerRect, fillComposer, findComposer, pageCensus, prependBlock, pushBlock, pushNote, sessionFromLocation, submitComposer, withoutEmptyQuestion, type DocumentLike } from './annotation.js'
import { decorateTranscript, startTranscriptDecoration, type TranscriptDocument as TranscriptDocumentForClient } from './transcript.js'

export interface ReactLike {
  createElement: (type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]) => unknown
  useState?: <T>(initial: T) => [T, (next: T) => void]
  useEffect?: (effect: () => void | (() => void), deps?: ReadonlyArray<unknown>) => void
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

/** The host's own colours, so the panel looks like the rest of the page instead of like a plugin. */
/**
 * The two languages this surface speaks, and the one place a sentence lives.
 *
 * The page states its language; the plugin has no locale service of its own, and a shipped string that cannot
 * be translated is a string somebody has to read in a language they did not choose. Keys are the English
 * sentence's sense, not its text, so a wording change never breaks a caller.
 */
const MESSAGES = {
  note: { en: 'Note', zh: '批注' },
  noteOn: { en: 'Note: on', zh: '批注: 开' },
  noteHint: { en: 'Click a node to mark it', zh: '点一个节点标记它' },
  node: { en: 'Node', zh: '节点' },
  add: { en: 'Add', zh: '加入' },
  addAndSend: { en: 'Add & send', zh: '加入并发送' },
  close: { en: 'Close', zh: '关闭' },
  send: { en: 'Send', zh: '发送' },
  clear: { en: 'Clear', zh: '清空' },
  remove: { en: 'Remove', zh: '删除' },
  markedOnly: { en: '(marked only)', zh: '(只标记)' },
  pending: { en: 'Notes', zh: '图注' },
  fold: { en: 'hide', zh: '收起' },
  carried: { en: 'Notes in this message', zh: '本消息携带图注' },
  zoomOut: { en: 'Zoom out', zh: '缩小' },
  zoomIn: { en: 'Zoom in', zh: '放大' },
  actualSize: { en: 'Actual size', zh: '实际大小' },
  full: { en: '⤢ Full', zh: '⤢ 全屏' },
  exitFull: { en: '⤡ Exit', zh: '⤡ 退出' },
  diagram: { en: 'Diagram', zh: '图' },
  fitOn: { en: 'fit: on', zh: 'fit: on' },
  fitOff: { en: 'fit: off', zh: 'fit: off' },
  scheme: { en: 'Colours', zh: '配色' },
  unfold: { en: 'unfold', zh: '展开' },
  placeholder: { en: 'A note about this node… (Ctrl+Enter adds and sends)', zh: '批注…（Ctrl+Enter 加入并发送）' },
}

type MessageKey = keyof typeof MESSAGES

/** The page's language, as the two letter code this surface uses. */
function languageOf(): 'en' | 'zh' {
  const scope = globalThis as { navigator?: { language?: string }; document?: { documentElement?: { lang?: string } } }
  const asked = (scope.document?.documentElement?.lang ?? scope.navigator?.language ?? 'en').toLowerCase()
  return asked.startsWith('zh') ? 'zh' : 'en'
}

function t(key: MessageKey): string {
  return MESSAGES[key][languageOf()]
}
const TOKEN = {
  surface: 'var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1, Canvas))',
  border: 'var(--dsw-alias-border-l1, rgba(127,127,127,0.35))',
  text: 'var(--dsw-alias-label-primary, CanvasText)',
  dim: 'var(--dsw-alias-label-secondary, GrayText)',
  accent: 'var(--dsw-alias-brand-primary, #2563eb)',
}

/** What an annotation editor shows, shared by the two surfaces that offer one. */
export interface AnnotationState {
  picked: { id: string } | null
  note: string
  pending: Array<{ nodeId: string; note: string }>
  status: string
  /** Whether the pending list is expanded under the count. */
  open?: boolean
  /** Where the editor sits, in the drawing's own coordinates: beside the node the reader picked. */
  anchor?: { left: number; top: number }
}

export interface AnnotationActions {
  onNote: (value: string) => void
  onAdd: () => void
  onAddAndSend: () => void
  onSend: () => void
  onClear: () => void
  onCancel: () => void
  onToggle: () => void
  onRemove: (index: number) => void
}

/**
 * The annotation surface: a floating editor over the drawing, and a count of what is waiting.
 *
 * Floating rather than inline, because the reader is looking at a picture and the editor must not move it.
 * The notes stay in a list until one message is composed from them: the reader's input box is theirs, and N raw
 * fragments in it would be exactly the mess this feature is meant to avoid. Colours come from the host's tokens,
 * so light and dark themes need no separate code.
 */
export function annotationPanel(h: H, state: AnnotationState, actions: AnnotationActions, options: { floating?: boolean; document?: DocumentLike } = {}): unknown {
  const button = (label: string, onClick: () => void, accent = false): unknown =>
    h('button', { type: 'button', onClick, style: { fontSize: '12px', padding: '2px 8px', borderRadius: '6px', border: '1px solid ' + TOKEN.border, background: 'transparent', color: accent ? TOKEN.accent : TOKEN.text, cursor: 'pointer' } }, label)
  const editor = state.picked === null
    ? null
    : h(
        'div',
        {
          style: {
            ...(options.floating === false ? {} : { position: 'absolute', left: (state.anchor?.left ?? 10) + 'px', top: (state.anchor?.top ?? 10) + 'px', zIndex: 20 }),
            width: 'min(260px, calc(100% - 16px))', boxSizing: 'border-box',
            display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px', borderRadius: '10px',
            background: TOKEN.surface, border: '1px solid ' + TOKEN.border, color: TOKEN.text,
            boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
          },
        },
        h('div', { style: { fontSize: '12px', color: TOKEN.dim } }, t('node') + ' ' + state.picked.id),
        h('textarea', {
          'data-dme-own': '1',
          value: state.note,
          rows: 3,
          placeholder: t('placeholder'),
          style: { width: '100%', boxSizing: 'border-box', font: '12px system-ui, sans-serif', padding: '6px', borderRadius: '6px', border: '1px solid ' + TOKEN.border, background: 'transparent', color: TOKEN.text, resize: 'vertical' },
          onInput: (event: { target?: { value?: unknown } }) => actions.onNote(String(event?.target?.value ?? '')),
          onKeyDown: (event: { key?: string; ctrlKey?: boolean; metaKey?: boolean; preventDefault?: () => void }) => {
            if (event?.key === 'Enter' && (event?.ctrlKey === true || event?.metaKey === true)) { event.preventDefault?.(); actions.onAdd() }
          },
        }),
        h('div', { style: { display: 'flex', gap: '6px', justifyContent: 'flex-end' } }, button('关闭', actions.onCancel), button('加入', actions.onAdd)),
      )
  // The pending count docks above the conversation's own input box, where the message will be sent from: the
  // reader is about to press Return there, and the count has to be in sight without covering the box.
  const docked = options.floating !== false && options.document !== undefined ? composerRect(options.document) : undefined
  const chip = state.pending.length === 0
    ? null
    : h(
        'div',
        {
          style: {
            ...(options.floating === false ? {} : {
              position: 'fixed', zIndex: 30,
              left: (docked === undefined ? 16 : docked.left) + 'px',
              // Anchored to the composer's own top edge, in the gap above it: the count is in sight while the
              // reader is typing, and never covers the box they are typing into.
              top: (docked === undefined ? 16 : Math.max(8, docked.top - 46)) + 'px',
              width: (docked === undefined ? 360 : Math.min(420, docked.width)) + 'px',
            }),
            display: 'flex', flexDirection: 'column', gap: '6px', padding: '6px 10px', borderRadius: '12px',
            // The composer's own surface and hairline: the control reads as part of that box, not as a dialog.
            background: 'var(--dsw-alias-bg-layer-1, ' + TOKEN.surface + ')',
            border: '1px solid var(--dsw-alias-border-l2, ' + TOKEN.border + ')', color: TOKEN.text,
            boxShadow: '0 8px 24px rgba(0,0,0,0.22)', font: '12px system-ui, sans-serif',
          },
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          h('button', { type: 'button', title: '展开，逐个删除', onClick: () => actions.onToggle(), style: { fontSize: '12px', padding: '1px 6px', borderRadius: '6px', border: '1px solid ' + TOKEN.border, background: 'transparent', color: TOKEN.text, cursor: 'pointer' } }, t('pending') + ' ×' + String(state.pending.length)),
          button(t('send'), actions.onSend, true),
        ),
        state.open
          ? h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: '2px' } },
              ...state.pending.map((item, index) =>
                h(
                  'div',
                  { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                  h('span', { style: { color: TOKEN.dim, fontSize: '11px' } }, item.nodeId),
                  h('span', { style: { flex: '1 1 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, item.note === '' ? t('markedOnly') : item.note),
                  button(t('remove'), () => actions.onRemove(index)),
                ),
              ),
            )
          : null,
      )
  const mode = state.picked === null && state.pending.length === 0
    ? h('div', { style: { fontSize: '11px', color: TOKEN.dim, padding: '2px 4px' } }, t('noteHint'))
    : null
  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: '2px', color: TOKEN.text } },
    mode,
    chip,
    editor,
    state.status === '' ? null : h('div', { style: { fontSize: '11px', color: TOKEN.dim, padding: '0 4px' } }, state.status),
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
/**
 * The source of a drawing call, from whichever shape the host handed over.
 *
 * Measured, not assumed: a settled block carries `args`, `call`, `content` and `meta`, and which one holds the
 * arguments differs by host version. Each is read in turn and the first non-empty text wins, so the card draws
 * on a host that ships the lazy view, one that ships the call record, or one that ships a JSON string.
 */
function sourceOf(block: unknown): string | undefined {
  const record = (value: unknown): Record<string, unknown> | undefined =>
    value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : undefined
  const asText = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value : undefined)
  const fromJson = (value: unknown): string | undefined => {
    const raw = asText(value)
    if (raw === undefined) return undefined
    try {
      return asText(record(JSON.parse(raw))?.source)
    } catch {
      return undefined
    }
  }
  const frame = record(block)
  if (frame === undefined) return undefined
  // The payload the host persists from `presentationMeta`: the one field a settled call keeps on purpose.
  const fromMeta = asText(record(frame.meta)?.source)
  if (fromMeta !== undefined) return fromMeta
  const args = record(frame.args)
  if (args !== undefined && typeof args.value === 'function') {
    const lazy = asText((args as { value: (key: string) => unknown }).value('source'))
    if (lazy !== undefined) return lazy
  }
  const plain = asText(args?.source) ?? fromJson(frame.args)
  if (plain !== undefined) return plain
  const call = record(frame.call)
  const fromCall = asText(call?.source) ?? fromJson(call?.input) ?? fromJson(call?.arguments)
  if (fromCall !== undefined) return fromCall
  return asText(record(frame.meta)?.source)
}

function drawingCard(React: ReactLike, props: ToolCallProps, overrides: Partial<Palette>): unknown {
  const block = (props.block ?? {}) as { args?: unknown }
  const source = sourceOf(props.block) ?? argOf(block.args, 'source')
  const asked = argOf(block.args, 'scheme')
  const scheme = schemeNames().includes(asked as PaletteScheme) ? (asked as PaletteScheme) : 'default'
  // The arguments are the lazy view while the call runs; by the time it settles the host may hand back only
  // the result. Both carry the drawing, so the card reads whichever one is there.
  const payload = (props.block as { result?: unknown } | undefined)?.result
  const returned = payload !== null && typeof payload === 'object' ? (payload as { svg?: unknown }).svg : undefined
  const markup = typeof returned === 'string' && returned !== '' ? returned : null
  // Nothing to draw yet, or nothing at all. The branch is taken after the hooks below, never before: a running
  // call has no source and a settled one does, and a hook that disappears between those renders takes the whole
  // conversation view down with it.
  const hasDrawing = markup !== null || (typeof source === 'string' && source.trim() !== '')
  const useState = React.useState
  if (useState === undefined) return cardSurface(React, source, markup, scheme, overrides, null, null, null)
  const [annotate, setAnnotate] = useState(false)
  const [picked, setPicked] = useState<{ id: string } | null>(null)
  const [note, setNote] = useState('')
  const [status, setStatus] = useState('')
  const document = (globalThis as { document?: DocumentLike }).document
  const caption = typeof source === 'string' ? (source.split(String.fromCharCode(10)).map((line) => line.trim()).find((line) => line !== '') ?? '') : ''
  const [pending, setPending] = useState<Array<{ nodeId: string; note: string }>>([])
  const [open, setOpen] = useState(false)
  // A note that left: this plugin's own chrome says so, where no other plugin works.
  const [sent, setSent] = useState('')
  const [anchor, setAnchor] = useState<{ left: number; top: number } | undefined>(undefined)
  // What would leave with the next message: the chip shows it, and the draft stays empty until Enter.
  setPendingBlock(pending.length === 0 ? '' : annotationBlock(pending.map((item) => ({ ...item, caption }))))
  // The count has to clear when the message leaves, and the subscription must not be able to take the card
  // down with it: a hook that throws here unmounts the drawing, which reads as "the card did not render".
  React.useEffect?.(() => {
    try { return onMessageSent(() => { setPending([]); setStatus('') }) } catch { return undefined }
  }, [])
  const [zoom, setZoom] = useState(1)
  const [full, setFull] = useState(false)
  if (!hasDrawing) {
    const keys = props.block === null || typeof props.block !== 'object' ? 'none' : Object.keys(props.block as Record<string, unknown>).join(',')
    return React.createElement('div', { style: { fontSize: '12px', opacity: 0.7 } }, 'no drawing in this call · block: ' + (keys === '' ? 'empty' : keys))
  }
  const sendAll = (list: Array<{ nodeId: string; note: string }>): void => {
    if (list.length === 0) return
    const text = annotationBlock(list.map((item) => ({ ...item, caption })))
    void (async () => {
      // The draft path runs FIRST and synchronously enough to answer the click. The command channel is a
      // second attempt only after the note is already safe: a channel that hangs, refuses or silently does
      // nothing must never be the thing a click waits on. Measured: it hung, and the button looked dead.
      if (placeBlock(text)) {
        const label = '图注 ×' + String(list.length)
        setSent('已发送 ' + label)
        attachSentChip(label)
        setStatus('已放入输入框并提交（' + String(list.length) + ' 条图注）')
        setPending([])
        submitDraft()
        return
      }
      const said = prependBlock(document, list, caption)
      setStatus(said)
      if (!said.startsWith('已')) return
      setPending([])
      submitComposer(document)
    })()
  }
  const onPick = (event: { target?: { closest?: (selector: string) => { getAttribute?: (name: string) => string | null } | null } }): void => {
    if (!annotate) return
    const id = event?.target?.closest?.('[data-node-id]')?.getAttribute?.('data-node-id')
    if (typeof id === 'string' && id !== '') {
      const pointer = event as { clientX?: number; clientY?: number; currentTarget?: { getBoundingClientRect?: () => { left: number; top: number; width: number; height: number } } }
      const frame = pointer.currentTarget?.getBoundingClientRect?.()
      if (frame !== undefined && typeof pointer.clientX === 'number' && typeof pointer.clientY === 'number') {
        setAnchor({ left: Math.max(4, Math.min(pointer.clientX - frame.left + 12, Math.max(4, frame.width - 250))), top: Math.max(4, Math.min(pointer.clientY - frame.top + 12, Math.max(4, frame.height - 20))) })
      }
      setPicked({ id })
      setStatus('')
      return
    }
    if (note.trim() === '') setPicked(null)
  }
  const toggle = React.createElement(
    'div',
    { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
    React.createElement('button', { type: 'button', title: 'Point at a node and send a note about it', onClick: () => { setAnnotate(!annotate); setStatus(''); if (annotate) { setPicked(null); setNote('') } }, style: { fontSize: '11px', lineHeight: '16px', padding: '1px 6px', borderRadius: '5px', border: '1px solid ' + TOKEN.border, background: 'transparent', color: TOKEN.text, cursor: 'pointer' } }, annotate ? t('noteOn') : t('note')),
    annotate && picked === null ? React.createElement('span', { style: { fontSize: '11px', opacity: 0.7 } }, '点一个节点') : null,
    sent === '' ? null : React.createElement('span', {
      style: { fontSize: '11px', lineHeight: '16px', padding: '1px 6px', borderRadius: '9px', border: '1px solid ' + TOKEN.border, color: TOKEN.dim, whiteSpace: 'nowrap' },
    }, sent),
  )
  const panel = annotate
    ? annotationPanel(
        (type, options, ...children) => React.createElement(type, options, ...children),
        { picked, note, pending, status, anchor, open },
        {
          onNote: setNote,
          onAdd: () => {
            if (picked === null) return
            const merged = [...pending, { nodeId: picked.id, note }]
            setPending(merged)
            setNote('')
            setPicked(null)
            setStatus('已放入输入框，直接回车即可')
          },
          onAddAndSend: () => { if (picked === null) return; const merged = [...pending, { nodeId: picked.id, note }]; setNote(''); setPicked(null); sendAll(merged) },
          onSend: () => sendAll(pending),
          onClear: () => { setPending([]); setStatus('') },
          onCancel: () => { setPicked(null); setNote(''); setStatus('') },
          onToggle: () => setOpen(!open),
          onRemove: (index: number) => setPending(pending.filter((_, at) => at !== index)),
        },
        { document },
      )
    : null
  return cardSurface(React, source, markup, scheme, overrides, onPick, toggle, panel, { zoom: Number(zoom), full: Boolean(full), onZoom: (next: number) => setZoom(next), onFull: (next: boolean) => setFull(next) })
}

/** The drawing itself, plus whatever the reader is doing to it. One surface, drawn once. */
function cardSurface(React: ReactLike, source: unknown, returned: string | null, scheme: PaletteScheme, overrides: Partial<Palette>, onClick: ((event: never) => void) | null, toggle: unknown, panel: unknown, view: { zoom: number; full: boolean; onZoom: (next: number) => void; onFull: (next: boolean) => void } = { zoom: 1, full: false, onZoom: () => {}, onFull: () => {} }): unknown {
  if (returned === null && (typeof source !== 'string' || source.trim() === '')) {
    return React.createElement('div', { style: { fontSize: '12px', opacity: 0.7 } }, 'no drawing in this call')
  }
  // A settled result already carries the drawing the file got; a running call has only its source. Either way
  // it is the same picture from the same renderer.
  const drawn = returned === null
    ? render({ source: String(source), folded: [] }, overrides, { mode: themeMode(), scheme })
    : { markup: returned, refused: [] as string[], colours: palette(overrides, { mode: themeMode(), scheme }) }
  // The drawing keeps its own size and shrinks only when it has to: stretched to the card's width, a two-box
  // diagram became a poster and the card stopped looking like the other cards. Zoom is the control for size.
  const scaled = drawn.markup.replace('<svg ', '<svg style="max-width: 100%; height: auto; display: block; margin: 0 auto" ')
  const refused =
    drawn.refused.length === 0
      ? null
      : React.createElement('pre', { style: { fontSize: '11px', color: '#b7791f', whiteSpace: 'pre-wrap', margin: '6px 8px' } }, drawn.refused.join(String.fromCharCode(10)))
  // Chrome in the host's own colours and type, so the card reads as another code card rather than a plugin:
  // a header line with the drawing's name and its controls, then the picture on its own background.
  const chrome = { border: '1px solid ' + TOKEN.border, borderRadius: '8px', overflow: 'hidden', background: TOKEN.surface, color: TOKEN.text }
  const button = (label: string, onPress: () => void, title: string): unknown =>
    React.createElement('button', { type: 'button', title, onClick: onPress, style: { fontSize: '11px', lineHeight: '16px', padding: '1px 6px', borderRadius: '5px', border: '1px solid ' + TOKEN.border, background: 'transparent', color: TOKEN.text, cursor: 'pointer' } }, label)
  const header = React.createElement(
    'div',
    { style: { display: 'flex', gap: '6px', alignItems: 'center', padding: '3px 8px', borderBottom: '1px solid ' + TOKEN.border, fontSize: '12px', color: TOKEN.dim } },
    React.createElement('span', null, t('diagram')),
    React.createElement('span', { style: { opacity: 0.7 } }, typeof source === 'string' ? (source.split(String.fromCharCode(10)).map((line) => line.trim()).find((line) => line !== '') ?? '') : ''),
    React.createElement(
      'span',
      { style: { marginLeft: 'auto', display: 'flex', gap: '4px', alignItems: 'center' } },
      button('−', () => view.onZoom(Math.max(0.5, Math.round((view.zoom - 0.25) * 100) / 100)), t('zoomOut')),
      button(Math.round(view.zoom * 100) + '%', () => view.onZoom(1), t('actualSize')),
      button('+', () => view.onZoom(Math.min(3, Math.round((view.zoom + 0.25) * 100) / 100)), t('zoomIn')),
      button(view.full ? t('exitFull') : t('full'), () => view.onFull(!view.full), t('full')),
      toggle,
    ),
  )
  // Zoom scales the wrapper, not the markup: the SVG is written at one size and the card is what has to fit a
  // column, a split pane, or a screen.
  const drawing = React.createElement(
    'div',
    {
      // CSS zoom, not a transform: it reflows, so the scroll area grows with the picture and nothing is clipped.
      style: { zoom: view.zoom as unknown as number, cursor: onClick === null ? undefined : 'crosshair' },
      onClick: onClick === null ? undefined : (onClick as never),
      dangerouslySetInnerHTML: { __html: scaled },
    },
  )
  const body = React.createElement(
    'div',
    { style: { position: 'relative', background: drawn.colours.background, padding: '6px', maxHeight: view.full ? 'none' : '260px', overflow: 'auto', flex: '1 1 auto', minHeight: '0' } },
    drawing,
    panel,
  )
  const frame = view.full
    ? { position: 'fixed' as const, inset: '16px', zIndex: 60, display: 'flex', flexDirection: 'column', ...chrome, boxShadow: '0 12px 40px rgba(0,0,0,0.35)' }
    : { display: 'flex', flexDirection: 'column', ...chrome }
  const children = [header, body, refused].filter((child) => child !== null)
  return React.createElement('div', { style: frame }, ...children)
}

/**
 * The view for one tool name.
 *
 * The drawing is emitted as markup, so React receives it through `dangerouslySetInnerHTML`. That is safe
 * only because the writer escapes every value that came from a report or a model, which the render suite
 * pins with an injection case.
 */
/** Where the page thinks it is, short enough to read in a status line. */
/**
 * The session the page is showing, asked of the client services in the order that actually answers.
 *
 * The address carries no id on this host; the store does. Fourth place is the host's own recorded selection,
 * which is what the shipped annotation plugin falls back to when the first three are silent - a session id is
 * the one thing every path here needs.
 */
function currentSessionId(): string | undefined {
  const sessions = services?.get?.('sessions') as { list?: { getSnapshot?: () => { current?: unknown } } } | undefined
  const snapshot = sessions?.list?.getSnapshot?.()
  if (typeof snapshot?.current === 'string' && snapshot.current !== '') return snapshot.current
  const workspace = services?.get?.('uiWorkspace') as {
    mainReference?: { sessionId?: unknown }
    selection?: { getSnapshot?: () => { sessionId?: unknown } }
  } | undefined
  const main = workspace?.mainReference?.sessionId
  if (typeof main === 'string' && main !== '') return main
  const picked = workspace?.selection?.getSnapshot?.()?.sessionId
  if (typeof picked === 'string' && picked !== '') return picked
  const storage = (globalThis as { localStorage?: { getItem?: (key: string) => string | null } }).localStorage
  const raw = storage?.getItem?.('dsh.sessions.current')
  if (typeof raw === 'string' && raw !== '') {
    try {
      const parsed = JSON.parse(raw) as { sessionId?: unknown }
      if (typeof parsed?.sessionId === 'string' && parsed.sessionId !== '') return parsed.sessionId
    } catch {
      // A key that is not the shape we expect is simply not an answer.
    }
  }
  return undefined
}

/** The conversation's draft, when this host exposes it: the one writer that keeps line breaks intact. */
interface DraftShell {
  state?: { getSnapshot?: () => { draft?: unknown }; subscribe?: (listener: () => void) => unknown }
  setDraft?: (text: string) => void
  submit?: (mode?: string) => void
}

function draftShell(): DraftShell | undefined {
  const conversation = services?.get?.('conversation') as { input?: { for?: (scope: unknown) => DraftShell } } | undefined
  const sessions = services?.get?.('sessions') as { scope?: (id: string) => unknown } | undefined
  if (conversation?.input?.for === undefined || sessions?.scope === undefined) return undefined
  const id = currentSessionId()
  if (id === undefined) return undefined
  try {
    return conversation.input.for(sessions.scope(id))
  } catch {
    return undefined
  }
}

/**
 * Put the block at the top of the draft through the host, and answer whether it landed.
 *
 * The composer's DOM is the wrong writer: a contenteditable keeps line breaks in its own model, and reaching into
 * it produced one long line. The host's draft setter is the same writer the reader's keystrokes use.
 */
/** What this plugin last put in the draft, so it can take it back out without touching the reader's words. */
let placedText = ''

/**
 * Put the block in the draft, or take it out again, and keep the reader's own text exactly as it was.
 *
 * The block has to be in the draft BEFORE the message is sent, not at the moment this plugin decides to send.
 * Any Enter handler on the composer - the host's, or another plugin's capture handler - composes the message
 * from the draft it can see, so a block written after that point never reaches the model. Measured: with the
 * annotation plugin active, a note committed at send time arrived as nothing at all.
 *
 * The write is a read-modify-write with the previous block removed first, so committing, adding another note
 * and removing one all converge on one block instead of stacking.
 */
function replaceBlock(text: string): boolean {
  const shell = draftShell()
  if (shell === undefined || typeof shell.setDraft !== 'function') return false
  const snapshot = shell.state?.getSnapshot?.()
  const current = typeof snapshot?.draft === 'string' ? String(snapshot.draft) : ''
  let rest = current
  if (placedText !== '' && rest.includes(placedText)) rest = rest.split(placedText).join('')
  rest = rest.replace(/^[\r\n]+/, '').replace(/\s+$/, '')
  const next = text === '' ? rest : (rest === '' ? text : text + String.fromCharCode(10, 10) + rest)
  try {
    shell.setDraft(next)
    placedText = text
    return true
  } catch {
    return false
  }
}

/** The block for a list of notes, in the draft. An empty list removes it. */
/** The block waiting to leave. Empty when there is nothing to send. */
let pendingBlock = ''
let enterWatch: unknown = null

/** Remember what would leave with the next message, and start watching for that message. */
export function setPendingBlock(text: string): void {
  pendingBlock = text
  installEnterCapture()
}

/**
 * Put the block into the message at the instant it leaves.
 *
 * This is the only moment that satisfies both requirements at once: the composer shows nothing while a note
 * is being written, and the message still carries the block because the draft is filled before the host
 * composes it. A capture-phase listener runs before the page's own Enter handling, which is why the write
 * lands in time - and why this is the same trick the shipped annotation plugin uses.
 */
/**
 * Fold the message that just left, once, at a moment we chose.
 *
 * The earlier attempt started an observer over the document and scanned on every change; a streaming
 * conversation then spent all its time in the selector. This runs one pass, half a second after our own send,
 * and nothing else - the cost is a known single scan per message instead of a continuous one.
 */
function foldOnce(): void {
  const doc = (globalThis as { document?: DocumentLike }).document
  const timer = (globalThis as { setTimeout?: (handler: () => void, delay: number) => unknown }).setTimeout
  if (doc === undefined || typeof timer !== 'function') return
  timer(() => {
    try { decorateTranscript(doc as unknown as TranscriptDocumentForClient, t('pending'), t('carried')) } catch { /* the message keeps its block */ }
  }, 600)
}

/**
 * Put the count beside the sent message, as an element - never by touching text.
 *
 * The annotation plugin folds a message by deleting the text nodes before its own marker, so anything this
 * plugin wrote inside the message is gone by the time a scan could find it. An element inserted next to its
 * chip is outside that surgery: text nodes are what it removes. When there is no anchor it inserts nothing -
 * a missing chip is a smaller failure than a chip in the wrong place.
 */
function attachSentChip(label: string): void {
  const doc = (globalThis as { document?: DocumentLike }).document
  const timer = (globalThis as { setTimeout?: (handler: () => void, delay: number) => unknown }).setTimeout
  if (doc === undefined || typeof timer !== 'function') return
  let tries = 0
  const attempt = (): void => {
    tries += 1
    const anchor = doc.querySelector?.('[data-annotation-chip]') as { parentNode?: { insertBefore?: (node: unknown, before: unknown) => unknown } | null; nextSibling?: unknown } | null | undefined
    const parent = anchor?.parentNode
    const made = (doc as unknown as { createElement?: (tag: string) => { textContent?: string; setAttribute?: (name: string, value: string) => void } }).createElement?.('span')
    if (made !== undefined && parent !== undefined && parent !== null && typeof parent.insertBefore === 'function') {
      made.textContent = label
      made.setAttribute?.('data-dme-own', '1')
      try {
        parent.insertBefore(made, anchor?.nextSibling ?? null)
        return
      } catch {
        // A refused insert is a chip not shown, not a broken message.
      }
    }
    if (tries < 8) timer(attempt, 250)
  }
  timer(attempt, 300)
}

function installEnterCapture(): void {
  if (pendingBlock === '') return
  const doc = (globalThis as { document?: DocumentLike }).document
  const composer = findComposer(doc)
  if (composer === undefined || composer === null) return
  if (enterWatch === composer) return
  enterWatch = composer
  const listen = (composer as { addEventListener?: (type: string, handler: (event: unknown) => void, capture?: boolean) => void }).addEventListener
  if (typeof listen !== 'function') return
  listen.call(composer, 'keydown', (event: unknown) => {
    const key = event as { key?: string; shiftKey?: boolean; isComposing?: boolean }
    if (key?.key !== 'Enter' || key.shiftKey === true || key.isComposing === true) return
    if (pendingBlock === '') return
    // Written, not submitted: the host's own Enter handling submits right after this returns.
    // With nothing typed, a bare "Question:" would be the message's last line and would invite an answer
    // nobody asked for - the same rule the click path applies.
    const shell = draftShell()
    const draft = String(shell?.state?.getSnapshot?.()?.draft ?? '')
    const block = draft.trim() === '' ? withoutEmptyQuestion(pendingBlock) : pendingBlock
    replaceBlock(block)
    // The count has to appear for this message too: pressing Enter is the path most readers take, and a
    // marker that only answers the button is a marker half the messages never get.
    const count = (block.match(/^Diagram note \[/gm) ?? []).length
    attachSentChip('图注 ×' + String(count === 0 ? 1 : count))
    notifySent()
    foldOnce()
    pendingBlock = ''
  }, true)
}

/** Tell the surfaces that a note left, so their own chrome can say so. */
function notifySent(): void {
  for (const listener of sentListeners.slice()) {
    try { listener() } catch { /* one listener must not keep the others from hearing it */ }
  }
}

function placeListBlock(list: Array<{ nodeId: string; note: string }>, caption: string): boolean {
  return replaceBlock(list.length === 0 ? '' : annotationBlock(list.map((item) => ({ ...item, caption }))))
}

function placeBlock(text: string): boolean {
  // With nothing typed, a trailing question line would be the only thing left to read: drop it before placing.
  const shell = draftShell()
  const snapshot = shell?.state?.getSnapshot?.()
  const current = typeof snapshot?.draft === 'string' ? String(snapshot.draft) : ''
  return replaceBlock(current.trim() === '' ? withoutEmptyQuestion(text) : text)
}

/** Listeners waiting for the message to leave. */
let sentListeners: Array<() => void> = []
let watchState: 'idle' | 'watching' | 'unavailable' = 'idle'
let lastSeenDraft = ''

/**
 * Tell this module when a message leaves, by watching the one signal the host gives: the draft empties.
 *
 * A note that was committed is in the draft, so after the send there is nothing left to keep - and a chip still
 * counting a note that has already gone out is the plugin lying about its own state.
 */
export function onMessageSent(listener: () => void): () => void {
  sentListeners.push(listener)
  watchDraft()
  return () => { sentListeners = sentListeners.filter((item) => item !== listener) }
}

function watchDraft(): void {
  if (watchState !== 'idle') return
  const shell = draftShell()
  const subscribe = shell?.state?.subscribe
  if (typeof subscribe !== 'function') {
    // A host that has not loaded its conversation yet is retried by the next caller, not by a timer.
    return
  }
  watchState = 'watching'
  try {
    lastSeenDraft = String(shell?.state?.getSnapshot?.()?.draft ?? '')
    subscribe(() => {
      const draft = String(shell?.state?.getSnapshot?.()?.draft ?? '')
      const before = lastSeenDraft
      lastSeenDraft = draft
      if (before.trim() === '' || draft.trim() !== '') return
      placedText = ''
      for (const listener of sentListeners.slice()) {
        try { listener() } catch { /* one listener must not keep the others from hearing it */ }
      }
    })
  } catch {
    watchState = 'unavailable'
  }
}

/**
 * Send the block through the session's command channel, which never touches the composer.
 *
 * The client cannot call a host service directly; the remote facade is the only route, and its signature is
 * `execute(sessionId, line, attachments)` - the session id first, because the facade resolves the agent itself.
 *
 * Returns the reason it worked, or undefined. Undefined means "use the composer": a command that silently did
 * nothing would lose the notes, and this function is the only thing standing between a note and the void.
 */
let commandWhy = 'not tried'

async function sendViaCommand(text: string): Promise<string | undefined> {
  commandWhy = 'not tried'
  const sessions = services?.get?.('sessions') as { scope?: (id: string) => unknown } | undefined
  const id = currentSessionId()
  if (id === undefined) { commandWhy = 'no session id'; return undefined }
  if (typeof sessions?.scope !== 'function') { commandWhy = 'no sessions service'; return undefined }
  // The remote facade hangs off the CLIENT context, not off a session scope: page-side code writes
  // `ctx.remote.commands.execute(sessionId, line, attachments)` and the facade resolves the agent itself
  // (that is how ui-commands calls it). The scope route stays as a second door for a host that mounts it there.
  let commands: { execute?: unknown } | undefined
  commands = (services as unknown as { remote?: { commands?: { execute?: unknown } } } | undefined)?.remote?.commands
  if (commands === undefined || typeof commands.execute !== 'function') {
    try {
      commands = ((sessions.scope(id) as { remote?: { commands?: { execute?: unknown } } } | undefined)?.remote)?.commands
    } catch {
      return undefined
    }
  }
  if (commands === undefined || typeof commands.execute !== 'function') { commandWhy = 'no remote.commands.execute'; return undefined }
  try {
    // A remote call that never settles would take the button with it: the note would sit in no draft and no
    // message, and the reader would see a click that did nothing. The wait is bounded, and a timeout is just
    // another reason to fall back to the composer.
    const timeout = new Promise<string>((resolve) => {
      const timer = (globalThis as { setTimeout?: (fn: () => void, ms: number) => unknown }).setTimeout
      if (typeof timer === 'function') timer(() => resolve('timeout'), 1200)
      else resolve('timeout')
    })
    const raced = await Promise.race([
      (commands.execute as (session: string, line: string, attachments: unknown[]) => Promise<{ kind?: string } | undefined>)(id, '/annotate ' + text, []),
      timeout,
    ])
    if (raced === 'timeout') { commandWhy = 'execute timed out'; return undefined }
    const result = typeof raced === 'string' ? undefined : raced
    if (result?.kind === 'success') return '已通过会话命令发送（输入框未占用）'
    commandWhy = 'execute said ' + String(result?.kind ?? 'nothing')
    return undefined
  } catch (error) {
    commandWhy = 'execute threw: ' + String((error as { message?: unknown })?.message ?? error).slice(0, 60)
    return undefined
  }
}

/** Ask the host to submit the draft it now holds. */
function submitDraft(): boolean {
  const shell = draftShell()
  if (shell === undefined || typeof shell.submit !== 'function') return false
  try {
    shell.submit('queue')
    foldOnce()
    return true
  } catch {
    return false
  }
}

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
    const [anchor, setAnchor] = useState<{ left: number; top: number } | undefined>(undefined)
    const [note, setNote] = useState('')
    const [status, setStatus] = useState('')
    const [pending, setPending] = useState<Array<{ nodeId: string; note: string }>>([])
    const [open, setOpen] = useState(false)
    React.useEffect?.(() => { try { return onMessageSent(() => { setPending([]); setStatus('') }) } catch { return undefined } }, [])
    const drawn = drawSample(React, overrides, source, fit ? 0 : zoom, scheme, folded)
    const document = (globalThis as { document?: DocumentLike }).document
    const caption = source.split(String.fromCharCode(10)).map((line) => line.trim()).find((line) => line !== '') ?? ''
    // The notes accumulate here; one structured message leaves for the session, not one raw fragment per note.
    const sendAll = (list: Array<{ nodeId: string; note: string }>, submit: boolean): void => {
      if (list.length === 0) return
      const text = annotationBlock(list.map((item) => ({ ...item, caption })))
      void (async () => {
        // The draft writer first: it is the writer the reader's keystrokes use, so line breaks survive.
        if (placeBlock(text)) {
          setStatus('已放入输入框并提交（' + String(list.length) + ' 条图注）')
          setPending([])
          if (submit) submitDraft()
          return
        }
        const said = prependBlock(document, list, caption)
        setStatus(said)
        if (!said.startsWith('已')) return
        setPending([])
        if (submit) submitComposer(document)
      })()
    }
    const addDraft = (): boolean => {
      if (picked === null) return false
      const merged = [...pending, { nodeId: picked.id, note }]
      setPending(merged)
      setNote('')
      setPicked(null)
      setStatus('已放入输入框，直接回车即可')
      return true
    }
    const addAndSend = (): void => {
      if (picked === null) return
      const merged = [...pending, { nodeId: picked.id, note }]
      setNote('')
      setPicked(null)
      sendAll(merged, true)
    }
    const textarea = h('textarea', {
      'data-dme-own': '1',
      value: source,
      spellcheck: false,
      rows: Math.min(12, Math.max(4, String(source).split('\n').length)),
      style: { width: '100%', boxSizing: 'border-box', font: '12px ui-monospace, SFMono-Regular, Menlo, monospace', padding: '6px', resize: 'vertical', borderRadius: '6px', border: '1px solid ' + TOKEN.border, background: 'transparent', color: TOKEN.text },
      onInput: (event: { target?: { value?: unknown } }) => setSource(String(event?.target?.value ?? '')),
    })
    // Two rows: the tools that change the picture, then the mode and the scheme. One row folded on a narrow
    // pane and pushed the scheme out of reach, which is the one control a reader looks for by name.
    const controlStyle = { fontSize: '11px', lineHeight: '18px', padding: '1px 7px', borderRadius: '6px', border: '1px solid ' + TOKEN.border, background: 'transparent', color: TOKEN.text, cursor: 'pointer' }
    const control = (label: string, onPress: () => void, title?: string): unknown => h('button', { type: 'button', title, onClick: onPress, style: controlStyle }, label)
    const controls = h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '3px', padding: '2px 0' } },
      h(
        'div',
        { style: { display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' } },
        control('−', () => { setFit(false); setZoom(Math.max(0.5, Math.round((Number(zoom) - 0.25) * 100) / 100)) }, '缩小'),
        h('span', { style: { fontSize: '11px', color: TOKEN.dim, minWidth: '34px', textAlign: 'center' } }, fit ? 'fit' : String(Math.round(Number(zoom) * 100)) + '%'),
        control('+', () => { setFit(false); setZoom(Math.min(3, Math.round((Number(zoom) + 0.25) * 100) / 100)) }, '放大'),
        control('100%', () => { setFit(false); setZoom(1) }, '实际大小'),
        control(fit ? t('fitOn') : t('fitOff'), () => setFit(!fit), t('fitOff')),
        folded.length === 0 ? null : control(t('unfold') + ' ' + String(folded.length), () => setFolded([]), '展开所有分组'),
        h(
          'select',
          {
            value: scheme,
            title: t('scheme'),
            style: { marginLeft: 'auto', fontSize: '11px', padding: '1px 4px', borderRadius: '6px', border: '1px solid ' + TOKEN.border, background: 'transparent', color: TOKEN.text },
            onChange: (event: { target?: { value?: unknown } }) => setScheme(String(event?.target?.value ?? 'default') as PaletteScheme),
          },
          ...schemeNames().map((name) => h('option', { value: name, selected: name === scheme }, name)),
        ),
      ),
      h(
        'div',
        { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
        control(annotate ? t('noteOn') : t('note'), () => { setAnnotate(!annotate); setStatus(''); if (annotate) { setPicked(null); setNote('') } }, t('noteHint')),
        h('span', { style: { fontSize: '11px', color: TOKEN.dim } }, annotate ? (picked === null ? t('noteHint') : t('node') + ' ' + picked.id) : t('noteHint')),
      ),
    )
    return h(
      'div',
      { style: { display: 'flex', flexDirection: 'column', gap: '4px', height: '100%', boxSizing: 'border-box', padding: '8px' } },
      textarea,
      controls,
      // The drawing takes the rest of the pane and scrolls inside it; the annotation surface floats above it,
      // so the picture keeps its size while the reader writes about it.
      h(
        'div',
        {
          style: { position: 'relative', flex: '1 1 auto', minHeight: '0', display: 'flex', flexDirection: 'column', gap: '2px' },
        },
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
              const node = event?.target?.closest?.('[data-node-id]') as {
                getAttribute?: (name: string) => string | null
                getBoundingClientRect?: () => { left: number; top: number; width: number; height: number }
              } | null
              const marked = node?.getAttribute?.('data-node-id')
              if (typeof marked === 'string' && marked !== '') {
                // Beside the node, not at a fixed corner: the note is about that box, and a window that jumps to
                // the corner makes the reader look for it. Coordinates are the drawing's own, because the editor
                // is positioned against the pane the drawing sits in.
                // At the pointer, not at the node's corner: the reader clicked there, and a window that appears
                // somewhere else makes them look for it. Clamped so it cannot leave the pane on the right.
                const pointer = event as { clientX?: number; clientY?: number; currentTarget?: { getBoundingClientRect?: () => { left: number; top: number; width: number; height: number } } }
                const frame = pointer.currentTarget?.getBoundingClientRect?.()
                if (frame !== undefined && typeof pointer.clientX === 'number' && typeof pointer.clientY === 'number') {
                  setAnchor({
                    left: Math.max(4, Math.min(pointer.clientX - frame.left + 12, frame.width - 270)),
                    top: Math.max(4, Math.min(pointer.clientY - frame.top + 12, Math.max(4, frame.height - 160))),
                  })
                } else {
                  setAnchor({ left: 10, top: 10 })
                }
                setPicked({ id: marked })
                setStatus('')
                return
              }
              // A click that lands on nothing closes the window only when it is empty: a miss is not a reason to
              // lose words, and an empty window left open is clutter over the picture.
              if (note.trim() === '') { setPicked(null); setAnchor(undefined) }
              return
            }
            const hit = event?.target?.closest?.('[data-group-id]')
            const id = hit?.getAttribute?.('data-group-id')
            if (typeof id !== 'string' || id === '') return
            setFolded(folded.includes(id) ? folded.filter((entry) => entry !== id) : [...folded, id])
          },
        },
          drawn,
        ),
        annotate
          ? annotationPanel(
              h,
              { picked, note, pending, status, anchor, open },
              {
                onNote: setNote,
                onAdd: () => { addDraft() },
                onAddAndSend: addAndSend,
                onSend: () => sendAll(pending, true),
                onClear: () => { setPending([]); setStatus('') },
                onCancel: () => { setPicked(null); setNote(''); setStatus('') },
                onToggle: () => setOpen(!open),
                onRemove: (index: number) => setPending(pending.filter((_, at) => at !== index)),
              },
              { document },
            )
          : null,
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
      // The transcript fold is parked, and this is the second time for a reason worth writing down.
      //
      // It worked as a static pass. Started from `apply` it watches the whole document and, per change, runs a
      // selector over every div/p/span and a subtree scan per match; a streaming conversation changes the DOM many
      // times a second, so the scan ran continuously and the conversation container stopped responding.
      //
      // To bring it back: scope the scan to a message container instead of the document, run it once per sent
      // message rather than per mutation, and never from an interval. Until then the block stays visible in the
      // bubble, which is what the host itself renders and costs nothing.
      void startTranscriptDecoration
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
