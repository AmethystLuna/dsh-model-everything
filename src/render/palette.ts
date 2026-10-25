/**
 * Verdict to colour.
 *
 * A card is read before it is parsed, so the first thing a drawing says is the answer. The roles are named
 * rather than coloured here: the palette maps a role to a value, and the values are chosen so the drawing
 * survives both surfaces this plugin renders on - a light card and a dark one.
 *
 * Pure, and tested: a wrong role is a wrong verdict shown as a shape.
 */

export type ColourRole = 'pass' | 'findings' | 'fail' | 'undecided' | 'muted' | 'text' | 'edge'

export type Palette = Record<ColourRole, string>

/** Roles the surviving surface uses. Kept apart from the role so a theme can replace the values. */
const DEFAULT_PALETTE: Palette = {
  pass: '#2f8f5b',
  findings: '#b7791f',
  fail: '#c0392b',
  undecided: '#6b7280',
  muted: '#9aa3ad',
  text: '#1f2933',
  edge: '#6b7280',
}

export function palette(overrides: Partial<Palette> = {}): Palette {
  return { ...DEFAULT_PALETTE, ...overrides }
}

/**
 * The role a verdict earns.
 *
 * `pass_with_findings` is deliberately not `pass`: it reads as the middle band, because a card that paints
 * a report with warnings the same colour as a clean one has stopped carrying the answer.
 */
export function roleForVerdict(verdict: string | undefined): ColourRole {
  if (verdict === 'pass') return 'pass'
  if (verdict === 'pass_with_findings') return 'findings'
  if (verdict === 'fail') return 'fail'
  return 'undecided'
}
