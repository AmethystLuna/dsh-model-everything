/**
 * What an endpoint of a PlantUML line states: a name, the label it carries, and the shape it asks for.
 *
 * A reference is read from one token and needs no drawing - the name with its decorations removed. It lived in the parser because
 * that is where it was first needed, and a unit test cannot reach it there without building a diagram.
 */
import type { EdgeArrow, NodeShape } from './model.js'
import { bareName } from './names.js'

// The declaration forms: a quoted, bracketed or plain alias, and a bracketed name.
export const QUOTED_ALIAS = /^["'](.+?)["']\s+as\s+([A-Za-z_][\w-]*)$/
export const BRACKET_ALIAS = /^\[(.+?)\]\s+as\s+([A-Za-z_][\w-]*)$/
export const PLAIN_ALIAS = /^([A-Za-z_][\w.-]*)\s+as\s+([A-Za-z_][\w-]*)$/
export const BRACKET = /^\[(.+?)\]$/

export interface Reference {
  id: string
  label?: string
  shape?: NodeShape
}

export function reference(token: string): Reference {
  // An endpoint carries decorations the name does not: `a "1" --> "*" b` names two boxes, not two labels.
  const bare = bareName(token)
  let text = bare.name === '' ? token.trim() : bare.name
  if (text === '') text = token.trim()
  const bracket = BRACKET.exec(text)
  if (bracket !== null) {
    const label = bracket[1].trim().replace(/\\n/g, '\n')
    return { id: label, label, shape: 'rect' }
  }
  const quoted = /^["'](.+?)["']$/.exec(text)
  if (quoted !== null) return { id: quoted[1], label: quoted[1].replace(/\\n/g, '\n') }
  return { id: text }
}

// The arrow: a mark at either end, one dash or two, an optional `: label`.
export const ARROW = /^(.+?)\s*(<\|?|[*o])?(-{1,}|\.{1,})(\|?>|[*o])?\s*(.+?)(?:\s*:\s*(.+))?$/

export interface ArrowParts {
  from: Reference
  to: Reference
  label: string
  dashed: boolean
  arrow: EdgeArrow
}

export function readArrow(line: string): ArrowParts | string | undefined {
  const match = ARROW.exec(line)
  if (match === null) return undefined
  const left = reference(match[1])
  const right = reference(match[5])
  const leftMark = match[2]
  const rightMark = match[4]
  const dotted = match[3].startsWith('.')
  const label = (match[6] ?? '').trim()

  if (leftMark !== undefined && rightMark !== undefined) {
    return 'an edge marked at both ends is not one this renderer draws'
  }
  if (leftMark === '*' || leftMark === 'o' || rightMark === '*' || rightMark === 'o') {
    const atRight = rightMark === '*' || rightMark === 'o'
    const mark = atRight ? rightMark : leftMark
    return {
      from: atRight ? right : left,
      to: atRight ? left : right,
      label,
      dashed: dotted,
      arrow: mark === '*' ? 'composition' : 'aggregation',
    }
  }
  if (leftMark !== undefined) {
    return {
      from: right,
      to: left,
      label,
      dashed: dotted,
      arrow: leftMark === '<|' ? (dotted ? 'realization' : 'generalization') : dotted ? 'dependency' : 'association',
    }
  }
  if (rightMark !== undefined) {
    return {
      from: left,
      to: right,
      label,
      dashed: dotted,
      arrow: rightMark === '|>' ? (dotted ? 'realization' : 'generalization') : dotted ? 'dependency' : 'association',
    }
  }
  // No mark at either end: the source states a connection and no direction.
  return { from: left, to: right, label, dashed: dotted, arrow: 'none' }
}
