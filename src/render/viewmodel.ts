/**
 * What a tool card shows, reduced to a drawing.
 *
 * The input is what the host hands a settled tool view: the arguments that were sent and the result that
 * came back. Neither is trusted - a view runs during streaming too, when the result does not exist yet -
 * so every field is read defensively and an absent one removes a shape rather than throwing.
 *
 * Pure. Everything decided here is a fact a test can assert: which nodes exist, which edges, why they are
 * coloured the way they are.
 */

export interface DiagramNode {
  id: string
  /** The verdict or severity this node carries, when the report says something about it. */
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

/** A short caption: the verdict, and the first thing that went wrong when there is one. */
function captionOf(report: Record<string, unknown> | undefined): string {
  if (report === undefined) return 'no report yet'
  const verdict = text(report.verdict) ?? 'unknown'
  const findings = array(report.findings).map(record).filter((entry): entry is Record<string, unknown> => entry !== undefined)
  const first = findings.find((finding) => finding.severity === 'error')
  if (first !== undefined) {
    const code = text(first.code) ?? 'error'
    const message = text(first.message) ?? ''
    return verdict + ' — ' + code + (message === '' ? '' : ': ' + message)
  }
  const summary = record(report.summary)
  const errors = typeof summary?.errors === 'number' ? summary.errors : undefined
  return errors === undefined ? verdict : verdict + ' — ' + String(errors) + ' error(s)'
}

/** The states of a `model_verify` argument: a model, or a refused call that carried none. */
function machineOf(args: Record<string, unknown> | undefined): { nodes: DiagramNode[]; edges: DiagramEdge[]; init?: string } | undefined {
  const model = record(args?.model)
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

/**
 * Which nodes the report blames.
 *
 * A finding names a state in its `message` or its `detail` as `"state \"x\""`; matching that is a
 * heuristic, so it only ever *adds* emphasis and never decides the verdict.
 */
function blame(nodes: DiagramNode[], report: Record<string, unknown> | undefined): DiagramNode[] {
  if (report === undefined) return nodes
  const findings = array(report.findings).map(record).filter((entry): entry is Record<string, unknown> => entry !== undefined)
  if (findings.length === 0) return nodes
  const named = new Set<string>()
  for (const finding of findings) {
    for (const field of ['message', 'detail']) {
      const value = text(finding[field])
      if (value === undefined) continue
      for (const node of nodes) {
        if (value.includes('"' + node.id + '"')) named.add(node.id)
      }
    }
  }
  if (named.size === 0) return nodes
  const severity = findings.some((finding) => finding.severity === 'error') ? 'error' : 'warning'
  return nodes.map((node) => (named.has(node.id) ? { ...node, role: severity } : node))
}

export function viewModel(input: { phase?: unknown; args?: unknown; result?: unknown; toolName?: unknown }): Diagram {
  const toolName = text(input.toolName) ?? 'tool'
  const args = record(input.args)
  const report = record(input.result)
  const caption = captionOf(report)
  const machine = machineOf(args)
  if (machine === undefined) {
    return { kind: 'none', title: toolName, nodes: [], edges: [], caption }
  }
  return {
    kind: 'machine',
    title: toolName,
    ...(machine.init === undefined ? {} : { init: machine.init }),
    nodes: blame(machine.nodes, report),
    edges: machine.edges,
    caption,
  }
}
