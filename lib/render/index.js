/**
 * The renderer's front door: whatever notation arrived, one drawing comes out.
 *
 * Three containers read this - the tool card, the full-screen view and the sidebar whiteboard - and each of
 * them wants the same two things: shapes to draw and markup to embed. Neither knows which notation produced
 * them, and neither needs to.
 *
 * Pure: no filesystem, because the same module is bundled into the page for the whiteboard.
 */
import { fromMermaid } from './from-mermaid.js';
import { fromPlantUml } from './from-plantuml.js';
import { paintWith } from './paint.js';
import { toSvg } from './svg.js';
/** Read the notation off the source: PlantUML starts with `@startuml` or `@startmindmap`-style markers. */
export function detectNotation(source) {
    const head = source
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line !== '' && !line.startsWith("'") && !line.startsWith('//'));
    if (head === undefined)
        return 'mermaid';
    return /^@start/.test(head) ? 'plantuml' : 'mermaid';
}
export function render(input, overrides = {}, options = {}) {
    const notation = input.notation === undefined || input.notation === 'auto' ? detectNotation(input.source) : input.notation;
    const parsed = notation === 'plantuml'
        ? fromPlantUml(input.source, input.title ?? 'plantuml')
        : fromMermaid(input.source, input.title ?? 'mermaid');
    const { canvas, colours } = paintWith(parsed.diagram, overrides, options);
    const written = toSvg(canvas, colours, parsed.diagram.title + ': ' + parsed.diagram.caption);
    return {
        diagram: parsed.diagram,
        canvas,
        colours,
        markup: written.markup,
        notation,
        refused: parsed.refused,
        dropped: written.dropped,
    };
}
