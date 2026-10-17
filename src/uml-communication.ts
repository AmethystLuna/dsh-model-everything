/**
 * The communication diagram module.
 *
 * A communication diagram is a set of lifelines joined by links, with numbered messages
 * travelling along the links. PlantUML has no communication-diagram type - the page is a
 * 404 and the navigation lists none - but the drawing is expressible with the object
 * diagram's vocabulary: objects for the lifelines, arrows for the links, and the sequence
 * number in the arrow's label.
 *
 * That last point is why this family is *not* refused. An earlier version of the family
 * table said neither notation spells the numbering or the link roles, so a parse would
 * invent an order. The numbering is spelled - `C --> O : 1: create` carries both the link
 * and the order - and the renderer writes it back the same way. What the notation cannot
 * say is the *nesting* that a number like `1.1` implies (which message is a nested call of
 * which), so the model keeps the number as the string the diagram wrote and makes no claim
 * about the tree it suggests.
 *
 * @module model-everything-uml-communication
 */

import {
  UmlError, UML_PLAIN_ID, directiveLine, readUmlDirectives, type UmlNotation, type UmlFamilyModule,
  type UmlFamilyParse, type UmlFamilyRender, type UmlFamilyFinding, type UmlFamilyRenderOptions,
} from './uml-syntax.js'

/**
 * A message number as the diagram wrote it: `1`, `2`, `1.1`, `3a`.
 *
 * It is a string, not a number, and the module does not parse its structure. `1.1` reads as
 * a nested call in UML, but that is a claim about the design; the diagram only draws a
 * label, and inventing the call tree from a dotted string would be the sort of guess this
 * plugin refuses to make elsewhere.
 */
export type CommunicationSequence = string

export interface CommunicationLifeline {
  id: string
  label?: string
  /** `:Name` in the drawing is a classifier, `Name` alone is an instance. */
  classifier?: string
}

export interface CommunicationLink {
  from: string
  to: string
  label?: string
}

export interface CommunicationMessage {
  sequence: CommunicationSequence
  from: string
  to: string
  /** The message name and arguments, without the number. */
  label?: string
}

/**
 * A communication diagram as a model.
 *
 * `links` is what the diagram draws between lifelines; a message travels along one. The two
 * are kept apart because a link with no message is a real thing to notice, and so is a
 * message with no link to carry it.
 */
export interface CommunicationModelV1 {
  schemaVersion: 1
  lifelines: CommunicationLifeline[]
  links: CommunicationLink[]
  messages: CommunicationMessage[]
  /** Ids a message or link named that no declaration introduced. */
  undeclared?: string[]
  narrative?: { lifelines?: Record<string, string> }
}

/** The number a message carries, matched at the front of an arrow label. */
const SEQUENCE_PREFIX = /^\s*(\d+(?:\.\d+)*[a-zA-Z]?)\s*:\s*(.*)$/

const OBJECT_DECLARATION = /^object\s+(?:"([^"]*)"|(\S+))(?:\s+as\s+(\S+))?\s*$/i
const ARROW = /^(\S+?)\s*(-->|->|--|\.\.>|\.\.|<--|<-)\s*(\S+?)(?:\s*:\s*(.*))?$/

