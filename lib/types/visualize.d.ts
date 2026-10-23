/**
 * A machine drawn as text, for the card a reader looks at.
 *
 * The model-facing result already says what the engine decided; what a reader cannot see at a glance is
 * the shape of the machine those words are about. So the card draws it - in characters, because that is
 * the only channel this contract has: an image would be an attachment, and a tool result cannot create
 * one.
 *
 * Two rules keep it honest:
 *
 * - it draws only what the model declares - no state it invents, no edge it infers;
 * - it refuses to draw a graph that will not read as text, instead of printing a 60-line tangle. For a
 *   large machine the card says how large it is and stops; the report still carries the whole machine.
 */
export interface DrawableState {
    id: string;
}
export interface DrawableTransition {
    from: string;
    to: string;
    label?: string;
}
export interface Drawable {
    states: DrawableState[];
    transitions: DrawableTransition[];
    initial?: string;
}
/** The most a card draws: past this the text stops being a picture and becomes a transcript. */
export declare const DRAW_LIMIT: {
    states: number;
    transitions: number;
};
/**
 * The drawing, one level per line block: the states at that level, then the transitions leaving it.
 *
 * A transition inside a level or to a state already drawn is listed under the level it leaves, so no edge
 * is silent. That is the difference between a picture and a decoration: every declared edge appears.
 */
export declare function drawStateDiagram(drawable: Drawable): string[];
/** The legend a reader needs to read the drawing without being told: initial state versus the rest. */
export declare function diagramLegend(drawable: Drawable): string | undefined;
