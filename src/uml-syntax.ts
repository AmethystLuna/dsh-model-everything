
/**
 * The notation syntax engine.
 *
 * One place knows what Mermaid and PlantUML can spell, which UML 2.5 diagram type a
 * piece of text is, and whether a requested (notation, family, action) cell exists at
 * all. Family modules know what to do with the elements this engine finds.
 *
 * Before this module, detection fell through: any PlantUML text that was not a
 * sequence diagram went to the state parser. A use case diagram drawn with
 * `:Actor: --> (UseCase)` came back as a state machine with no finding, which is
 * the false guarantee this plugin exists to prevent. Detection is now total. A text
 * either names a family this engine knows, or it is refused by name.
 *
 * What lives here:
 *   - the notation table: comment prefixes, headers, chrome and edge operators;
 *   - the family table: all fourteen UML 2.5 diagram types, their group, and what each
 *     notation can express for them;
 *   - the capability decision: (notation, family, action) -> supported | refusal,
 *     separate from whether this build implements the family (that is the registry's
 *     job, in `uml.ts`);
 *   - notation-agnostic lexical primitives: directives, line scanning, edge splitting,
 *     identifier and label rules.
 *
 * What deliberately does not live here: family semantics. A family module turns the
 * elements this engine finds into its own model, renders that model back, and reviews
 * it. `uml-usecase.ts` is the first such module. The machine families (state,
 * activity) and the trace family (sequence) predate the module contract and keep their
 * own path in `uml.ts`.
 *
 * @module model-everything-uml-syntax
 */

/**
 * A UML front-end refusal. `code` lets the tool report *why* it refused instead
 * of collapsing every refusal into a generic input error.
 */
export class UmlError extends Error {
  readonly code: string

  constructor(message: string, code = 'UML_INPUT') {
    super(message)
    this.code = code
  }
}

// ---------------------------------------------------------------------------
// Notations
// ---------------------------------------------------------------------------

export type UmlNotation = 'mermaid' | 'plantuml'

export const UML_NOTATIONS: readonly UmlNotation[] = ['mermaid', 'plantuml']

export function isUmlNotation(value: unknown): value is UmlNotation {
  return typeof value === 'string' && (UML_NOTATIONS as readonly string[]).includes(value)
}

/** Mermaid node ids that cannot stand alone; the renderer aliases around them. */
export const MERMAID_RESERVED_NODE_IDS: ReadonlySet<string> = new Set(['end', 'graph', 'subgraph', 'class', 'classDef', 'click', 'style', 'linkStyle', 'direction'])

/** Ids a notation can spell without an alias. */
export const UML_PLAIN_ID = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Characters that would break a generated label, whichever notation is used. */
export const UML_UNSAFE_LABEL = /[[\]/\n\r\t]/

/** The comment prefix each notation uses for its dsh-model-everything: directives. */
export function commentPrefix(notation: UmlNotation): string {
  return notation === 'mermaid' ? '%%' : "'"
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${{}()|[\]\\]/g, '\\$&')
}

// ---------------------------------------------------------------------------
// Families: the fourteen UML 2.5 diagram types
// ---------------------------------------------------------------------------

export type UmlFamilyId =
  | 'state'
  | 'activity'
  | 'sequence'
  | 'use-case'
  | 'class'
  | 'object'
  | 'package'
  | 'component'
  | 'composite-structure'
  | 'deployment'
  | 'profile'
  | 'communication'
  | 'interaction-overview'
  | 'timing'

/**
 * How faithfully a notation expresses one UML diagram type.
 *
 * - `faithful`: the notation models this diagram type; a parse reconstructs it.
 * - `approximate`: the notation can draw something in this area, but reading it
 *   back would produce a model of a *different* diagram. Rendering is allowed with a
 *   warning; parsing is refused.
 * - `none`: the notation has no view of this diagram type at all.
 */
export type UmlFidelity = 'faithful' | 'approximate' | 'none'

