/**
 * Collapsing a group: the drawing with one boundary folded into a single box.
 *
 * A fold is a transform on the model, not a mode of the painter. That keeps the painter's rules unchanged -
 * it still draws boxes and edges it is given - and it makes the behaviour testable without a browser: feed a
 * diagram in, assert what came out.
 *
 * Folding is what makes a hierarchy usable: a reader who has understood a package wants it out of the way, and
 * an architecture diagram that cannot be folded is read at one zoom level forever.
 */
import type { Diagram } from './model.js';
/**
 * Fold the named groups.
 *
 * A folded group becomes a node carrying its name and how many nodes it holds; its members - and every group
 * inside it - leave the drawing. An edge that pointed at something inside the fold is re-aimed at the fold's
 * box, and an edge between two members of the same fold disappears: both ends are now the same box, and a
 * self-loop would be a claim the source never made.
 *
 * Ids nobody declared are ignored, and folding a group whose contents are already gone changes nothing, so the
 * function is total on any diagram and any set of names.
 */
export declare function collapse(diagram: Diagram, folded: Iterable<string>): Diagram;
