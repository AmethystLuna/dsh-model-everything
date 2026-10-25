/**
 * The Client half: a lazy factory the page binds to this package's name.
 *
 * Everything that decides anything lives in `render/`; this file only turns shapes into React elements.
 * The loader hands the factory a `require` for baseline modules (React among them), so React is taken from
 * there and never bundled.
 *
 * This module is not a page script: it exports the factory, and `scripts/build-client.mjs` wraps the
 * compiled output in `window.__ModuleLoader__.load(...)`, which is the loader contract itself.
 */
import type { Palette } from './render/palette.js';
export interface ReactLike {
    createElement: (type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]) => unknown;
}
export interface SlotContext {
    slots: {
        inject: (slot: string, callback: () => unknown) => unknown;
        register: (options: Record<string, unknown>, component: unknown) => unknown;
    };
}
export interface PluginShape {
    inject: string[];
    apply: (ctx: SlotContext) => void;
}
/** A settled tool call, as the host hands it to a view. */
export interface ToolCallProps {
    phase?: string;
    toolName?: string;
    block?: {
        args?: unknown;
        result?: unknown;
    };
}
/** Tool names this package answers. A key that never dispatches simply never renders. */
export declare const TOOL_NAMES: string[];
/**
 * The view for one tool name.
 *
 * The drawing is emitted as markup, so React receives it through `dangerouslySetInnerHTML`. That is safe
 * only because the writer escapes every value that came from a report or a model, which the render suite
 * pins with an injection case.
 */
export declare function viewFor(React: ReactLike, overrides?: Partial<Palette>): (props: ToolCallProps) => unknown;
export default function factory(require: (name: string) => unknown): PluginShape;