function quote(text: string): string {
  return '"' + text.replace(/"/g, "'") + '"'
}

/**
 * Validate a candidate model and normalize it.
 *
 * A sequence number must be unique: two messages with the same number is not a style
 * question, it is a diagram whose order has two answers.
 */
export function validateCommunicationModel(input: unknown): CommunicationModelV1 {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new UmlError('a communication model must be an object with schemaVersion 1, lifelines, links and messages', 'UML_INPUT')
  }
  const model = input as Partial<CommunicationModelV1>
  if (model.schemaVersion !== 1) throw new UmlError('a communication model must declare schemaVersion 1', 'UML_INPUT')
  // A model from another family validated here: every list this family reads defaults to empty, so a structure
  // model became "a communication diagram with nothing in it" - it rendered as an empty page, and the review threw
  // a TypeError on `lifelines.length`. The three lists ARE the family, so a model that declares other fields and
  // none of them is not this family's model, and naming both sides is the answer a reader can act on. A model with
  // no fields at all is not a mismatch: it is an empty communication model, which `UML063` reports.
  const declared = Object.keys(model).filter((key) => key !== 'schemaVersion')
  const declaresLists = ['lifelines', 'links', 'messages'].some((key) => (model as Record<string, unknown>)[key] !== undefined)
  if (!declaresLists && declared.length > 0) {
    throw new UmlError(
      'this is not a communication model: a communication diagram is lifelines, links and numbered messages, and this model declares none of them (it declares ' + declared.slice(0, 6).join(', ') + '). Pass the lifelines/links/messages model, or review it as the family it belongs to.',
      'UML041_MODEL_FAMILY_MISMATCH',
    )
  }
  for (const [name, value] of Object.entries({ lifelines: model.lifelines ?? [], links: model.links ?? [], messages: model.messages ?? [] })) {
    if (!Array.isArray(value)) throw new UmlError(name + ' must be an array', 'UML_INPUT')
  }

  const lifelines: CommunicationLifeline[] = []
  const known = new Set<string>()
  for (const lifeline of model.lifelines ?? []) {
    if (lifeline === null || typeof lifeline !== 'object' || typeof lifeline.id !== 'string' || lifeline.id.trim() === '') {
      throw new UmlError('every lifeline needs a non-empty string id', 'UML_INPUT')
    }
    if (known.has(lifeline.id)) throw new UmlError('lifeline ' + quote(lifeline.id) + ' is declared more than once', 'UML_INPUT')
    known.add(lifeline.id)
    lifelines.push({
      id: lifeline.id,
      ...(lifeline.label === undefined ? {} : { label: lifeline.label }),
      ...(lifeline.classifier === undefined ? {} : { classifier: lifeline.classifier }),
    })
  }

  const undeclared = new Set<string>()
  const links: CommunicationLink[] = []
  for (const link of model.links ?? []) {
    if (link === null || typeof link !== 'object') throw new UmlError('every link must be an object', 'UML_INPUT')
    for (const side of ['from', 'to'] as const) {
      const endpoint = link[side]
      if (typeof endpoint !== 'string' || endpoint.trim() === '') throw new UmlError('every link needs a non-empty `' + side + '` end', 'UML_INPUT')
      if (!known.has(endpoint)) undeclared.add(endpoint)
    }
    if (link.from === link.to) throw new UmlError('a link cannot join ' + quote(link.from) + ' to itself', 'UML_INPUT')
    links.push({ from: link.from, to: link.to, ...(link.label === undefined ? {} : { label: link.label }) })
  }

  const messages: CommunicationMessage[] = []
  const sequences = new Map<string, number>()
  for (const message of model.messages ?? []) {
    if (message === null || typeof message !== 'object') throw new UmlError('every message must be an object', 'UML_INPUT')
    if (typeof message.sequence !== 'string' || message.sequence.trim() === '') {
      throw new UmlError('every message needs a sequence number as a non-empty string', 'UML_INPUT')
    }
    const sequence = message.sequence.trim()
    const previous = sequences.get(sequence)
    if (previous !== undefined) {
      throw new UmlError('sequence number ' + quote(sequence) + ' is used twice (message ' + String(previous + 1) + ' and this one): the order of the diagram would have two answers', 'UML_INPUT')
    }
    sequences.set(sequence, messages.length)
    for (const side of ['from', 'to'] as const) {
      const endpoint = message[side]
      if (typeof endpoint !== 'string' || endpoint.trim() === '') throw new UmlError('every message needs a non-empty `' + side + '` end', 'UML_INPUT')
      if (!known.has(endpoint)) undeclared.add(endpoint)
    }
    messages.push({ sequence, from: message.from, to: message.to, ...(message.label === undefined ? {} : { label: message.label }) })
  }

  return {
    schemaVersion: 1,
    lifelines,
    links,
    messages,
    ...(undeclared.size === 0 ? {} : { undeclared: [...undeclared].sort() }),
    ...(model.narrative === undefined ? {} : { narrative: model.narrative }),
  }
}

