/**
 * Shapes to SVG markup.
 *
 * The one module that knows tags, so it is also the one place where a shape can silently disappear if a
 * writer forgets a case: `writer` returns undefined for an unknown kind, and the caller counts the drops
 * instead of hiding them.
 *
 * Pure, and the output is asserted as text in the suite: escaping, geometry, and the caption.
 */
import { palette } from './palette.js';
const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const round = (value) => String(Math.round(value * 100) / 100);
function writer(shape, colours) {
    if (shape.kind === 'title') {
        return '<text x="' + round(shape.x) + '" y="' + round(shape.y) + '" fill="' + colours[shape.colour] + '" font-size="12" font-family="sans-serif" font-weight="600">' + escape(shape.text) + '</text>';
    }
    if (shape.kind === 'caption') {
        return '<text x="' + round(shape.x) + '" y="' + round(shape.y) + '" fill="' + colours[shape.colour] + '" font-size="11" font-family="sans-serif">' + escape(shape.text) + '</text>';
    }
    if (shape.kind === 'box') {
        const stroke = shape.initial ? ' stroke-width="3"' : '';
        return ('<g>' +
            '<rect x="' + round(shape.x) + '" y="' + round(shape.y) + '" width="' + round(shape.width) + '" height="' + round(shape.height) + '" rx="6" fill="none" stroke="' + colours[shape.colour] + '"' + stroke + '/>' +
            '<text x="' + round(shape.x + shape.width / 2) + '" y="' + round(shape.y + shape.height / 2 + 4) + '" fill="' + colours[shape.colour] + '" font-size="11" font-family="sans-serif" text-anchor="middle">' + escape(shape.label) + '</text>' +
            '</g>');
    }
    if (shape.kind === 'link') {
        const arrow = '<polygon points="' + round(shape.x2 - 3) + ',' + round(shape.y2 - 6) + ' ' + round(shape.x2 + 3) + ',' + round(shape.y2 - 6) + ' ' + round(shape.x2) + ',' + round(shape.y2) + '" fill="' + colours[shape.colour] + '"/>';
        const label = shape.label === ''
            ? ''
            : '<text x="' + round((shape.x1 + shape.x2) / 2 + 4) + '" y="' + round((shape.y1 + shape.y2) / 2) + '" fill="' + colours.muted + '" font-size="10" font-family="sans-serif">' + escape(shape.label) + '</text>';
        return '<g><line x1="' + round(shape.x1) + '" y1="' + round(shape.y1) + '" x2="' + round(shape.x2) + '" y2="' + round(shape.y2) + '" stroke="' + colours[shape.colour] + '" stroke-width="1.2" marker-end="none"/>' + arrow + label + '</g>';
    }
    return undefined;
}
export function toSvg(canvas, colours = palette(), label) {
    const parts = [];
    let dropped = 0;
    for (const shape of canvas.shapes) {
        const written = writer(shape, colours);
        if (written === undefined)
            dropped += 1;
        else
            parts.push(written);
    }
    const accessible = label === undefined ? '' : ' role="img" aria-label="' + escape(label) + '"';
    const markup = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + round(canvas.width) + ' ' + round(canvas.height) + '" width="' + round(canvas.width) + '" height="' + round(canvas.height) + '"' + accessible + '>' +
        parts.join('') +
        '</svg>';
    return { markup, dropped };
}
