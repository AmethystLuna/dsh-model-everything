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
import { type DocumentLike } from './annotation.js';
export interface ReactLike {
    createElement: (type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]) => unknown;
    useState?: <T>(initial: T) => [T, (next: T | ((previous: T) => T)) => void];
    useEffect?: (effect: () => void | (() => void), deps?: ReadonlyArray<unknown>) => void;
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
 * The card for a drawing: the source the call carried, drawn by the renderer that wrote the file.
 *
 * Drawing it here rather than replaying the SVG means the card and the file are one picture from one
 * engine, and it costs the result nothing. Lines the renderer refused are listed under the drawing: a
 * card that hid them would show a picture that is missing something, which is the failure the tool
 * exists to prevent.
 */
/** A create-element function with this package's calling convention, so a shared builder fits both seats. */
type H = (type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]) => unknown;
/** What an annotation editor shows, shared by the two surfaces that offer one. */
export interface AnnotationState {
    picked: {
        id: string;
    } | null;
    note: string;
    pending: Array<{
        nodeId: string;
        note: string;
    }>;
    status: string;
    /** Whether the pending list is expanded under the count. */
    open?: boolean;
    /** Where the editor sits, in the drawing's own coordinates: beside the node the reader picked. */
    anchor?: {
        left: number;
        top: number;
    };
    /** The correction the dock applied after measuring where the chip actually landed. */
    dockFix?: {
        dx: number;
        dy: number;
    };
}
export interface AnnotationActions {
    onNote: (value: string) => void;
    onAdd: () => void;
    onAddAndSend: () => void;
    onSend: () => void;
    onClear: () => void;
    onCancel: () => void;
    onToggle: () => void;
    onRemove: (index: number) => void;
}
/**
 * The annotation surface: a floating editor over the drawing, and a count of what is waiting.
 *
 * Floating rather than inline, because the reader is looking at a picture and the editor must not move it.
 * The notes stay in a list until one message is composed from them: the reader's input box is theirs, and N raw
 * fragments in it would be exactly the mess this feature is meant to avoid. Colours come from the host's tokens,
 * so light and dark themes need no separate code.
 */
export declare function annotationPanel(h: H, state: AnnotationState, actions: AnnotationActions, options?: {
    floating?: boolean;
    document?: DocumentLike;
    dockFix?: {
        dx: number;
        dy: number;
    };
}): unknown;
/** Remember what would leave with the next message, and start watching for that message. */
export declare function setPendingBlock(text: string): void;
/**
 * The dock, as a layer on `document.body`.
 *
 * A `position: fixed` node still positions against the nearest transformed ancestor, and the composer sits
 * inside one - which is why every coordinate this plugin computed landed inside the box. The shipped
 * annotation plugin sidesteps it the same way: its chip is a body-level layer, so fixed means the viewport.
 * Size and place come from the composer card's own rectangle, measured after every layout change.
 */
interface DockHandlers {
    onToggle: () => void;
    onSend: () => void;
    onRemove: (index: number) => void;
}
/** Keep the docked count in step with the pending list. */
/**
 * Keep the docked count in step with the pending list.
 *
 * Called from a render path, so it must never throw: an exception here unmounts the whole card, and the
 * conversation falls back to the host's plain tool row - which is exactly how the card "disappeared" once.
 */
export declare function updateDockLayer(items: Array<{
    nodeId: string;
    note: string;
}>, open: boolean, handlers: DockHandlers): void;
/**
 * Tell this module when a message leaves, by watching the one signal the host gives: the draft empties.
 *
 * A note that was committed is in the draft, so after the send there is nothing left to keep - and a chip still
 * counting a note that has already gone out is the plugin lying about its own state.
 */
export declare function onMessageSent(listener: () => void): () => void;
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
export {};