export interface UmlNotationSupport {
  fidelity: UmlFidelity
  /** Header keywords that declare the family outright (Mermaid: `classDiagram`). */
  headers?: readonly string[]
  /** Declaration keywords the family owns (PlantUML: `actor`, `usecase`). */
  declarations?: readonly string[]
  /** Why the fidelity is what it is, in the words the refusal uses. */
  note?: string
}

export interface UmlFamilySpec {
  id: UmlFamilyId
  /** English name of the UML 2.5 diagram type. */
  name: string
  /** Chinese name, for the bilingual documentation. */
  nameZh: string
  group: 'structure' | 'behaviour' | 'interaction'
  /**
   * True when a faithful parse of this family is a LogicModelV1 the verification
   * engine can run. False for every structure family and for the trace families.
   */
  machine: boolean
  /**
   * False when a parse could not reconstruct the diagram even in a faithful notation.
   * A sequence diagram is a trace: it shows the paths that were walked, not the
   * branches that were not.
   */
  parseable: boolean
  /** Why a parse is refused, when `parseable` is false. */
  parseRefusal?: string
  /** Code the parse refusal carries; defaults to `UML_NOT_A_STATE_DIAGRAM`. */
  parseRefusalCode?: string
  mermaid?: UmlNotationSupport
  plantuml?: UmlNotationSupport
}

const PLANTUML_ACTIVITY_NOTE = 'plantuml has no faithful activity view here (its activity syntax is a structured flowchart language; a graph with merges or cycles needs a while/if reconstruction this plugin does not perform) — use notation "mermaid" for the activity view, or diagram "state"'

const SEQUENCE_PARSE_REFUSAL = 'a sequence diagram is a trace, not a machine: parsing it would drop every branch the trace did not walk. Render diagram "state" or "activity" and parse that instead.'

/**
 * The family table. Order matters twice: a Mermaid header is matched in this order,
 * and a PlantUML declaration keyword is too. The machine families come first because
 * their headers are the most specific.
 */
