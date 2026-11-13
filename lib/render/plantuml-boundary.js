/**
 * The lines that open and close a boundary: `package orders {`, `node Web {`, and the `}` that ends the innermost one.
 *
 * What the line states is decided here - which keyword, whether it is a boundary at all, what the boundary is called, what decorates it,
 * and whether it is drawn solid. The parser owns the open stack and writes what it is handed; nothing here touches a drawing.
 */
import { decorationReason } from './names.js';
import { SHAPES, boundaryOf } from './plantuml-reference.js';
/** The keywords whose `{ }` block is drawn as a boundary. */
export const BOUNDARY = new Set(['package', 'folder', 'node', 'component', 'rectangle', 'artifact', 'state', 'partition']);
/** Boundaries drawn with a solid outline: a state is a region of the machine, not a label on a box. */
export const SOLID_BOUNDARY = new Set(['state']);
/**
 * The boundary a line opens or closes, or `undefined` when the line is neither.
 *
 * `ordinal` names a boundary the source did not name: it is the count the parser will hold once this line is read, so it is passed in
 * rather than counted here.
 */
export function readBoundary(line, index, ordinal, where) {
    if (line === '}')
        return { kind: 'close' };
    if (!line.endsWith('{'))
        return undefined;
    const declaration = line.slice(0, -1).trim();
    const opener = declaration.split(/[\s{]/)[0].toLowerCase();
    if (!BOUNDARY.has(opener)) {
        const reason = SHAPES[opener] === undefined
            ? '`' + declaration + '` is not a boundary this renderer draws'
            : 'a `' + opener + '` block is not a boundary this renderer draws';
        return { kind: 'note', channel: 'refused', message: where + reason };
    }
    const boundary = boundaryOf(declaration, opener, ordinal);
    return {
        kind: 'open',
        id: boundary.id,
        label: boundary.label,
        solid: SOLID_BOUNDARY.has(opener),
        line: index + 1,
        notes: boundary.decorations.map((decoration) => where + '`' + decoration + '` ' + decorationReason(decoration)),
    };
}
