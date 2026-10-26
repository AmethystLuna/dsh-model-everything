/**
 * The Client half: a lazy factory the page binds to this package's name.
 *
 * Everything that decides anything lives in `render/`; this file only turns shapes into React elements and
 * registers them where the page offers a seat. Two seats are used, and they fail independently:
 *
 * - `tool.call.toolview` replaces the card of a tool whose result this package can draw;
 * - `sidebar.right.pane.tab` is the whiteboard: a tab that renders whatever the reader pastes, with no tool
 *   and no host data at all, so it keeps working when the card seat does not.
 *
 * This module is not a page script: it exports the factory, and `scripts/build-client.mjs` wraps the
 * compiled output in `window.__ModuleLoader__.load(...)`, which is the loader contract itself.
 */
import { type Palette, type PaletteMode } from './render/palette.js';
export interface ReactLike {
    createElement: (type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]) => unknown;
    useState?: <T>(initial: T) => [T, (next: T) => void];
}
export interface SlotContext {
    slots: {
        inject: (slot: string, callback: () => unknown) => unknown;
        register: (options: Record<string, unknown>, component: unknown) => unknown;
    };
    get?: (service: string) => unknown;
}
export interface PluginShape {
    inject: string[];
    apply: (ctx: SlotContext) => void;
    /** The whiteboard mount, with its scheduler injectable. `apply` calls this with the default. */
    mount: (ctx: SlotContext, options?: MountOptions) => unknown;
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
 * Which surface the page is painting the drawing on.
 *
 * The host publishes its palette as private CSS variables, so naming them here would break on the next theme.
 * The one fact that cannot drift is the rendered background: read it, and fall back to the media query, then
 * to light. Never throws - a view that cannot read the document still draws.
 */
export declare function themeMode(): PaletteMode;
/** The whiteboard's seat key, in both the tab registry and the body slot. */
export declare const WHITEBOARD_ID = "model-everything-diagram";
/** What the whiteboard opens with: a diagram the reader can edit rather than an empty box. */
export declare const WHITEBOARD_SAMPLE: string;
/**
 * The view for one tool name.
 *
 * The drawing is emitted as markup, so React receives it through `dangerouslySetInnerHTML`. That is safe
 * only because the writer escapes every value that came from a report or a model, which the render suite
 * pins with an injection case.
 */
export declare function viewFor(React: ReactLike, overrides?: Partial<Palette>): (props: ToolCallProps) => unknown;
/**
 * The whiteboard: paste a diagram, get a drawing, zoom it.
 *
 * It holds no host data, which is the point: it is a place to think about a diagram while writing one, and
 * it cannot be broken by a change to any tool's result shape. The source it draws is whatever is in its own
 * box.
 */
export declare function whiteboardFor(React: ReactLike, overrides?: Partial<Palette>): () => unknown;
export interface MountOptions {
    /** Injected so the suite can drive the poll without waiting. Defaults to `setTimeout`. */
    schedule?: (run: () => void, delay: number) => unknown;
}
/**
 * Register the whiteboard tab once the sidebar's optional services are ready.
 *
 * The slot can be declared before `sidebarRightTabs` exists - the host composes services and seats in an
 * order this plugin does not control - and a single `ctx.get` there is a race that loses the tab silently.
 * So it polls, like the reference implementation does, and stops after a bounded number of attempts.
 */
export declare function mountWhiteboard(React: ReactLike, ctx: SlotContext, options?: MountOptions): unknown;
export default function factory(require: (name: string) => unknown): PluginShape;
