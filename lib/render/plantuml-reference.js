import { bareName } from './names.js';
// The arrow: a mark at either end, one dash or two, an optional `: label`.
export const ARROW = /^(.+?)\s*(<\|?|[*o])?(-{1,}|\.{1,})(\|?>|[*o])?\s*(.+?)(?:\s*:\s*(.+))?$/;
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
}
