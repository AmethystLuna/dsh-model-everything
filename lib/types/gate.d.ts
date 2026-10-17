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
 * The skills this package actually ships, read from disk when the module loads.
 *
 * The table below advertises only these. A row for a skill that is not in the package sends the
 * model to a name that resolves to nothing, which is the one failure a routing message must not
 * have; a skill added without a row still gets an entry, reading "see its catalog line", so the
 * table can be incomplete but never wrong.
 */
export declare function shippedSkills(): string[];
/**
 * The text, rendered from the skills that ship.
 *
 * The rule is stated at both ends, in different words. That is a measured change, not a stylistic
 * one: with a single statement, the one case that needed the plugin - a migration question the
 * session believed it could answer from memory - loaded no skill and ran no tool. Stated at the
 * start and restated at the end, it did both, and a control task was not over-triggered.
 *
 * The shape follows a neighbouring plugin's injected section: a table that chooses between near-equals,
 * rows only for what is installed, and a rule against degrading silently when a tool refuses.
 *
 * @param skills - the skills to advertise; defaults to the ones on disk.
 * @param extraGuidance - a deployment's own sentence, appended last.
 */
export declare function renderGateText(skills?: string[], extraGuidance?: string): string;
/** The shipped default: every row the package can advertise, no deployment guidance. */
export declare const DEFAULT_GATE_TEXT: string;
export interface Config {
    /** Whether the gate is injected. Read through {@link injectionEnabled}. On unless a deployment says otherwise. */
    enabled: Volatile<boolean> | boolean;
    /** The text to inject. Override in the profile's `cordis.patch.yml` row, not in a GUI form. */
    gateContent: string;
    /** A deployment's own sentence, appended to whatever text is injected. */
    extraGuidance: string;
}
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    enabled: z<boolean, boolean, "defined">;
    gateContent: z<string, string, "defined">;
    extraGuidance: z<string, string, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    enabled: z<boolean, boolean, "defined">;
    gateContent: z<string, string, "defined">;
    extraGuidance: z<string, string, "defined">;
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
