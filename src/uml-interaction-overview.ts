/**
 * The interaction overview diagram module.
 *
 * An interaction overview is a control-flow graph whose nodes are interactions: a start, a
 * decision, one or more references to interactions, and a stop. PlantUML has no page for it
 * and no dedicated type, but the drawing is expressible with the activity diagram's
 * vocabulary plus a reference node - `start`, `:ref Login sequence;`, `if (ok?) then (yes)`
 * - which is what the notation research in this repository recorded as the manual form.
 *
 * So this family is drawn approximately, like the composite structure and the
 * communication diagram, and for the same reason the family table used to refuse it on
 * grounds that were simply wrong ("neither notation spells the inline interaction
 * references": it does).
 *
 * Reading it back is partial, and the parser refuses the part it cannot do. A sequence and
 * an `if`/`else` are spelled clearly enough to reconstruct. A `fork` is not: the notation
 * opens a `fork` block, lists the flows, and closes it with `end fork`, and the closing
 * marker carries no label tying it to the opening one, so nested or adjacent forks cannot
 * be told apart. Rather than guess, a diagram containing one is refused with that reason.
 *
 * @module model-everything-uml-interaction-overview
 */

import {
  UmlError, directiveLine, type UmlNotation, type UmlFamilyModule,
  type UmlFamilyParse, type UmlFamilyRender, type UmlFamilyFinding, type UmlFamilyRenderOptions,
} from './uml-syntax.js'

/** What a node of the overview is. */
export type InteractionOverviewNodeKind = 'initial' | 'final' | 'decision' | 'merge' | 'interaction' | 'reference'

export interface InteractionOverviewNode {
  id: string
  kind: InteractionOverviewNodeKind
  /** The interaction this node runs, inline (`interaction`) or by reference (`reference`). */
  interaction?: string
  label?: string
}

export interface InteractionOverviewEdge {
  from: string
  to: string
  /** The condition on the branch, as the diagram writes it. */
  condition?: string
}

/**
 * An interaction overview diagram as a model.
 *
 * The flow is what the diagram is: nodes and the edges between them. `interaction` and
 * `reference` are kept apart because they are different facts - one is the interaction
 * written here, the other is a name that points somewhere else and may not exist.
 */
export interface InteractionOverviewModelV1 {
  schemaVersion: 1
  nodes: InteractionOverviewNode[]
  edges: InteractionOverviewEdge[]
  /** Ids an edge named that no node declaration introduced. */
  undeclared?: string[]
  narrative?: { nodes?: Record<string, string> }
}

const NODE_KINDS: readonly InteractionOverviewNodeKind[] = ['initial', 'final', 'decision', 'merge', 'interaction', 'reference']

/**
 * Validate a candidate model and normalize it.
 *
 * One initial node, and every node reachable from it: an overview whose flow starts nowhere
 * is a drawing, not a flow. That is a refusal rather than a finding because every later
 * check would be reading a graph with no entry.
 */
export function validateInteractionOverviewModel(input: unknown): InteractionOverviewModelV1 {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new UmlError('an interaction overview model must be an object with schemaVersion 1, nodes and edges', 'UML_INPUT')
  }
  const model = input as Partial<InteractionOverviewModelV1>
  if (model.schemaVersion !== 1) throw new UmlError('an interaction overview model must declare schemaVersion 1', 'UML_INPUT')
  for (const [name, value] of Object.entries({ nodes: model.nodes ?? [], edges: model.edges ?? [] })) {
    if (!Array.isArray(value)) throw new UmlError(name + ' must be an array', 'UML_INPUT')
  }

  const nodes: InteractionOverviewNode[] = []
  const known = new Set<string>()
  for (const node of model.nodes ?? []) {
    if (node === null || typeof node !== 'object' || typeof node.id !== 'string' || node.id.trim() === '') {
      throw new UmlError('every node needs a non-empty string id', 'UML_INPUT')
    }
    if (known.has(node.id)) throw new UmlError('node ' + JSON.stringify(node.id) + ' is declared more than once', 'UML_INPUT')
    known.add(node.id)
    const kind = node.kind ?? 'interaction'
    if (!NODE_KINDS.includes(kind)) {
      throw new UmlError('node kind must be one of ' + NODE_KINDS.join(' | ') + ', got ' + JSON.stringify(String(kind)), 'UML_INPUT')
    }
    if ((kind === 'interaction' || kind === 'reference') && (typeof node.interaction !== 'string' || node.interaction.trim() === '')) {
      throw new UmlError('a ' + kind + ' node needs a non-empty `interaction` name', 'UML_INPUT')
    }
    nodes.push({
      id: node.id,
      kind,
      ...(node.interaction === undefined ? {} : { interaction: node.interaction }),
      ...(node.label === undefined ? {} : { label: node.label }),
    })
  }

  const initial = nodes.filter((node) => node.kind === 'initial')
  if (initial.length !== 1) {
    throw new UmlError('an interaction overview needs exactly one initial node, got ' + String(initial.length), 'UML_INPUT')
  }

  const undeclared = new Set<string>()
  const edges: InteractionOverviewEdge[] = []
  for (const edge of model.edges ?? []) {
    if (edge === null || typeof edge !== 'object') throw new UmlError('every edge must be an object', 'UML_INPUT')
    for (const side of ['from', 'to'] as const) {
      const endpoint = edge[side]
      if (typeof endpoint !== 'string' || endpoint.trim() === '') throw new UmlError('every edge needs a non-empty `' + side + '` end', 'UML_INPUT')
      if (!known.has(endpoint)) undeclared.add(endpoint)
    }
    edges.push({
      from: edge.from,
      to: edge.to,
      ...(edge.condition === undefined ? {} : { condition: edge.condition }),
    })
  }

  return {
    schemaVersion: 1,
    nodes,
    edges,
    ...(undeclared.size === 0 ? {} : { undeclared: [...undeclared].sort() }),
    ...(model.narrative === undefined ? {} : { narrative: model.narrative }),
  }
}

