/**
 * Writing a drawing to disk: the CLI's job, kept out of the renderer.
 *
 * `render/index.ts` is bundled into the page as well as run in Node, so it may not import a filesystem;
 * everything that touches one lives here, where only the host reaches it.
 */
import { type RenderInput, type Rendered } from './index.js';
import type { Palette } from './palette.js';
/** Write the drawing where a document can link to it. Returns the path, the byte count and the render. */
export declare function writeSvg(input: RenderInput, path: string, overrides?: Partial<Palette>): {
    path: string;
    bytes: number;
    rendered: Rendered;
};
