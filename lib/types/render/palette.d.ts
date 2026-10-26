/**
 * Verdict to colour, in the two surfaces the page can be in, and in the scheme a reader prefers.
 *
 * A drawing is read before it is parsed, so the first thing it says is the answer. The roles are named rather
 * than coloured: a scheme maps a role to a value, and every scheme is chosen so the drawing survives both a
 * light and a dark page - the reader never has to fix a palette to read a result.
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
/** A named set of colours. A scheme with both variants follows the page; one with only light does not. */
export type PaletteScheme = 'default' | 'github' | 'high-contrast' | 'print';
export interface PaletteOptions {
    mode?: PaletteMode;
    scheme?: PaletteScheme;
}
/**
 * Resolve a palette.
 *
 * `overrides` win over everything, so a caller can retheme one role without inventing a scheme. A scheme with
 * a dark variant follows the surface; one without stays as declared - high-contrast and print are what they
 * say they are, on purpose. An unknown name falls back to the default palette rather than throwing, because
 * the value can arrive from a DOM control.
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
