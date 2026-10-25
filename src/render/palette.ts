/**
 * Verdict to colour, in the two schemes the page can be in, plus the schemes a reader may prefer.
 *
 * A drawing is read before it is parsed, so the first thing it says is the answer. The roles are named rather
 * than coloured: a scheme maps a role to a value, and the values are chosen so the drawing survives both
 * surfaces this plugin renders on - a light page and a dark one - without the reader changing anything.
 *
 * The mode is read at render time from the page's own background (see `client.ts`). The host publishes its
 * palette as CSS variables whose names are private to it, and a drawing that hard-coded them would break on
 * the next theme; the luminance of the surface is the one fact that cannot drift.
 *
 * Pure, and tested: a wrong role is a wrong verdict shown as a shape.
 */

export type ColourRole =
  | 'pass'
  | 'findings'
  | 'fail'
  | 'undecided'
  | 'muted'
  | 'text'
  | 'edge'
  | 'surface'
  | 'background'

export type Palette = Record<ColourRole, string>

/** Which surface the drawing will sit on. */
export type PaletteMode = 'light' | 'dark'

/** A named set of colours, for a reader who wants more than the default. */
export type PaletteScheme = 'default' | 'high-contrast' | 'print'

const LIGHT: Palette = {
  pass: '#2f8f5b',
  findings: '#b7791f',
  fail: '#c0392b',
  undecided: '#6b7280',
  muted: '#9aa3ad',
  text: '#1f2933',
  edge: '#6b7280',
  surface: 'transparent',
  background: '#ffffff',
}

const DARK: Palette = {
  pass: '#4ac486',
  findings: '#e0b050',
  fail: '#f2705f',
  undecided: '#9aa3ad',
  muted: '#7d8794',
  text: '#e6e8eb',
  edge: '#8b949e',
  surface: 'transparent',
  background: '#0d1117',
}

/** Black on white, for a projector or a poor print. The shape carries the meaning, not the hue. */
const HIGH_CONTRAST: Palette = {
  pass: '#0a5c35',
  findings: '#7a4300',
  fail: '#a30000',
  undecided: '#333333',
  muted: '#444444',
  text: '#000000',
  edge: '#000000',
  surface: 'transparent',
  background: '#ffffff',
}

/** Greyscale throughout: a drawing that will be printed on a black-and-white printer. */
const PRINT: Palette = {
  pass: '#333333',
  findings: '#555555',
  fail: '#000000',
  undecided: '#666666',
  muted: '#777777',
  text: '#000000',
  edge: '#333333',
  surface: 'transparent',
  background: '#ffffff',
}

const SCHEMES: Record<PaletteScheme, Palette> = {
  default: LIGHT,
  'high-contrast': HIGH_CONTRAST,
  print: PRINT,
}

export interface PaletteOptions {
  mode?: PaletteMode
  scheme?: PaletteScheme
}

/**
 * Resolve a palette.
 *
 * `overrides` win over everything, so a caller can retheme one role without inventing a scheme. The scheme
 * picks the base; the mode swaps in the dark variant, and only `default` has one - high-contrast and print
 * are what they say they are, on purpose.
 */
export function palette(overrides: Partial<Palette> = {}, options: PaletteOptions = {}): Palette {
  const scheme = options.scheme ?? 'default'
  const mode = options.mode ?? 'light'
  const base = scheme === 'default' && mode === 'dark' ? DARK : (SCHEMES[scheme] ?? LIGHT)
  return { ...base, ...overrides }
}

/**
 * The role a verdict earns.
 *
 * `pass_with_findings` is deliberately not `pass`: it reads as the middle band, because a card that paints a
 * report with warnings the same colour as a clean one has stopped carrying the answer.
 */
export function roleForVerdict(verdict: string | undefined): ColourRole {
  if (verdict === 'pass') return 'pass'
  if (verdict === 'pass_with_findings') return 'findings'
  if (verdict === 'fail') return 'fail'
  return 'undecided'
}

/** Every scheme by name, so a picker does not hard-code the list. */
export function schemeNames(): PaletteScheme[] {
  return Object.keys(SCHEMES) as PaletteScheme[]
}
