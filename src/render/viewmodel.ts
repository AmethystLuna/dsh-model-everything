/**
 * What a tool card shows, reduced to a drawing.
 *
 * The input is what the host hands a settled tool view: a phase and a block whose shape differs per phase.
 * A settled call carries the paired call's arguments as a **lazy view** (`PartialArguments`) and the result
 * as content blocks, so nothing here reads `block.args.model`: the view is asked, and the report text is
 * parsed for the two facts a drawing needs. Every reader is total - an absent field removes a shape rather
 * than throwing, because the same view renders during streaming.
 *
 * Pure. Everything decided here is a fact a test can assert: which nodes exist, which edges, why they are
 * coloured the way they are.
 */

export interface DiagramNode {
  id: string
  /** What the report says about this node, when it says anything. */
  role: 'normal' | 'error' | 'warning' | 'muted'
}

export interface DiagramEdge {
  from: string
  to: string
  label: string
}

export interface Diagram {
  kind: 'machine' | 'graph' | 'none'
  /** The state the machine starts in, when the model declared one. */
  init?: string
  title: string
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  /** One line under the drawing: what the report decided, in words the drawing cannot carry. */
  caption: string
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined

const array = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined)

/** The report text a settled call carries, joined: a card reads words, not blocks. */
function reportText(content: unknown): string {
  const parts: string[] = []
  for (const entry of array(content)) {
    const block = record(entry)
    const body = text(block?.text)
    if (body !== undefined) parts.push(body)
  }
  return parts.join(String.fromCharCode(10))
}

/** Two facts out of this plugin's own report format: the verdict, and the first error it named. */
function readReport(content: unknown): { verdict?: string; code?: string; message?: string } {
  const body = reportText(content)
  if (body === '') return {}
  const verdict = /verdict=(\w+)/.exec(body)?.[1]
  const named = /\[error\/([A-Z0-9_]+)\]\s*(.*)/.exec(body)
  if (named !== null) return { verdict, code: named[1], message: named[2] }
  const first = /first error:\s*([A-Z0-9_]+)/.exec(body)
  return first === null ? { verdict } : { verdict, code: first[1] }
}

/**
 * The `model` argument out of the host's lazy arguments view.
 *
 * A settled call exposes `value(key)`; a plain object (a test, or an older shape) is read directly. The
 * view answers `undefined` until the field closes, which is exactly when a drawing should be attempted.
 */
function readModel(args: unknown): Record<string, unknown> | undefined {
  const view = record(args)
  if (view === undefined) return undefined
  const read = view.value
  if (typeof read === 'function') return record((read as (key: string) => unknown)('model'))
  return record(view.model)
}

/** The states of a model: a machine, or nothing when the call carried none. */
function machineOf(model: Record<string, unknown> | undefined): { nodes: DiagramNode[]; edges: DiagramEdge[]; init?: string } | undefined {
  if (model === undefined) return undefined
  const states = array(model.states).map(record).filter((entry): entry is Record<string, unknown> => entry !== undefined && typeof entry.id === 'string')
  if (states.length === 0) return undefined
  const edges = array(model.transitions)
    .map(record)
    .filter((entry): entry is Record<string, unknown> => entry !== undefined && typeof entry.from === 'string' && typeof entry.to === 'string')
    .map((entry) => ({ from: String(entry.from), to: String(entry.to), label: text(entry.event) ?? '' }))
  return {
    nodes: states.map((state) => ({ id: String(state.id), role: 'normal' as const })),
    edges,
    ...(typeof model.init === 'string' ? { init: model.init } : {}),
  }
}

/** The caption: the verdict, then the first error's code and message when the report named one. */
function captionOf(report: { verdict?: string; code?: string; message?: string }): string {
  const verdict = report.verdict ?? 'no report yet'
  if (report.code === undefined) return verdict
  const message = report.message ?? ''
  return verdict + ' — ' + report.code + (message === '' ? '' : ': ' + message)
}

/**
 * Which nodes the report blames.
 *
 * A finding names a state inside its message as `"x"`; matching that is a heuristic, so it only ever *adds*
 * emphasis and never decides the verdict.
 */
function blame(nodes: DiagramNode[], report: { message?: string }): DiagramNode[] {
  if (report.message === undefined) return nodes
  const named = nodes.filter((node) => report.message?.includes('"' + node.id + '"')).map((node) => node.id)
  if (named.length === 0) return nodes
  return nodes.map((node) => (named.includes(node.id) ? { ...node, role: 'error' as const } : node))
}

export interface ViewInput {
  phase?: unknown
  toolName?: unknown
  /** The whole block the host hands a view; its shape depends on the phase. */
  block?: unknown
}

export function viewModel(input: ViewInput): Diagram {
  const block = record(input.block)
  const title = text(block?.name) ?? text(input.toolName) ?? 'tool'
  const report = readReport(block?.content)
  // A shape that still carries a parsed report object is read from there; it is what older callers pass.
  const parsed = record(block?.result)
  const findings = array(parsed?.findings).map(record)
  const firstError = findings.find((finding) => finding?.severity === 'error')
  const merged = {
    verdict: text(parsed?.verdict) ?? report.verdict,
    ...(report.code === undefined && typeof firstError?.code === 'string' ? { code: firstError.code } : { code: report.code }),
    ...(report.message === undefined && typeof firstError?.message === 'string' ? { message: firstError.message } : { message: report.message }),
  }
  const caption = captionOf(merged)
  const machine = machineOf(readModel(block?.args))
  if (machine === undefined) {
    return { kind: 'none', title, nodes: [], edges: [], caption }
  }
  return {
    kind: 'machine',
    title,
    ...(machine.init === undefined ? {} : { init: machine.init }),
    nodes: blame(machine.nodes, merged),
    edges: machine.edges,
    caption,
  }
}