export const UML_FAMILIES: readonly UmlFamilySpec[] = [
  {
    id: 'state', name: 'state machine diagram', nameZh: '状态机图', group: 'behaviour', machine: true, parseable: true,
    mermaid: { fidelity: 'faithful', headers: ['stateDiagram-v2', 'stateDiagram'] },
    plantuml: { fidelity: 'faithful', declarations: ['state'] },
  },
  {
    id: 'activity', name: 'activity diagram', nameZh: '活动图', group: 'behaviour', machine: true, parseable: true,
    mermaid: { fidelity: 'faithful', headers: ['flowchart', 'graph'] },
    plantuml: {
      // The syntax exists, the faithful view does not: a structured flowchart cannot
      // carry a graph with merges or cycles, so this cell is refused both ways.
      fidelity: 'none',
      declarations: ['start', 'stop', 'end', 'if', 'else', 'elseif', 'endif', 'while', 'endwhile', 'repeat', 'repeatwhile', 'fork', 'split', 'partition'],
      note: PLANTUML_ACTIVITY_NOTE,
    },
  },
  {
    id: 'sequence', name: 'sequence diagram', nameZh: '顺序图', group: 'interaction', machine: false, parseable: false,
    parseRefusal: SEQUENCE_PARSE_REFUSAL, parseRefusalCode: 'UML_NOT_A_STATE_DIAGRAM',
    mermaid: { fidelity: 'faithful', headers: ['sequenceDiagram'] },
    plantuml: { fidelity: 'faithful', declarations: ['participant', 'boundary', 'control', 'entity', 'database', 'collections', 'queue'] },
  },
  {
    id: 'use-case', name: 'use case diagram', nameZh: '用例图', group: 'behaviour', machine: false, parseable: true,
    plantuml: { fidelity: 'faithful', declarations: ['usecase', 'actor'] },
    mermaid: {
      fidelity: 'approximate',
      headers: ['usecase-beta'],
      note: 'mermaid draws a use case diagram with usecase-beta (Mermaid 12+): actors, a system boundary, associations, include and extend. This build renders that view; reading it back is not implemented yet, so a parse stays in plantuml. Render it with notation "plantuml" for the round trip.',
    },
  },
  {
    id: 'class', name: 'class diagram', nameZh: '类图', group: 'structure', machine: false, parseable: true,
    mermaid: { fidelity: 'faithful', headers: ['classDiagram'] },
    plantuml: { fidelity: 'faithful', declarations: ['class', 'interface', 'enum', 'enumeration', 'abstract', 'annotation', 'struct', 'protocol', 'exception', 'metaclass', 'stereotype'] },
  },
  {
    id: 'object', name: 'object diagram', nameZh: '对象图', group: 'structure', machine: false, parseable: true,
    plantuml: { fidelity: 'faithful', declarations: ['object'] },
    mermaid: { fidelity: 'none', note: 'mermaid has no object diagram: classDiagram draws classifiers, not instances. Render it with notation "plantuml".' },
  },
  {
    id: 'package', name: 'package diagram', nameZh: '包图', group: 'structure', machine: false, parseable: true,
    plantuml: { fidelity: 'faithful', declarations: ['package', 'namespace', 'folder', 'frame', 'module'] },
    mermaid: { fidelity: 'none', note: 'mermaid has no package diagram. Render it with notation "plantuml", or review the same text as a dependency graph with uml_structure_verify.' },
  },
  {
    id: 'component', name: 'component diagram', nameZh: '组件图', group: 'structure', machine: false, parseable: true,
    plantuml: { fidelity: 'faithful', declarations: ['component', 'componentDiagram', 'artifact', 'boundary', 'control', 'entity', 'agent', 'circle', 'hexagon', 'label'] },
    mermaid: { fidelity: 'none', note: 'mermaid architecture-beta draws a cloud architecture, not UML components: the shapes and the ports do not line up, and this build does not emit it under the component name. Render it with notation "plantuml".' },
  },
  {
    id: 'composite-structure', name: 'composite structure diagram', nameZh: '复合结构图', group: 'structure', machine: false, parseable: true,
    plantuml: { fidelity: 'approximate', declarations: ['port', 'portin', 'portout'], note: 'plantuml draws parts and ports inside a component or a class, not the full composite structure notation (no collaboration, no connector roles). The view is kept as an approximation: it is rendered, never parsed back.' },
    mermaid: { fidelity: 'none', note: 'mermaid has no composite structure diagram. Render it with notation "plantuml".' },
  },
  {
    id: 'deployment', name: 'deployment diagram', nameZh: '部署图', group: 'structure', machine: false, parseable: true,
    plantuml: { fidelity: 'faithful', declarations: ['node', 'deployment', 'database', 'storage', 'cloud', 'stack'] },
    mermaid: { fidelity: 'none', note: 'mermaid architecture-beta draws a service topology, not UML deployment nodes and artifacts, and this build does not emit it under the deployment name. Render it with notation "plantuml".' },
  },
  {
    id: 'profile', name: 'profile diagram', nameZh: 'Profile 图', group: 'structure', machine: false, parseable: true,
    plantuml: { fidelity: 'approximate', declarations: ['stereotype'], note: 'plantuml draws a profile as a class diagram carrying stereotype and metaclass markers; the extension and the profile application are not spelled. The view is rendered as an approximation and never parsed back.' },
    mermaid: { fidelity: 'none', note: 'mermaid has no profile diagram. Render it with notation "plantuml".' },
  },
  {
    id: 'communication', name: 'communication diagram', nameZh: '通信图', group: 'interaction', machine: false, parseable: false,
    parseRefusal: 'a communication diagram is a set of linked objects with numbered messages; neither notation spells the numbering or the link roles, so a parse would invent an order the diagram does not carry.',
    mermaid: { fidelity: 'none', note: 'mermaid has no communication diagram. Model the same interaction as a sequence diagram and verify the machine that drives it.' },
    plantuml: { fidelity: 'none', note: 'plantuml has no communication diagram: it has no numbered message labels and no link roles. Model the same interaction as a sequence diagram, or keep the object links as a component diagram.' },
  },
  {
    id: 'interaction-overview', name: 'interaction overview diagram', nameZh: '交互概览图', group: 'interaction', machine: false, parseable: false,
    parseRefusal: 'an interaction overview diagram is an activity graph whose nodes are interactions; neither notation spells the inline interaction references, so a parse would produce a flow whose nodes are not the interactions the diagram names.',
    mermaid: { fidelity: 'none', note: 'mermaid has no interaction overview diagram. Keep the overview as a flowchart and the interactions as sequence diagrams.' },
    plantuml: { fidelity: 'none', note: 'plantuml has no interaction overview diagram: ref and group fragments inside a sequence diagram are not an activity graph. Keep the overview as an activity diagram and the interactions as sequence diagrams.' },
  },
  {
    id: 'timing', name: 'timing diagram', nameZh: '定时图', group: 'interaction', machine: false, parseable: true,
    plantuml: { fidelity: 'faithful', declarations: ['robust', 'concise', 'binary', 'clock'] },
    mermaid: { fidelity: 'none', note: 'mermaid has no timing diagram. Render it with notation "plantuml", or model the deadline as a LogicModelV1 with maxTicks and tickEvents and let model_verify check it.' },
  },
]

