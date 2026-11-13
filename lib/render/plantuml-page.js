/**
 * The lines that describe the page rather than its contents: a title, header, footer or caption, a direction, a delivery size, a
 * background colour, a skinparam.
 *
 * Each is one line in and one decision out - which field it sets, or what the reader is told when it cannot be honoured. The parser
 * applies the decision; nothing here touches a diagram, so every rule below can be asked its own question.
 */
/** The range a delivery size may take: smaller is unreadable, larger is a poster. */
export const SCALE_RANGE = { min: 0.5, max: 8 };
/**
 * The decision for one page line, or `undefined` when the line is not one.
 *
 * `where` is the line prefix the reader is given, so a refusal names the line it came from.
 */
export function readPageLine(line, where) {
    const title = /^title\s+(.+)$/.exec(line);
    if (title !== null)
        return { kind: 'title', text: title[1].trim() };
    const pageText = /^(header|footer|caption)\s+(.+)$/.exec(line);
    if (pageText !== null) {
        const value = pageText[2].replace(/^["']|["']$/g, '').trim();
        if (value === '')
            return { kind: 'note', channel: 'refused', message: where + '`' + pageText[1] + '` names no text' };
        const field = pageText[1] === 'header' ? 'header' : pageText[1] === 'footer' ? 'footer' : 'sourceCaption';
        return { kind: 'pageText', field, text: value };
    }
    if (/^left to right direction\b/.test(line))
        return { kind: 'direction' };
    const scale = /^scale\s+([0-9]+(?:\.[0-9]+)?)\s*$/.exec(line);
    if (scale !== null) {
        const factor = Number(scale[1]);
        if (!(factor >= SCALE_RANGE.min && factor <= SCALE_RANGE.max)) {
            return {
                kind: 'note',
                channel: 'refused',
                message: where + '`' + line + '` is outside the range this renderer scales: 0.5 to 8',
            };
        }
        return { kind: 'scale', factor };
    }
    if (/^scale\b/.test(line)) {
        return {
            kind: 'note',
            channel: 'refused',
            message: where + '`' + line + '` sizes a drawing by width and height; `scale 2` is the form this renderer takes',
        };
    }
    const background = /^skinparam\s+backgroundColor\s+(.+)$/i.exec(line);
    if (background !== null) {
        const value = background[1].trim().replace(/^["']|["']$/g, '');
        if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) {
            return {
                kind: 'note',
                channel: 'refused',
                message: where + '`' + value + '` is not a colour this renderer draws: write `#rgb` or `#rrggbb`',
            };
        }
        return { kind: 'background', value };
    }
    // `linetype ortho` asks for what every edge here already is; the other line types are a style the renderer does not have.
    if (/^skinparam\s+linetype\s+ortho\b/i.test(line)) {
        return {
            kind: 'note',
            channel: 'ignored',
            message: where + '`' + line + '` asks for orthogonal lines, which is what every edge here is already',
        };
    }
    if (/^skinparam\b/i.test(line)) {
        const key = /^skinparam\s+(\S+)/i.exec(line)?.[1] ?? 'skinparam';
        return {
            kind: 'note',
            channel: 'ignored',
            message: where + '`' + key + '` is styling this renderer does not have: the type scale, the palette and the line style are fixed',
        };
    }
    return undefined;
}
