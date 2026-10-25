/**
 * Writing a drawing to disk: the CLI's job, kept out of the renderer.
 *
 * `render/index.ts` is bundled into the page as well as run in Node, so it may not import a filesystem;
 * everything that touches one lives here, where only the host reaches it.
 */
import { writeFileSync } from 'node:fs';
import { render } from './index.js';
/** Write the drawing where a document can link to it. Returns the path, the byte count and the render. */
export function writeSvg(input, path, overrides = {}, options = {}) {
    const rendered = render(input, overrides, options);
    writeFileSync(path, rendered.markup, 'utf8');
    return { path, bytes: rendered.markup.length, rendered };
}
