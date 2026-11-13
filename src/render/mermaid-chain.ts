/**
 * A Mermaid line with more than one connection in it: a chain (`a --> b --> c`), several sources (`a & b --> c`), several targets
 * (`a --> b & c`), or a chain of those.
 *
 * The lines are legal Mermaid and each one states several edges. Read as a single line they name no two nodes, and the whole line was
 * refused - a drawing that loses three boxes because the source wrote one line for them.
 */

/** One connection as the line stated it. */
export interface Link {
  from: string
  to: string
  /** The arrow text, so the caller can read dashed, dotted and thick from it. */
  arrow: string
  label?: string
}

/** The arrows a flowchart can write, longest first so `-.->` is not read as `-->` with a stray dot. */
const ARROWS = ['-.->', '==>', '-->', '---']

/**
 * The connections a line states, or `undefined` when it states a single one and the caller's own reader should have it.
 *
 * A single connection is answered by `undefined` rather than by a one-element list: the caller already reads that case, with more care
 * than this function takes, and two readers for one line is how they drift apart.
 */
export function readChain(line: string): Link[] | undefined {
  // Split on the arrows, keeping each one with the piece that follows it.
  const pieces: string[] = []
  const arrows: string[] = []
  let rest = line
  for (;;) {
    const found = nextArrow(rest)
    if (found === undefined) break
    pieces.push(rest.slice(0, found.at).trim())
    arrows.push(found.arrow)
    rest = rest.slice(found.at + found.arrow.length)
  }
  if (arrows.length === 0) return undefined
  pieces.push(rest.trim())
  // A piece after an arrow may carry a pipe label; the label belongs to that arrow.
  const labels: (string | undefined)[] = []
  const endpoints = pieces.map((piece, index) => {
    if (index === 0) return piece
    const piped = /^\|([^|]*)\|\s*(.*)$/.exec(piece)
    if (piped === null) { labels.push(undefined); return piece }
    labels.push(piped[1])
    return (piped[2] as string).trim()
  })
  const links: Link[] = []
  for (let index = 0; index + 1 < endpoints.length; index += 1) {
    const sources = splitGroup(endpoints[index] as string)
    const targets = splitGroup(endpoints[index + 1] as string)
    for (const from of sources) {
      for (const to of targets) {
        links.push({
          from,
          to,
          arrow: arrows[index] as string,
          ...(labels[index] === undefined ? {} : { label: labels[index] as string }),
        })
      }
    }
  }
  // One connection is the caller's case, not this one.
  if (links.length <= 1 && !line.includes('&')) return undefined
  return links
}

/** The first arrow in the text, with where it sits. */
function nextArrow(text: string): { at: number; arrow: string } | undefined {
  let best: { at: number; arrow: string } | undefined
  for (const arrow of ARROWS) {
    const at = text.indexOf(arrow)
    if (at < 0) continue
    if (best === undefined || at < best.at) best = { at, arrow }
  }
  return best
}

/**
 * `a & b` is two endpoints; one name is one.
 *
 * An `&` inside a label is text, not a separator: `A["Tom & Jerry"]` is one node, and splitting it drew two boxes and lost the label -
 * which is why the split follows quotes and brackets rather than the character.
 */
function splitGroup(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | undefined
  let current = ''
  for (const char of text) {
    if (quote !== undefined) {
      current += char
      if (char === quote) quote = undefined
      continue
    }
    if (char === '"' || char === "'") { quote = char; current += char; continue }
    if ('[({'.includes(char)) depth += 1
    else if ('])}'.includes(char)) depth -= 1
    if (char === '&' && depth === 0) { parts.push(current); current = ''; continue }
    current += char
  }
  parts.push(current)
  return parts.map((part) => part.trim()).filter((part) => part !== '')
}
