/**
 * The lines that are not diagram source: a preprocessor directive, a layout control, a style this renderer does not have, a marker
 * that the drawing itself has no room for.
 *
 * None of them needs a drawing, and none of them changes one - each is either read and dropped with a reason, or refused. They were
 * eight branches in the middle of the reading loop, where the only test they could have was a whole diagram; here one line goes in
 * and one answer comes out.
 */

export interface DirectiveAnswer {
  /** What happens to the line. */
  channel: 'ignored' | 'refused'
  /** The sentence the reader is given, with the line already in it. */
  message: string
}

/** A `hide`/`show` line hides a compartment or a stereotype, and no element here has either. */
const HIDE = /^(hide|show)\b/

/** `!pragma layout` asks for a layout engine, which is this renderer's own decision. */
const LAYOUT = /^(top to bottom direction|!pragma\s+layout)\b/

/** The preprocessor forms whose body is never read here. */
const PREPROCESSOR = /^!(define|theme|pragma|procedure|function|unquoted)\b/

/**
 * The answer for one line, or `undefined` when the line is diagram source.
 *
 * `silent` is not in the union on purpose: the one line that is dropped without a word - the opener of a `together` block, whose
 * members are already on one row - is recognised by the caller, because the caller is what collected them.
 */
export function readDirective(line: string, where: string): DirectiveAnswer | undefined {
  if (/^!include\b/.test(line)) {
    return {
      channel: 'refused',
      message: where + '`' + line + '` names a file this renderer does not read, so the drawing would be missing what it holds',
    }
  }
  if (LAYOUT.test(line)) {
    return {
      channel: 'ignored',
      message: where + '`' + line + '` is a layout control: this renderer arranges the drawing itself, so the line has no effect',
    }
  }
  if (PREPROCESSOR.test(line)) {
    return {
      channel: 'ignored',
      message: where + '`' + line + '` is a preprocessor directive: nothing is expanded here, the source is drawn as written',
    }
  }
  if (/^allowmixing\b/.test(line)) {
    return {
      channel: 'ignored',
      message: where + '`' + line + '` permits mixing diagram families; only one family is drawn here, so it has no effect',
    }
  }
  if (HIDE.test(line)) {
    return {
      channel: 'ignored',
      message: where + '`' + line + '` hides something this renderer does not draw: an element here has no compartments or stereotypes',
    }
  }
  if (/^together\s*$/.test(line)) {
    return {
      channel: 'ignored',
      message: where + '`' + line + '` names no boxes: a `together { }` block keeps its own members on one row',
    }
  }
  return undefined
}

/** The opener of a `together` block: the block itself is read before the lines are parsed, so this line has nothing left to do. */
export function isTogetherOpener(line: string): boolean {
  return /^together\b[^{]*\{\s*$/.test(line)
}
