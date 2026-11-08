/**
 * A name with the decorations stripped off it.
 *
 * A stereotype, a cardinality and a colour can follow a name in four places the source writes one - a declaration, an arrow
 * endpoint, a boundary and a note - and in every one of them, left in, the decoration became part of the name: `p <<layer>>`,
 * `a "1"`, `"网关" as gw`. The result is an id no other line can point at, from a line that looks perfectly ordinary.
 *
 * The stripping is one function so the fifth place inherits it, and so a test can say what is a decoration and what is a name
 * without a drawing. It reports what it removed, because a drawing that drops a stereotype silently teaches the source's author
 * that the stereotype did something.
 */
export interface BareName {
  /** What is left: the name itself. */
  name: string
  /** Everything taken off, in the order it was found, so the caller can report each one. */
  stripped: string[]
}

const TRAILING = [
  /,\s*$/,                        // a statement-end comma
  /\s*<<[^<>]*>>\s*$/,          // a stereotype
  /\s+(?:"[^"]*"|'[^']*'|\([^()]*\))\s*$/, // a cardinality after the name
  /\s+#\S+\s*$/,               // a colour
]

/** A cardinality written before the name, as `a "1" --> "*" b` allows at the far end. */
const LEADING = /^(?:"[^"]*"|'[^']*')\s+/

/**
 * How a stripped decoration is described to the source's author.
 *
 * One wording per kind, in one place: the three call sites that strip decorations used to word this themselves, and they drifted.
 */
export function decorationReason(token: string): string {
  if (token === ',') return 'is a statement-end comma, which this renderer does not need'
  if (token.startsWith('<<')) return 'is a stereotype this renderer does not draw'
  if (token.startsWith('#')) return 'is a colour this renderer does not have: the palette is fixed'
  return 'is a cardinality, which this renderer does not draw'
}

export function bareName(text: string): BareName {
  let name = text.trim()
  const stripped: string[] = []
  for (;;) {
    let found: RegExpExecArray | null = null
    let pattern: RegExp | undefined
    for (const candidate of TRAILING) {
      found = candidate.exec(name)
      if (found !== null) {
        pattern = candidate
        break
      }
    }
    if (found === null || pattern === undefined) break
    stripped.push(found[0].trim())
    name = name.slice(0, found.index).trim()
  }
  for (;;) {
    const leading = LEADING.exec(name)
    if (leading === null) break
    const after = name.slice(leading[0].length).trim()
    // `"Api" as ui` is a quoted name with an alias, not a cardinality: the quotes belong to the name.
    if (/^as\s/i.test(after)) break
    stripped.push(leading[0].trim())
    name = after
  }
  return { name, stripped }
}