/** The label a message is drawn with: `1: create`. */
function messageLabel(message: CommunicationMessage): string {
  return message.sequence + ': ' + (message.label ?? '')
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Render a communication diagram as PlantUML.
 *
 * Objects for the lifelines, arrows for the links, and one arrow per message with its
 * number in the label. A message whose lifelines have no declared link is still drawn -
 * the notation allows it - and the review reports it rather than the renderer hiding it.
 *
 * @param input - candidate `CommunicationModelV1`.
 * @param notation - only `plantuml` draws this family.
 */
export function renderCommunication(input: unknown, notation: UmlNotation): UmlFamilyRender {
  if (notation !== 'plantuml') {
    throw new UmlError('a communication diagram can only be drawn in plantuml; mermaid has no lifeline-and-link notation with numbered messages. Render it with notation "plantuml".', 'UML_VIEW_UNREPRESENTABLE')
  }
  const model = validateCommunicationModel(input)
  const warnings: string[] = [
    'UML_RENDER_APPROXIMATE_VIEW: plantuml has no communication diagram type; this is an object-diagram drawing of one. Lifelines, links and the sequence numbers are carried; the nesting a dotted number like 1.1 suggests is not drawn and not claimed.',
  ]
  const lines: string[] = ['@startuml']
  lines.push(directiveLine('plantuml', 'uml v1 notation=plantuml family=communication'))
  for (const lifeline of model.lifelines) {
    const shown = lifeline.classifier === undefined ? quote(lifeline.label ?? lifeline.id) : quote(':' + lifeline.classifier + ':')
    const alias = lifeline.id === lifeline.label || lifeline.label === undefined ? lifeline.id : lifeline.id
    lines.push('object ' + shown + ' as ' + alias)
  }
  for (const link of model.links) {
    lines.push(link.from + ' -- ' + link.to + (link.label === undefined ? '' : ' : ' + link.label))
  }
  for (const message of model.messages) {
    lines.push(message.from + ' --> ' + message.to + ' : ' + messageLabel(message))
  }
  lines.push('@enduml')
  return { primary: lines.join('\n') + '\n', warnings }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Read a communication diagram back into a model.
 *
 * Hand-written text is read the same way the renderer writes it: `object` declarations are
 * the lifelines, `--` arrows are the links, and an arrow whose label starts with a number
 * and a colon is a message. A line that is neither is reported in `discardedConstructs`.
 */
export function parseCommunication(text: string, notation: UmlNotation): UmlFamilyParse<CommunicationModelV1> {
  if (notation !== 'plantuml') {
    throw new UmlError('a communication diagram can only be read from plantuml', 'UML_VIEW_UNREPRESENTABLE')
  }
  const warnings: string[] = []
  const discarded: Array<{ line: number; text: string; construct: string }> = []
  const labels: Record<string, string> = {}
  const lifelines: CommunicationLifeline[] = []
  const links: CommunicationLink[] = []
  const messages: CommunicationMessage[] = []

  const raw = text.split(/\r?\n/)
  for (let index = 0; index < raw.length; index += 1) {
    const line = raw[index].trim()
    if (line === '' || line.startsWith('@')) continue
    if (line.startsWith("'")) {
      // The renderer's directive line is not a construct; a comment is not either.
      continue
    }
    if (/^(left to right direction|top to bottom direction|skinparam|hide|show|title|scale|allowmixing)\b/i.test(line)) {
      discarded.push({ line: index + 1, text: line, construct: line.split(/\s+/)[0].toLowerCase() })
      continue
    }

    const declaration = OBJECT_DECLARATION.exec(line)
    if (declaration !== null) {
      const shown = declaration[1] ?? declaration[2] ?? ''
      const alias = declaration[3]
      const id = alias ?? shown
      const classifier = /^:(.*):$/.exec(shown)
      const entry: CommunicationLifeline = { id }
      if (classifier !== null) entry.classifier = classifier[1]
      else if (shown !== '' && shown !== id) entry.label = shown
      if (lifelines.some((existing) => existing.id === id)) {
        warnings.push('line ' + String(index + 1) + ': lifeline ' + id + ' is declared twice; the second declaration is ignored')
        continue
      }
      lifelines.push(entry)
      if (entry.label !== undefined) labels[id] = entry.label
      continue
    }

    const arrow = ARROW.exec(line)
    if (arrow !== null) {
      const [, from, operator, to, rawLabel] = arrow
      const [left, right] = operator.startsWith('<') ? [to, from] : [from, to]
      const labelText = rawLabel === undefined ? undefined : rawLabel.trim()
      const sequence = labelText === undefined ? null : SEQUENCE_PREFIX.exec(labelText)
      if (operator.includes('>') && sequence !== null) {
        messages.push({ sequence: sequence[1], from: left, to: right, ...(sequence[2] === '' ? {} : { label: sequence[2] }) })
      } else {
        links.push({ from: left, to: right, ...(labelText === undefined || labelText === '' ? {} : { label: labelText }) })
      }
      continue
    }
    discarded.push({ line: index + 1, text: line, construct: 'line this model does not carry' })
  }

  const known = new Set(lifelines.map((lifeline) => lifeline.id))
  const undeclared = [...new Set([...links, ...messages].flatMap((entry) => [entry.from, entry.to]))]
    .filter((endpoint) => !known.has(endpoint))
    .sort()
  const model: CommunicationModelV1 = {
    schemaVersion: 1,
    lifelines,
    links,
    messages,
    ...(undeclared.length === 0 ? {} : { undeclared }),
  }
  return { model, labels, warnings, discardedConstructs: discarded, discardedEdges: 0 }
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export type CommunicationFindingCode =
  | 'UML063_COMMUNICATION_NO_LIFELINES'
  | 'UML064_COMMUNICATION_LIFELINE_UNLINKED'
  | 'UML065_COMMUNICATION_MESSAGE_WITHOUT_LINK'
  | 'UML066_COMMUNICATION_UNDECLARED_ENDPOINT'
  | 'UML067_COMMUNICATION_SEQUENCE_DUPLICATE'
  | 'UML068_COMMUNICATION_UNDOCUMENTED'

export const COMMUNICATION_FINDING_CODES: readonly CommunicationFindingCode[] = [
  'UML063_COMMUNICATION_NO_LIFELINES',
  'UML064_COMMUNICATION_LIFELINE_UNLINKED',
  'UML065_COMMUNICATION_MESSAGE_WITHOUT_LINK',
  'UML066_COMMUNICATION_UNDECLARED_ENDPOINT',
  'UML067_COMMUNICATION_SEQUENCE_DUPLICATE',
  'UML068_COMMUNICATION_UNDOCUMENTED',
]

/** Sequence numbers as they sort: `2` before `10`, `1.1` before `1.2`. */
function sequenceOrder(left: string, right: string): number {
  const parts = (value: string): number[] => value.split('.').map((part) => Number.parseInt(part, 10)).map((part) => (Number.isNaN(part) ? 0 : part))
  const a = parts(left)
  const b = parts(right)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? -1) - (b[index] ?? -1)
    if (difference !== 0) return difference
  }
  return 0
}

/**
 * What a reader would get wrong about a communication diagram.
 *
 * The checks are the ones the diagram exists to answer: is every lifeline reachable, does
 * every message travel a link that was drawn, does any number appear twice, and is each
 * participant named after something in the design. The order the numbers imply is *not*
 * checked against the drawing order - the numbers are the order, and the drawing order is
 * not a claim.
 */
export function reviewCommunicationModel(model: CommunicationModelV1, labels: Record<string, string>): UmlFamilyFinding[] {
  const findings: UmlFamilyFinding[] = []
  const name = (id: string): string => labels[id] ?? id

  if (model.lifelines.length === 0) {
    findings.push({
      code: 'UML063_COMMUNICATION_NO_LIFELINES',
      severity: 'error',
      message: 'the diagram declares no lifeline, so no participant is named and nothing can travel.',
      evidence: { lifelines: 0 },
    })
  }

  const touched = new Set([...model.links, ...model.messages].flatMap((entry) => [entry.from, entry.to]))
  for (const lifeline of model.lifelines) {
    if (touched.has(lifeline.id)) continue
    findings.push({
      code: 'UML064_COMMUNICATION_LIFELINE_UNLINKED',
      severity: 'warning',
      message: 'lifeline ' + name(lifeline.id) + ' takes part in no link and no message, so nothing reaches it.',
      evidence: { id: lifeline.id },
    })
  }

  const linked = new Set(model.links.map((link) => [link.from, link.to].sort().join('\u0000')))
  for (const message of model.messages) {
    if (message.from === message.to) continue
    if (linked.has([message.from, message.to].sort().join('\u0000'))) continue
    findings.push({
      code: 'UML065_COMMUNICATION_MESSAGE_WITHOUT_LINK',
      severity: 'warning',
      message: 'message ' + message.sequence + ' travels from ' + name(message.from) + ' to ' + name(message.to) + ', but the diagram draws no link between them.',
      evidence: { sequence: message.sequence, from: message.from, to: message.to },
    })
  }

  const undeclared = model.undeclared ?? []
  if (undeclared.length > 0) {
    findings.push({
      code: 'UML066_COMMUNICATION_UNDECLARED_ENDPOINT',
      severity: 'error',
      message: 'a link or message names ' + String(undeclared.length) + ' participant(s) the diagram never declares, so the line points at nothing a reader can look up.',
      detail: undeclared.join(', '),
      evidence: { ids: undeclared },
    })
  }

  const seen = new Map<string, number>()
  for (const message of model.messages) {
    const count = (seen.get(message.sequence) ?? 0) + 1
    seen.set(message.sequence, count)
    if (count > 1) {
      findings.push({
        code: 'UML067_COMMUNICATION_SEQUENCE_DUPLICATE',
        severity: 'error',
        message: 'sequence number ' + message.sequence + ' is used more than once, so the order of the diagram has two answers.',
        evidence: { sequence: message.sequence },
      })
    }
  }

  if (model.narrative?.lifelines === undefined) {
    for (const lifeline of model.lifelines) {
      if (lifeline.label !== undefined || lifeline.classifier !== undefined || labels[lifeline.id] !== undefined) continue
      findings.push({
        code: 'UML068_COMMUNICATION_UNDOCUMENTED',
        severity: 'info',
        message: 'lifeline ' + lifeline.id + ' carries no name a reader can map back to the design: give it a display label, a classifier or a narrative entry.',
        evidence: { id: lifeline.id },
      })
    }
  }
  return findings
}

/** The communication family, as the engine's registry expects it. */
export const communicationModule: UmlFamilyModule<CommunicationModelV1> = {
  id: 'communication',
  render: (input: unknown, notation: UmlNotation, _options: UmlFamilyRenderOptions): UmlFamilyRender => renderCommunication(input, notation),
  parse: (text: string, notation: UmlNotation): UmlFamilyParse<CommunicationModelV1> => parseCommunication(text, notation),
  // Validated, not trusted: the review path can hand over the model exactly as the caller wrote it, and every field
  // this family reads is optional. Without this line `model.lifelines.length` is a TypeError on a foreign model -
  // a crash where a review belongs, and one the validator already knows how to explain.
  review: (model: CommunicationModelV1, labels: Record<string, string>): UmlFamilyFinding[] => reviewCommunicationModel(validateCommunicationModel(model), labels),
}

/** Sort two sequence numbers the way a reader reads them: `2` before `10`, `1.1` before `1.2`. */
export { sequenceOrder as communicationSequenceOrder }
