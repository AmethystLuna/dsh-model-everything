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
  // `->>` is a sequence message: the second chevron is not part of this grammar, and without this the arrow matched a single `>` and
  // left the rest as the right-hand name - a message line became a box called `> B`.
  if (/^>/.test(String(match[5]).trim())) return 'a sequence message (`->>`) is not something this renderer draws'
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

/**
 * The id and label an opening boundary line states. An alias is the id, because edges will name it.
 *
 * A stereotype or a colour written after the name is a decoration on the boundary, not part of what it is called: left in,
 * both ended up in the label and the alias was lost, so the boundary could not be named by an edge or by its own members.
 */
export function boundaryOf(
  declaration: string,
  keyword: string,
  ordinal: number,
): { id: string; label: string; decorations: string[] } {
  const bare = bareName(declaration.slice(keyword.length))
  const rest = bare.name
  const adornment = { decorations: bare.stripped }
  const alias = QUOTED_ALIAS.exec(rest) ?? BRACKET_ALIAS.exec(rest) ?? PLAIN_ALIAS.exec(rest)
  if (alias !== null) return { id: alias[2], label: alias[1], ...adornment }
  const label = rest.replace(/^["']|["']$/g, '')
  return { id: 'group-' + String(ordinal), label: label === '' ? keyword : label, ...adornment }
}

// The element keywords, and the pattern a declaration line is matched against.
export const SHAPES: Record<string, NodeShape> = {
  component: 'rect',
  node: 'rect',
  rectangle: 'rect',
  artifact: 'rect',
  state: 'rect',
  database: 'cylinder',
  // PlantUML draws an entity as a cylinder in a component diagram; `entity` in an ER diagram is a different
  // symbol, and that diagram family is not one this renderer accepts.
  entity: 'cylinder',
  // A use case is an ellipse. The `circle` symbol is written as an ellipse whose radii follow the box, so it
  // reads as the familiar use-case oval; `stadium` is the pill a terminal state is drawn as.
  usecase: 'circle',
  // A note is a rectangle with a folded corner: the fold is what makes it a remark rather than an element.
  note: 'note',
  // A file and a card are the same folded outline on different corners, and a frame puts its name in a tab: the mark
  // is what tells them apart from a component, so each one is drawn rather than reduced to a rectangle.
  file: 'file',
  card: 'card',
  frame: 'frame',
  // The three containers whose mark is a line or a curve on the box itself.
  queue: 'queue',
  stack: 'stack',
  storage: 'storage',
  // Three rectangles whose role is a small mark in the corner.
  boundary: 'boundary',
  control: 'control',
  collections: 'collections',
  // These five are boxes with compartments in PlantUML. The name is the part a component-level view needs, so the
  // box is drawn and the compartments are refused line by line: the element is visible and the source is told what
  // was not carried.
  class: 'rect',
  object: 'rect',
  interface: 'rect',
  enum: 'rect',
  annotation: 'rect',
}
export const SHAPE_KEYWORDS = Object.keys(SHAPES)
export const DECLARED = new RegExp('^(' + SHAPE_KEYWORDS.join('|') + ')\\s+(.+)$')

/**
 * The boxes a `together { }` block names, read from the text before the lines are parsed, plus the lines that name a box
 * without declaring it - `together { a b }` is legal PlantUML, and its members are as real as an arrow's endpoints.
 */
export function togetherGroups(lines: readonly string[]): {
  groups: string[][]
  implicit: Map<number, string>
  /** The lines of `together { }` blocks that name nothing: reported, not swallowed. */
  empty: number[]
  /** The lines of blocks that name one box: a row of one is not a row. */
  oneMember: number[]
} {
  const groups: string[][] = []
  const implicit = new Map<number, string>()
  let open: string[] | undefined
  let depth = 0
  let index = -1
  const empty: number[] = []
  const oneMember: number[] = []
  for (const raw of lines) {
    index += 1
    const line = raw.replace(/'.*$/, '').trim()
    if (line === '') continue
    if (/^together\b/.test(line) && line.endsWith('{')) {
      // A nested block joins the row its parent is collecting: a row of a row is still one row.
      if (open === undefined) {
        open = []
        depth = 0
      } else {
        depth += 1
      }
      continue
    }
    if (open === undefined) continue
    if (line === '}') {
      // A brace that closes something inside the block - a boundary, a nested `together` - is not the block's own end.
      if (open !== undefined && depth > 0) {
        depth -= 1
        continue
      }
      if (open === undefined) continue
      if (open.length > 1) groups.push(open)
      else if (open.length === 1) oneMember.push(index)
      else empty.push(index)
      open = undefined
      continue
    }

    if (line.endsWith('{')) {
      depth += 1
      continue
    }

    const declared = DECLARED.exec(line)
    if (declared === null) {
      // A bare name inside the block names a box; the arrow rules make such a name an element, and so does this.
      if (/^[A-Za-z_][\w.-]*$/.test(line)) {
        open.push(line)
        implicit.set(index, line)
      }
      continue
    }
    const rest = declared[2].trim()
    const quoted = QUOTED_ALIAS.exec(rest)
    const bracketed = BRACKET_ALIAS.exec(rest)
    const plain = PLAIN_ALIAS.exec(rest)
    open.push(quoted !== null ? quoted[2] : bracketed !== null ? bracketed[2] : plain !== null ? plain[2] : reference(rest).id)
  }
  return { groups, implicit, empty, oneMember }
}
