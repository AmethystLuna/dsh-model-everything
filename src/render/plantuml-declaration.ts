/**
 * A declaration line: the element or elements it states, and what the reader is told about its decorations.
 *
 * `component Api <<service>> #blue` declares one box and reports two decorations. The rules are here rather than in the reading loop
 * because each of them is a question about one line - is this a declaration, which of the four name forms is it, what is decoration -
 * and the loop can only answer such a question by building a diagram.
 */
import type { NodeShape } from './model.js'
import { decorationReason, bareName } from './names.js'
import { BRACKET, BRACKET_ALIAS, DECLARED, PLAIN_ALIAS, QUOTED_ALIAS, SHAPES, reference } from './plantuml-reference.js'

export interface DeclaredElement {
  id: string
  label?: string
  shape: NodeShape
}

export interface Declaration {
  /** The elements the line declares, in the order the line states them. */
  elements: DeclaredElement[]
  /** What the reader is told, in the order the line states it. */
  notes: { channel: 'ignored' | 'refused'; message: string }[]
}

/** `\n` inside a label is a line break, the same one a real newline is. */
const text = (value: string): string => value.replace(/\\n/g, '\n')

/**
 * The declaration a line states, or `undefined` when it states none.
 *
 * A description line (`state S : entry / go`) is a body this renderer does not draw, so it is refused by line rather than folded into
 * the element's name - and it is answered here because it is a declaration that cannot be one.
 */
export function readDeclaration(line: string, where: string): Declaration | undefined {
  // A note is a declarable shape here on purpose: `note "text" as N` and the other forms that reach this function are declared by it,
  // and the pass that places a note beside an element answers those lines before this one. Declining them cost a drawing (K) that had
  // been drawn only because the declaration table knows the shape.
  const described = /^([a-z]+)\s+\S+\s*:\s*\S/.exec(line)
  if (described !== null && SHAPES[described[1] as string] !== undefined) {
    return {
      elements: [],
      notes: [{
        channel: 'refused',
        message: where + '`' + line + '` adds a description line; write a `note` beside the element instead',
      }],
    }
  }

  // `abstract class C` states a class with a modifier this renderer does not draw: the class is drawn and the modifier is reported.
  const abstracted = /^abstract\s+(.+)$/.exec(line)
  if (abstracted !== null) {
    const inner = readDeclaration(abstracted[1] as string, where)
    if (inner !== undefined) {
      return {
        elements: inner.elements,
        notes: [
          { channel: 'ignored', message: where + '`abstract` is a modifier: every element here is drawn the same way' },
          ...inner.notes,
        ],
      }
    }
  }

  const declared = DECLARED.exec(line)
  if (declared !== null) {
    const shape = SHAPES[declared[1] as string] as NodeShape
    // A colour or a stereotype after the name used to stop the alias matching, so the whole line became the element's name.
    const bare = bareName(declared[2] as string)
    const notes = bare.stripped.map((decoration) => ({
      channel: 'ignored' as const,
      message: where + '`' + decoration + '` ' + decorationReason(decoration),
    }))
    const rest = bare.name
    const quoted = QUOTED_ALIAS.exec(rest)
    if (quoted !== null) return { elements: [{ id: quoted[2] as string, label: text(quoted[1] as string), shape }], notes }
    const bracketed = BRACKET_ALIAS.exec(rest)
    if (bracketed !== null) return { elements: [{ id: bracketed[2] as string, label: text(bracketed[1] as string), shape }], notes }
    // `usecase (Login)` is the notation's own spelling: the parentheses are syntax, not part of the name.
    const parenAlias = /^\((.+?)\)\s+as\s+([A-Za-z_][\w-]*)$/.exec(rest)
    if (parenAlias !== null) return { elements: [{ id: parenAlias[2] as string, label: text(parenAlias[1] as string), shape }], notes }
    const parenName = /^\((.+?)\)$/.exec(rest)
    if (parenName !== null) {
      const name = text(parenName[1] as string)
      return { elements: [{ id: name, label: name, shape }], notes }
    }
    const plain = PLAIN_ALIAS.exec(rest)
    if (plain !== null) return { elements: [{ id: plain[2] as string, label: text(plain[1] as string), shape }], notes }
    const written = reference(rest)
    return { elements: [{ id: written.id, label: written.label, shape }], notes }
  }

  // A line that is only a bracketed name is a plain rectangle, which is how a flowchart writes a box.
  const single = BRACKET.exec(line)
  if (single !== null) {
    const id = (single[1] as string).trim()
    return { elements: [{ id, label: id, shape: 'rect' }], notes: [] }
  }

  return undefined
}
