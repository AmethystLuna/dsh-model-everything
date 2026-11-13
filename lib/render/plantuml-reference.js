import { bareName } from './names.js';
// The declaration forms: a quoted, bracketed or plain alias, and a bracketed name.
export const QUOTED_ALIAS = /^["'](.+?)["']\s+as\s+([A-Za-z_][\w-]*)$/;
export const BRACKET_ALIAS = /^\[(.+?)\]\s+as\s+([A-Za-z_][\w-]*)$/;
export const PLAIN_ALIAS = /^([A-Za-z_][\w.-]*)\s+as\s+([A-Za-z_][\w-]*)$/;
export const BRACKET = /^\[(.+?)\]$/;
export function reference(token) {
    // An endpoint carries decorations the name does not: `a "1" --> "*" b` names two boxes, not two labels.
    const bare = bareName(token);
    let text = bare.name === '' ? token.trim() : bare.name;
    if (text === '')
        text = token.trim();
    const bracket = BRACKET.exec(text);
    if (bracket !== null) {
        const label = bracket[1].trim().replace(/\\n/g, '\n');
        return { id: label, label, shape: 'rect' };
    }
    const quoted = /^["'](.+?)["']$/.exec(text);
    if (quoted !== null)
        return { id: quoted[1], label: quoted[1].replace(/\\n/g, '\n') };
    return { id: text };
}
// The arrow: a mark at either end, one dash or two, an optional `: label`.
export const ARROW = /^(.+?)\s*(<\|?|[*o])?(-{1,}|\.{1,})(\|?>|[*o])?\s*(.+?)(?:\s*:\s*(.+))?$/;
export function readArrow(line) {
    const match = ARROW.exec(line);
    if (match === null)
        return undefined;
    const left = reference(match[1]);
    const right = reference(match[5]);
    const leftMark = match[2];
    const rightMark = match[4];
    const dotted = match[3].startsWith('.');
    const label = (match[6] ?? '').trim();
    if (leftMark !== undefined && rightMark !== undefined) {
        return 'an edge marked at both ends is not one this renderer draws';
    }
    if (leftMark === '*' || leftMark === 'o' || rightMark === '*' || rightMark === 'o') {
        const atRight = rightMark === '*' || rightMark === 'o';
        const mark = atRight ? rightMark : leftMark;
        return {
            from: atRight ? right : left,
            to: atRight ? left : right,
            label,
            dashed: dotted,
            arrow: mark === '*' ? 'composition' : 'aggregation',
        };
    }
    if (leftMark !== undefined) {
        return {
            from: right,
            to: left,
            label,
            dashed: dotted,
            arrow: leftMark === '<|' ? (dotted ? 'realization' : 'generalization') : dotted ? 'dependency' : 'association',
        };
    }
    if (rightMark !== undefined) {
        return {
            from: left,
            to: right,
            label,
            dashed: dotted,
            arrow: rightMark === '|>' ? (dotted ? 'realization' : 'generalization') : dotted ? 'dependency' : 'association',
        };
    }
    // No mark at either end: the source states a connection and no direction.
    return { from: left, to: right, label, dashed: dotted, arrow: 'none' };
}
/**
 * The id and label an opening boundary line states. An alias is the id, because edges will name it.
 *
 * A stereotype or a colour written after the name is a decoration on the boundary, not part of what it is called: left in,
 * both ended up in the label and the alias was lost, so the boundary could not be named by an edge or by its own members.
 */
export function boundaryOf(declaration, keyword, ordinal) {
    const bare = bareName(declaration.slice(keyword.length));
    const rest = bare.name;
    const adornment = { decorations: bare.stripped };
    const alias = QUOTED_ALIAS.exec(rest) ?? BRACKET_ALIAS.exec(rest) ?? PLAIN_ALIAS.exec(rest);
    if (alias !== null)
        return { id: alias[2], label: alias[1], ...adornment };
    const label = rest.replace(/^["']|["']$/g, '');
    return { id: 'group-' + String(ordinal), label: label === '' ? keyword : label, ...adornment };
}
