/**
 * A drawing is a document, and a document has to parse.
 *
 * Every geometric assertion in these suites reads the markup as a string, so an unescaped `&` or a tag written once passes all
 * of them and breaks the picture in whatever container draws it. Two checks catch that class: an entity check, and a tag stack.
 *
 * It also has to be able to refuse: `wellFormed('<svg><text>a & b</text></svg>')` throwing is what makes the check a check, so
 * every suite that uses this one asserts that too.
 */
export function wellFormed(markup) {
  for (const match of markup.matchAll(/&/g)) {
    const entity = /^&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/.exec(markup.slice(match.index))
    if (entity === null) throw new Error('an unescaped & at ' + String(match.index))
  }
  const stack = []
  for (const tag of markup.matchAll(/<(\/?)([a-z]+)([^>]*)>/g)) {
    const closing = tag[1] === '/'
    const selfClosing = tag[3].trimEnd().endsWith('/')
    if (closing) {
      const open = stack.pop()
      if (open !== tag[2]) throw new Error('</' + tag[2] + '> closes <' + String(open) + '>')
    } else if (!selfClosing) {
      stack.push(tag[2])
    }
  }
  if (stack.length !== 0) throw new Error('unclosed: ' + stack.join(','))
}