export const UML_FAMILY_IDS: readonly UmlFamilyId[] = UML_FAMILIES.map((family) => family.id)

export function isUmlFamilyId(value: unknown): value is UmlFamilyId {
  return typeof value === 'string' && (UML_FAMILY_IDS as readonly string[]).includes(value)
}

export function umlFamilySpec(id: UmlFamilyId): UmlFamilySpec {
  const spec = UML_FAMILIES.find((family) => family.id === id)
  if (spec === undefined) throw new UmlError('unknown diagram family "' + String(id) + '"; expected ' + UML_FAMILY_IDS.join(' | '))
  return spec
}

/** What one notation can do with one family. `none` when the table says nothing. */
export function umlNotationSupport(notation: UmlNotation, family: UmlFamilyId): UmlNotationSupport {
  const spec = umlFamilySpec(family)
  const support = notation === 'mermaid' ? spec.mermaid : spec.plantuml
  return support ?? {
    fidelity: 'none',
    note: notation + ' has no ' + spec.name + ': there is no view to render and no text to read back.',
  }
}

// ---------------------------------------------------------------------------
// Mermaid families that are not UML at all
// ---------------------------------------------------------------------------

/**
 * Mermaid headers that name something other than a UML diagram type. Recognizing them
 * matters: the text must not be reported as "cannot tell whether this is Mermaid or
 * PlantUML", and it must not be parsed as a state diagram, whose every line would be
 * ignored or misread. ER, gantt, mindmap and the C4 family are not UML 2.5 diagrams.
 */
export const FOREIGN_MERMAID_FAMILIES: readonly string[] = [
  'erDiagram', 'gantt', 'pie', 'journey', 'mindmap', 'gitGraph',
  'C4Context', 'C4Container', 'C4Component', 'C4Dynamic', 'C4Deployment',
  'requirementDiagram', 'timeline', 'quadrantChart', 'sankey-beta', 'block-beta',
  'packet-beta', 'radar-beta', 'treemap-beta', 'xychart-beta',
]

