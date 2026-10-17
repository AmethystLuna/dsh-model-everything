/**
 * The gate: one optional routing message, injected once per session.
 *
 * Why it exists. Routing works through text: the measured result is that a session asked
 * to check something loads the skill whose catalog line matches. What that measurement
 * also showed is the limit - a session that never decides to load anything is never routed,
 * and the catalog line is cut at 500 characters, so the tail of a long line is invisible at
 * the moment of choosing. This component carries the routing in a message instead of in the
 * line, for a deployment that wants the decision made for it.
 *
 * Why it is a separate row. The plugin's doctrine is that a capability is discoverable
 * through its own tool description or skill text. Injection departs from that, so it is
 * opt-in and mounted as its own component: install it, disable it, or never enable it,
 * without touching the tools or the skills. `enabled` is a live switch, so the Web Plugins
 * page flips it inside a running host.
 *
 * Why it is off by default. It costs tokens in every session that turns it on, to fix a
 * problem text-only routing was measured not to have once the session engages. A deployment
 * that wants it says so; the default pays nothing.
 *
 * What it does not do. It routes; it checks nothing. It cannot make a skill load, and it
 * does not restate the doctrine - the skill bodies carry that, and duplicating them here
 * would spend the session's context on a second copy.
 *
 * @module dsh-model-everything-gate
 */
import type { Context, Volatile } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { ContextFormed } from '@deepseek-ai/dsh-llm';
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        'plugin:dsh-model-everything-gate': {
            kind: 'plugin:dsh-model-everything-gate';
        } & ContextFormed;
    }
}
export declare const name = "dsh-model-everything-gate";
/**
 * The default text. It names every skill the package ships, because its job is the routing
 * the catalog line cannot carry once the line is long; `tests/gate` fails when a skill is
 * added and this list is not, which is the only thing keeping the two in step.
 */
export declare const DEFAULT_GATE_TEXT = "<EXTREMELY_IMPORTANT>\nPlugin dsh-model-everything is installed. A claim about code is decided by one of its tools, not by reasoning it out: an API name, a path, an enum, \"always/never\", a timing or protocol guarantee, a schema or a migration, a diagram, a concurrency promise. Before answering one, load the skill whose \"Use when\" matches.\n\n- model-everything: claims against code, state machines, protocols\n- model-everything-uml: drawing a diagram, or reading one someone else drew\n- model-everything-structure: an architecture or dependency drawing\n- model-everything-design: layering, responsibilities, substitutability, interface width\n- model-everything-datamodel: a schema, a migration, a data guarantee\n- model-everything-concurrency: thread-safe, lock-free, ISR, shared state\n- model-everything-report-reading: reading a report this plugin returned\n\nThis message routes only. It checks nothing, and a skill that never loads decides nothing.\n</EXTREMELY_IMPORTANT>";
export interface Config {
    /** Whether the gate may be injected. Read through {@link injectionEnabled}. */
    enabled: Volatile<boolean> | boolean;
    /** The text to inject. Override in the profile's `cordis.patch.yml` row, not in a GUI form. */
    gateContent: string;
}
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    enabled: z<boolean, boolean, "defined">;
    gateContent: z<string, string, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    enabled: z<boolean, boolean, "defined">;
    gateContent: z<string, string, "defined">;
}>>, "plain">;
/**
 * Mount the gate.
 *
 * The listener is registered whether or not the switch is on: the switch is volatile, so
 * `apply` runs once and the value behind it can turn on later from the Plugins page.
 * Returning early here would freeze the decision for the lifetime of the mount.
 *
 * @param ctx - the plugin context.
 * @param config - the resolved plugin configuration.
 */
export declare function apply(ctx: Context, config: Config): void;
