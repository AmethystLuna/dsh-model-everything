/** The delimiters, longest first. Each entry is the pattern for one shape and what it draws as. */
const SHAPES = [
    [/^\[\((.+)\)\]$/, 'cylinder'],
    [/^\[\[(.+)\]\]$/, 'subroutine'],
    [/^\(\((.+)\)\)$/, 'circle'],
    [/^\{\{(.+)\}\}$/, 'hexagon'],
    [/^\[\/(.+)\/\]$/, 'rect'],
    [/^\[\\(.+)\\\]$/, 'rect'],
    [/^\[([^\]]+)\]$/, 'rect'],
    [/^\(\[(.+)\]\)$/, 'stadium'],
    [/^\((.+)\)$/, 'stadium'],
    [/^\{(.+)\}$/, 'diamond'],
    [/^>(.+)\]$/, 'rect'],
    [/^<<(.+)>>$/, 'hexagon'],
];
const ID = /^([A-Za-z_][\w-]*)\s*(.*)$/;
/**
 * The node a token states, or `undefined` when the token is not a node.
 *
 * A token with no delimiters is an id alone, which is how an edge names an element it does not declare. A quoted label loses its quotes.
 */
export function readNode(token) {
    const trimmed = token.trim();
    const named = ID.exec(trimmed);
    if (named === null)
        return undefined;
    const id = named[1];
    const rest = named[2].trim();
    if (rest === '')
        return { id };
    for (const [pattern, shape] of SHAPES) {
        const matched = pattern.exec(rest);
        if (matched === null)
            continue;
        const label = matched[1].trim().replace(/^["']|["']$/g, '');
        return { id, label, shape };
    }
    return undefined;
}