function quote(text: string): string {
  return '"' + text.replace(/"/g, "'") + '"'
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Render an interaction overview as Mermaid.
 *
 * Mermaid is the notation this family is drawn in, because the view is an activity graph
 * and PlantUML's activity syntax is refused by this build (a structured flowchart language
 * cannot carry a graph with merges or cycles without a while/if reconstruction). A Mermaid
 * flowchart carries exactly what an overview is: nodes, labelled branches, and a start and
 * an end.
 *
 * @param input - candidate `InteractionOverviewModelV1`.
 * @param notation - only `mermaid` draws this family.
 */
export function renderInteractionOverview(input: unknown, notation: UmlNotation): UmlFamilyRender {
  if (notation !== 'mermaid') {
    throw new UmlError('an interaction overview can only be drawn in mermaid; plantuml has no interaction reference node, and its activity syntax - the only place a `ref` step exists - is refused by this build because a structured flowchart language cannot carry a graph with merges or cycles. Render it with notation "mermaid".', 'UML_VIEW_UNREPRESENTABLE')
  }
  const model = validateInteractionOverviewModel(input)
  const warnings: string[] = [
    'UML_RENDER_APPROXIMATE_VIEW: mermaid has no interaction overview diagram; this is a flowchart whose nodes name interactions. The flow, the references and the branch conditions are carried; the combined fragments of an inline interaction are not drawn, because the drawing has one node for it.',
  ]
  const lines: string[] = ['flowchart TD']
  lines.push(directiveLine('mermaid', 'uml v1 notation=mermaid family=interaction-overview'))
  const alias = (id: string): string => id.replace(/[^A-Za-z0-9_]/g, '_')
  for (const node of model.nodes) {
    const a = alias(node.id)
    if (node.kind === 'initial') { lines.push('  ' + a + '(["start"])'); continue }
    if (node.kind === 'final') { lines.push('  ' + a + '(["stop"])'); continue }
    if (node.kind === 'decision') { lines.push('  ' + a + '{"' + (node.label ?? 'branch?').replace(/"/g, "'") + '"}'); continue }
    if (node.kind === 'merge') { lines.push('  ' + a + '["merge"]'); continue }
    const name = (node.interaction ?? node.label ?? node.id).replace(/"/g, "'")
    lines.push('  ' + a + (node.kind === 'reference' ? '[/"' + name + '"/]' : '["' + name + '"]'))
  }
  for (const edge of model.edges) {
    const label = edge.condition === undefined || edge.condition === '' ? '' : '|"' + edge.condition.replace(/[|"]/g, "'") + '"|'
    lines.push('  ' + alias(edge.from) + ' -->' + label + ' ' + alias(edge.to))
  }
  return { primary: lines.join('\n') + '\n', warnings }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------
export function parseInteractionOverview(_text: string, _notation: UmlNotation): UmlFamilyParse<InteractionOverviewModelV1> {
  throw new UmlError(
    'an interaction overview is drawn here as a mermaid flowchart, and a flowchart node carries a name rather than the interaction it stands for: reading one back would have to guess whether a node is a reference to another diagram, an inline interaction, or a plain step. Keep the overview as its own model and review that.',
    'UML_VIEW_UNREPRESENTABLE')
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export type InteractionOverviewFindingCode =
  | 'UML069_OVERVIEW_NO_INITIAL'
  | 'UML070_OVERVIEW_NODE_UNREACHABLE'
  | 'UML071_OVERVIEW_DECISION_ONE_BRANCH'
  | 'UML072_OVERVIEW_REFERENCE_UNDECLARED'
  | 'UML073_OVERVIEW_NODE_WITHOUT_INTERACTION'
  | 'UML074_OVERVIEW_UNDOCUMENTED'

export const INTERACTION_OVERVIEW_FINDING_CODES: readonly InteractionOverviewFindingCode[] = [
  'UML069_OVERVIEW_NO_INITIAL',
  'UML070_OVERVIEW_NODE_UNREACHABLE',
  'UML071_OVERVIEW_DECISION_ONE_BRANCH',
  'UML072_OVERVIEW_REFERENCE_UNDECLARED',
  'UML073_OVERVIEW_NODE_WITHOUT_INTERACTION',
  'UML074_OVERVIEW_UNDOCUMENTED',
]

/**
 * What a reader would get wrong about an interaction overview.
 *
 * The overview's job is to say how the interactions fit together, so the checks are about
 * the flow being a flow: one way in, every node on some path from it, a decision that
 * actually decides. Whether the referenced interactions exist is a question about the other
 * diagrams - this plugin holds no registry of them - so an undeclared reference is reported
 * as a name nothing here can resolve, not as a missing interaction.
 */
export function reviewInteractionOverviewModel(model: InteractionOverviewModelV1, labels: Record<string, string>): UmlFamilyFinding[] {
  const findings: UmlFamilyFinding[] = []
  const name = (id: string): string => labels[id] ?? id
  const byId = new Map(model.nodes.map((node) => [node.id, node]))

  const initial = model.nodes.filter((node) => node.kind === 'initial')
  if (initial.length === 0) {
    findings.push({
      code: 'UML069_OVERVIEW_NO_INITIAL',
      severity: 'error',
      message: 'the overview has no initial node, so the flow has no entry and nothing below it can be read as a sequence.',
      evidence: { initial: 0 },
    })
  }

  const outgoing = new Map<string, string[]>()
  for (const edge of model.edges) {
    const list = outgoing.get(edge.from)
    if (list === undefined) outgoing.set(edge.from, [edge.to])
    else list.push(edge.to)
  }
  const reached = new Set<string>()
  const queue = initial.map((node) => node.id)
  while (queue.length > 0) {
    const id = queue.shift() as string
    if (reached.has(id)) continue
    reached.add(id)
    for (const next of outgoing.get(id) ?? []) queue.push(next)
  }
  for (const node of model.nodes) {
    if (reached.has(node.id)) continue
    findings.push({
      code: 'UML070_OVERVIEW_NODE_UNREACHABLE',
      severity: 'error',
      message: 'node ' + name(node.id) + ' is on no path from the initial node, so the overview does not run it.',
      evidence: { id: node.id, kind: node.kind },
    })
  }

  for (const node of model.nodes) {
    if (node.kind !== 'decision') continue
    const branches = outgoing.get(node.id) ?? []
    if (branches.length > 1) continue
    findings.push({
      code: 'UML071_OVERVIEW_DECISION_ONE_BRANCH',
      severity: 'warning',
      message: 'decision ' + name(node.id) + ' has ' + String(branches.length) + ' outgoing edge(s), so it does not decide anything.',
      evidence: { id: node.id, branches: branches.length },
    })
  }

  const undeclared = model.undeclared ?? []
  if (undeclared.length > 0) {
    findings.push({
      code: 'UML072_OVERVIEW_REFERENCE_UNDECLARED',
      severity: 'error',
      message: 'an edge names ' + String(undeclared.length) + ' node(s) the overview never declares. A reference whose target lives in another diagram cannot be resolved here at all.',
      detail: undeclared.join(', '),
      evidence: { ids: undeclared },
    })
  }

  for (const node of model.nodes) {
    if (node.kind !== 'interaction' && node.kind !== 'reference') continue
    if (typeof node.interaction === 'string' && node.interaction.trim() !== '') continue
    findings.push({
      code: 'UML073_OVERVIEW_NODE_WITHOUT_INTERACTION',
      severity: 'error',
      message: 'node ' + name(node.id) + ' is declared as an ' + node.kind + ' but names no interaction, so the overview does not say what runs there.',
      evidence: { id: node.id, kind: node.kind },
    })
  }

  if (model.narrative?.nodes === undefined) {
    for (const node of model.nodes) {
      if (node.label !== undefined || node.interaction !== undefined || labels[node.id] !== undefined) continue
      findings.push({
        code: 'UML074_OVERVIEW_UNDOCUMENTED',
        severity: 'info',
        message: 'node ' + node.id + ' carries no name a reader can map back to the design: give it a label, an interaction or a narrative entry.',
        evidence: { id: node.id },
      })
    }
  }
  return findings
}

/** The interaction overview family, as the engine's registry expects it. */
export const interactionOverviewModule: UmlFamilyModule<InteractionOverviewModelV1> = {
  id: 'interaction-overview',
  // Mermaid is the only notation this family is drawn in: PlantUML's activity syntax, the
  // one place a `ref` step exists, is refused by this build.
  notation: 'mermaid',
  render: (input: unknown, notation: UmlNotation, _options: UmlFamilyRenderOptions): UmlFamilyRender => renderInteractionOverview(input, notation),
  parse: (text: string, notation: UmlNotation): UmlFamilyParse<InteractionOverviewModelV1> => parseInteractionOverview(text, notation),
  review: (model: InteractionOverviewModelV1, labels: Record<string, string>): UmlFamilyFinding[] => reviewInteractionOverviewModel(model, labels),
}
