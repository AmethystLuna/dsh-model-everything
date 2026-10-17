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
export declare const DEFAULT_GATE_TEXT = "<EXTREMELY_IMPORTANT>\nPlugin dsh-model-everything is active. It checks claims about designs and code: facts against the source, behaviour as an executable model, structure as a graph.\n\n**Unsure whether a check applies?** Load `model-everything` first. It is the entry point: it owns the doctrine, the model schema and the routing to its siblings.\n\n**Load the skill that matches the claim**: `model-everything` (entry point; claims, state machines), `model-everything-uml` (drawing a diagram, or reading one someone drew), `model-everything-structure` (an architecture or dependency drawing), `model-everything-design` (layering, responsibilities, substitutability, interface width), `model-everything-datamodel` (a schema, a migration, a data guarantee), `model-everything-concurrency` (thread-safe, lock-free, ISR; routing only), `model-everything-report-reading` (reading a report this plugin returned).\n\n**Tools** (dsh):\n\n- `model_verify` \u2014 one state machine: structural checks, adversarial probes, budgets, deadlines, before/after regression.\n- `model_compose_verify` \u2014 two or more machines: deadlock, and a rendezvous that never fires.\n- `model_datamodel_verify` \u2014 a data model and its migration: keys, domains, migration coverage, copy consistency, rollback symmetry.\n- `model_design_review` \u2014 a design against its own declarations: layering, boundaries, substitutability, interface width. The graph's shape is reported, not judged.\n- `model_concurrency_scan` \u2014 finds concurrency claims and routes them. It proves nothing about concurrency.\n- `model_export` \u2014 UPPAAL, TLA+, PRISM or SPIN input from a verified model. It exports; it does not check the target tool.\n- `uml_render`, `uml_parse`, `uml_review` \u2014 draw a model, read a diagram into one, audit one. Round-trip fidelity is measured, never assumed.\n- `uml_explain_labels` \u2014 the accepted label and comment forms for one notation.\n- `uml_structure_verify` \u2014 dependency review of a structure drawing, one level or several. It audits the drawing, not the code.\n- `report_diff` \u2014 baseline against current: what a change added, removed or changed.\n\n**Read a report**: gate on `verdict` (`pass`, `pass_with_findings`, `fail`), never on `ok`. `verdictReason` says why and `nextSteps` says what to do. `ran` says whether it executed, `checksRun` how much it examined: a `skip` is not a `pass`, and a code ending `_UNDECIDED` means the search hit its limit and decided nothing. Keys starting with `_` are notes: ignored, and left out of the model hash.\n</EXTREMELY_IMPORTANT>";
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