/** The non-UML Mermaid family this text declares, if any. */
export function foreignMermaidFamily(text: string): string | undefined {
  for (const family of FOREIGN_MERMAID_FAMILIES) {
    if (new RegExp('^\\s*' + escapeRegExp(family) + '\\b', 'm').test(text)) return family
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Every Mermaid header this engine knows, for the "expected one of" message. */
export function mermaidHeaderList(): string {
  const headers: string[] = []
  for (const spec of UML_FAMILIES) for (const header of spec.mermaid?.headers ?? []) headers.push('`' + header + '`')
  for (const family of FOREIGN_MERMAID_FAMILIES) headers.push('`' + family + '`')
  return headers.join(' / ')
}

export function detectUmlNotation(text: string): UmlNotation {
  if (/^\s*@start/m.test(text)) return 'plantuml'
  for (const spec of UML_FAMILIES) {
    for (const header of spec.mermaid?.headers ?? []) {
      if (new RegExp('^\\s*' + escapeRegExp(header) + '\\b', 'm').test(text)) return 'mermaid'
    }
  }
  // A known Mermaid family is still Mermaid: say so, and let family detection refuse
  // it by name instead of blaming the notation.
  if (foreignMermaidFamily(text) !== undefined) return 'mermaid'
  throw new UmlError('cannot tell whether this is Mermaid or PlantUML text: expected ' + mermaidHeaderList() + ', or `@startuml`')
}

export interface UmlFamilyDetection {
  family: UmlFamilyId
  /** The header or keyword that decided it, for the report. */
  evidence: string
}

/** A Mermaid header: the most specific evidence there is. */
function mermaidHeader(text: string): UmlFamilyDetection | undefined {
  for (const spec of UML_FAMILIES) {
    for (const header of spec.mermaid?.headers ?? []) {
      if (new RegExp('^\\s*' + escapeRegExp(header) + '\\b', 'm').test(text)) return { family: spec.id, evidence: header }
    }
  }
  return undefined
}

function plantumlDeclaration(text: string, family: UmlFamilyId): string | undefined {
  for (const keyword of umlFamilySpec(family).plantuml?.declarations ?? []) {
    if (new RegExp('^\\s*' + escapeRegExp(keyword) + '\\b', 'im').test(text)) return keyword
  }
  return undefined
}

/**
 * Use case syntax that carries no keyword: `:Actor:`, `(UseCase)`, and either of them
 * with a relation on the same line (`:User: --> (Login)`). The node reference has to be
 * recognized inside the relation line too, or the most common hand-written form would
 * fall through to the state parser - which is the defect this engine exists to fix.
 */
const PLANTUML_ACTOR_REF = /^\s*:[^:\n]+:(?:\s+as\s+[A-Za-z_][A-Za-z0-9_]*)?\s*(?:$|<\|--|--\|>|\.\.>|\.>|-->|->|--)/
const PLANTUML_USE_CASE_REF = /^\s*\([^()\n]+\)(?:\s+as\s+\(?[^()\n]+\)?)?\s*(?:$|<\|--|--\|>|\.\.>|\.>|-->|->|--)/

export function plantumlUseCaseSyntax(text: string): boolean {
  return text.split(/\r?\n/).some((line) => PLANTUML_ACTOR_REF.test(line) || PLANTUML_USE_CASE_REF.test(line))
}

/** PlantUML timing syntax: a declared timeline, or a tick. */
const PLANTUML_TIMING_LINE = /^\s*(?:@\d+|\d+\s+is\s+|(?:robust|concise|binary|clock)\s+)/

export function plantumlTimingSyntax(text: string): boolean {
  return text.split(/\r?\n/).some((line) => PLANTUML_TIMING_LINE.test(line))
}

/** Profile markers: a profile is drawn as a class diagram carrying these stereotypes. */
const PLANTUML_PROFILE_MARKER = /<<\s*(stereotype|metaclass)\s*>>/i

function sequenceMarkers(text: string): boolean {
  return /^\s*participant\b/m.test(text) || /->>\s*/.test(text)
}

export interface UmlDetectOptions {
  /** The family a `dsh-model-everything:uml` directive declared, when the text carries one. */
  hint?: UmlFamilyId
}

/**
 * Which UML diagram type this text is, in this notation.
 *
 * Total by construction: every branch either names a family or throws. A foreign
 * Mermaid family (ER, gantt, mindmap, C4, ...) is refused by name, so the caller can
 * report *what* the text is instead of blaming the notation.
 */
export function detectUmlFamily(text: string, notation: UmlNotation, options: UmlDetectOptions = {}): UmlFamilyDetection {
  if (options.hint !== undefined) return { family: options.hint, evidence: 'dsh-model-everything: directive' }

  if (notation === 'mermaid') {
    const header = mermaidHeader(text)
    if (header !== undefined) return header
    const foreign = foreignMermaidFamily(text)
    if (foreign !== undefined) {
      throw new UmlError('`' + foreign + '` is not a UML diagram type: this plugin models the UML 2.5 diagram families, so this text cannot be read into one of them. Discarded: ' + foreign + ' x1. Render the diagram you mean with uml action=render and keep this one as its own view.', 'UML_NOT_A_STATE_DIAGRAM')
    }
    throw new UmlError('cannot tell which UML diagram type this Mermaid text declares: expected a header such as ' + mermaidHeaderList())
  }

  // PlantUML declares most families by a keyword, and a few by their syntax alone.
  // The keyword-free syntaxes come first: a use case diagram has no header at all.
  if (plantumlUseCaseSyntax(text)) return { family: 'use-case', evidence: 'use case syntax (:Actor: / (UseCase))' }
  if (PLANTUML_PROFILE_MARKER.test(text)) return { family: 'profile', evidence: 'profile marker (stereotype / metaclass)' }
  if (plantumlTimingSyntax(text)) return { family: 'timing', evidence: 'timing syntax (robust/concise/binary/clock or @tick)' }

  // Declaration keywords, most specific family first. component before package
  // matters: a component diagram may contain packages, and the component is the topic.
  const order: readonly UmlFamilyId[] = ['class', 'object', 'component', 'deployment', 'package', 'sequence', 'activity']
  for (const family of order) {
    const keyword = plantumlDeclaration(text, family)
    if (keyword === undefined) continue
    // actor and database are lifelines in a sequence diagram: the sequence markers
    // win when both are present.
    if (family !== 'sequence' && sequenceMarkers(text)) return { family: 'sequence', evidence: 'sequence markers (participant / ->>)' }
    return { family, evidence: 'declaration: ' + keyword }
  }
  if (sequenceMarkers(text)) return { family: 'sequence', evidence: 'sequence markers (participant / ->>)' }

  // PlantUML state diagrams declare no kind: [*] --> A is the whole header. That is the
  // default, and it is now reached only after every other family said no.
  return { family: 'state', evidence: 'state syntax ([*], state, -->)' }
}

// ---------------------------------------------------------------------------
// Capability
// ---------------------------------------------------------------------------

/** The four actions the UML front end offers. */
export type UmlIntentAction = 'render' | 'parse' | 'review' | 'labels'

export type UmlCapability =
  | { ok: true; warning?: string }
  | { ok: false; errorCode: string; message: string }

/**
 * Whether this (notation, family, action) cell exists.
 *
 * This is the notation's answer, not this build's: a family the table says is faithful
 * is still refused when no module implements it, and that refusal belongs to the
 * registry (see `uml.ts`). Keeping the two apart is what lets the engine document
 * all fourteen diagram types while the implementation lands family by family.
 */
export function umlCapability(notation: UmlNotation, family: UmlFamilyId, action: UmlIntentAction): UmlCapability {
  if (!isUmlNotation(notation)) {
    return { ok: false, errorCode: 'UML_INPUT', message: 'unknown notation "' + String(notation) + '"; expected ' + UML_NOTATIONS.join(' | ') }
  }
  if (!isUmlFamilyId(family)) {
    return { ok: false, errorCode: 'UML_INPUT', message: 'unknown diagram "' + String(family) + '"; expected ' + UML_FAMILY_IDS.join(' | ') }
  }
  if (action === 'labels') return { ok: true }
  const spec = umlFamilySpec(family)
  const support = umlNotationSupport(notation, family)

  if (action === 'render') {
    if (support.fidelity === 'none') {
      return { ok: false, errorCode: 'UML_VIEW_UNREPRESENTABLE', message: support.note ?? (notation + ' cannot draw a ' + spec.name) }
    }
    if (support.fidelity === 'approximate') {
      return { ok: true, warning: 'UML_RENDER_APPROXIMATE_VIEW: ' + (support.note ?? (notation + ' draws an approximation of a ' + spec.name)) }
    }
    return { ok: true }
  }

  if (!spec.parseable) {
    return { ok: false, errorCode: spec.parseRefusalCode ?? 'UML_NOT_A_STATE_DIAGRAM', message: spec.parseRefusal ?? ('a ' + spec.name + ' cannot be read back into a model') }
  }
  if (support.fidelity !== 'faithful') {
    if (support.fidelity === 'none') return { ok: false, errorCode: 'UML_VIEW_UNREPRESENTABLE', message: support.note ?? (notation + ' cannot draw a ' + spec.name) }
    return {
      ok: false,
      errorCode: 'UML_VIEW_UNREPRESENTABLE',
      message: 'reading a ' + spec.name + ' back out of ' + notation + ' would produce a model of a different diagram: ' + (support.note ?? 'the notation only approximates it') + ' Render the diagram instead, and keep the model in the form the notation can carry.',
    }
  }
  return { ok: true }
}

/** `umlCapability`, as a throw. */
export function assertUmlCapability(notation: UmlNotation, family: UmlFamilyId, action: UmlIntentAction): UmlCapability {
  const capability = umlCapability(notation, family, action)
  if (!capability.ok) throw new UmlError(capability.message, capability.errorCode)
  return capability
}

// ---------------------------------------------------------------------------
// Family modules
// ---------------------------------------------------------------------------

export interface UmlFamilyParse<Model> {
  model: Model
  /** Display labels found in the diagram, keyed by element id. */
  labels: Record<string, string>
  warnings: string[]
  /** Declarations the parser could not represent, with the line that carried them. */
  discardedConstructs: Array<{ construct: string; line: number; text: string }>
  discardedEdges: number
}

export interface UmlFamilyRenderOptions {
  /** Cap on a trace length, for the families that render one. */
  maxSteps: number
}

export interface UmlFamilyRender {
  primary: string
  warnings: string[]
}

export interface UmlFamilyFinding {
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
  detail?: string
  evidence?: Record<string, unknown>
}

/**
 * What a family module must provide. The engine finds the elements; the module gives
 * them meaning, draws them back, and says what a reader would get wrong.
 */
export interface UmlFamilyModule<Model> {
  id: UmlFamilyId
  render(input: unknown, notation: UmlNotation, options: UmlFamilyRenderOptions): UmlFamilyRender
  parse(text: string, notation: UmlNotation): UmlFamilyParse<Model>
  /** Family findings for the review: what the diagram itself gets wrong. */
  review?(model: Model, labels: Record<string, string>, notation: UmlNotation): UmlFamilyFinding[]
}

// ---------------------------------------------------------------------------
// Directives
// ---------------------------------------------------------------------------

/** Marker every generated diagram carries; renderers ignore it, the parser uses it. */
export const DIRECTIVE_NAMESPACE = 'dsh-model-everything:'

/** The directive body of a comment line, or null when the line is not a directive. */
export function directiveBody(line: string, notation: UmlNotation): string | null {
  const prefix = commentPrefix(notation)
  const trimmed = line.trim()
  if (!trimmed.startsWith(prefix)) return null
  const body = trimmed.slice(prefix.length).trim()
  if (!body.startsWith(DIRECTIVE_NAMESPACE)) return null
  return body.slice(DIRECTIVE_NAMESPACE.length)
}

/** One directive line, in the notation's own comment syntax. */
export function directiveLine(notation: UmlNotation, text: string): string {
  return commentPrefix(notation) + DIRECTIVE_NAMESPACE + text
}

export interface UmlDirectives {
  /** What the `uml v1` header declared, when it carried one. */
  declared: { notation?: string; family?: string; diagram?: string }
  /** Every other directive, keyed by its first word, values in file order. */
  values: Map<string, string[]>
  /** The lines that are not directives. */
  body: string[]
}

/**
 * Read the `dsh-model-everything:` directives out of a diagram.
 *
 * `diagram=` is the pre-family spelling and is still read: a file rendered by an
 * earlier version must parse the same way it did.
 */
export function readUmlDirectives(lines: readonly string[], notation: UmlNotation): UmlDirectives {
  const declared: UmlDirectives['declared'] = {}
  const values = new Map<string, string[]>()
  const body: string[] = []
  for (const line of lines) {
    const text = directiveBody(line, notation)
    if (text === null) { body.push(line); continue }
    if (text.startsWith('uml ')) {
      const notationMatch = /notation=([a-z]+)/.exec(text)
      const familyMatch = /family=([a-z-]+)/.exec(text)
      const diagramMatch = /diagram=([a-z-]+)/.exec(text)
      if (notationMatch !== null) declared.notation = notationMatch[1]
      if (familyMatch !== null) declared.family = familyMatch[1]
      if (diagramMatch !== null) declared.diagram = diagramMatch[1]
      continue
    }
    const split = text.indexOf(' ')
    const key = split < 0 ? text.trim() : text.slice(0, split).trim()
    const value = split < 0 ? '' : text.slice(split + 1).trim()
    if (key === '') continue
    const list = values.get(key)
    if (list === undefined) values.set(key, [value])
    else list.push(value)
  }
  return { declared, values, body }
}

/** The family a rendered diagram declares, in either spelling. */
export function declaredFamily(directives: UmlDirectives): UmlFamilyId | undefined {
  const raw = directives.declared.family ?? directives.declared.diagram
  if (raw === undefined) return undefined
  return isUmlFamilyId(raw) ? raw : undefined
}

// ---------------------------------------------------------------------------
// Scanning
// ---------------------------------------------------------------------------

export interface UmlSourceLine {
  /** 1-based line number in the source text. */
  number: number
  /** The line, trimmed. */
  text: string
}

/**
 * The content lines of a diagram: blank lines, comments and notation chrome removed,
 * each with its source line number. Chrome is what a renderer needs and a reader does
 * not: `@startuml`, `@enduml`, `direction`, `classDef`, `skinparam`,
 * `scale`, `title`, `hide` and `autonumber`.
 */
export function umlSourceLines(text: string, notation: UmlNotation, skip?: RegExp): UmlSourceLine[] {
  const chrome = notation === 'mermaid'
    ? /^(classDef|class|style|linkStyle|click|direction|accTitle|accDescr)\b/
    : /^(@startuml|@enduml|scale|skinparam|title|hide|autonumber|!theme|left to right direction|top to bottom direction)\b/
  const out: UmlSourceLine[] = []
  const lines = text.split(/\r?\n/)
  const prefix = commentPrefix(notation)
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim()
    if (trimmed === '') continue
    if (trimmed.startsWith(prefix)) continue
    if (chrome.test(trimmed)) continue
    if (skip !== undefined && skip.test(trimmed)) continue
    out.push({ number: index + 1, text: trimmed })
  }
  return out
}

export interface UmlEdgeSplit {
  from: string
  operator: string
  to: string
  label?: string
}

const MERMAID_EDGE = /^(.*?)\s*(<\|--|--\|>|\.\.\|>|<\|\.\.|-->>|->>|-->|==>|-\.->|\.\.>|---|--|\.\.)\s*(.*)$/
const PLANTUML_EDGE = /^(.*?)\s*(<\|--|--\|>|\.\.\|>|<\|\.\.|-->|->>|->|\.\.>|\.>|==>|--|==|\.\.|\*--|o--|--\*|--o)\s*(.*)$/

/**
 * Split one line into from / operator / to, with a trailing `: label` separated.
 *
 * The operator tables are the notation's, not the family's: a class diagram writes
 * `A <|-- B` and a use case diagram writes `A --> B` in the same notation, and both
 * come through here. Whether an operator *means* a dependency, an association or a
 * generalization is the family module's call.
 */
export function splitUmlEdge(line: string, notation: UmlNotation): UmlEdgeSplit | undefined {
  const match = (notation === 'mermaid' ? MERMAID_EDGE : PLANTUML_EDGE).exec(line)
  if (match === null) return undefined
  const from = stripEdgeEndpoints(match[1])
  if (from === '') return undefined
  let rest = match[3].trim()
  let label: string | undefined
  const colon = rest.indexOf(':')
  if (colon >= 0) {
    label = rest.slice(colon + 1).trim().replace(/^"|"$/g, '').trim()
    rest = rest.slice(0, colon).trim()
  }
  const to = stripEdgeEndpoints(rest)
  if (to === '') return undefined
  return { from, operator: match[2], to, ...(label === undefined || label === '' ? {} : { label }) }
}

function stripEdgeEndpoints(text: string): string {
  return text.trim().replace(/^["']|["']$/g, '').trim()
}
