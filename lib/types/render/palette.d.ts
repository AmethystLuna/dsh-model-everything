/**
 * Verdict to colour.
 *
 * A card is read before it is parsed, so the first thing a drawing says is the answer. The roles are named
 * rather than coloured here: the palette maps a role to a value, and the values are chosen so the drawing
 * survives both surfaces this plugin renders on - a light card and a dark one.
 *
 * Pure, and tested: a wrong role is a wrong verdict shown as a shape.
 */
export type ColourRole = 'pass' | 'findings' | 'fail' | 'undecided' | 'muted' | 'text' | 'edge';
export type Palette = Record<ColourRole, string>;
export declare function palette(overrides?: Partial<Palette>): Palette;
/**
 * The role a verdict earns.
 *
 * `pass_with_findings` is deliberately not `pass`: it reads as the middle band, because a card that paints
 * a report with warnings the same colour as a clean one has stopped carrying the answer.
 */
export declare function roleForVerdict(verdict: string | undefined): ColourRole;
