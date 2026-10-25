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
export type ColourRole = 'pass' | 'findings' | 'fail' | 'undecided' | 'muted' | 'text' | 'edge' | 'surface' | 'background';
export type Palette = Record<ColourRole, string>;
/** Which surface the drawing will sit on. */
export type PaletteMode = 'light' | 'dark';
/** A named set of colours, for a reader who wants more than the default. */
export type PaletteScheme = 'default' | 'high-contrast' | 'print';
export interface PaletteOptions {
    mode?: PaletteMode;
    scheme?: PaletteScheme;
}
/**
 * Resolve a palette.
 *
 * `overrides` win over everything, so a caller can retheme one role without inventing a scheme. The scheme
 * picks the base; the mode swaps in the dark variant, and only `default` has one - high-contrast and print
 * are what they say they are, on purpose.
 */
export declare function palette(overrides?: Partial<Palette>, options?: PaletteOptions): Palette;
/**
 * The role a verdict earns.
 *
 * `pass_with_findings` is deliberately not `pass`: it reads as the middle band, because a card that paints a
 * report with warnings the same colour as a clean one has stopped carrying the answer.
 */
export declare function roleForVerdict(verdict: string | undefined): ColourRole;
/** Every scheme by name, so a picker does not hard-code the list. */
export declare function schemeNames(): PaletteScheme[];
