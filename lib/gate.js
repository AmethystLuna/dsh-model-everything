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
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import z from '@deepseek-ai/schemastery';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
export const name = 'dsh-model-everything-gate';
/** Producer-owned message source kind declared in `MessageSourceMap` above. */
const GATE_SOURCE_KIND = 'plugin:dsh-model-everything-gate';
/**
 * The default text. It names every skill the package ships, because its job is the routing
 * the catalog line cannot carry once the line is long; `tests/gate` fails when a skill is
 * added and this list is not, which is the only thing keeping the two in step.
 *
 * The rule is stated at both ends, in different words. That is a measured change, not a
 * stylistic one: the single-statement version left the one case that needed the plugin - a
 * migration question the session believed it could answer from memory - with no skill loaded
 * and no tool run. Stating it at the start and restating it at the end fixed that case and
 * added no load on a control that must load nothing. Two sentences cost 403 characters; the
 * comparison is in the routing measurement under "第三臂".
 */
/** One row per skill: the request it answers, in the words a user would use. */
const SKILL_ROWS = {
    'model-everything': 'claims against code, state machines, protocols',
    'model-everything-uml': 'drawing a diagram, or reading one someone drew',
    'model-everything-structure': 'an architecture or dependency drawing',
    'model-everything-design': 'layering, responsibilities, substitutability, interface width',
    'model-everything-datamodel': 'a schema, a migration, a data guarantee',
    'model-everything-concurrency': 'thread-safe, lock-free, ISR, async interleaving; routing only',
    'model-everything-report-reading': 'reading a report this plugin returned',
};
/**
 * The skills this package actually ships, read from disk when the module loads.
 *
 * The table below advertises only these. A row for a skill that is not in the package sends the
 * model to a name that resolves to nothing, which is the one failure a routing message must not
 * have; a skill added without a row still gets an entry, reading "see its catalog line", so the
 * table can be incomplete but never wrong.
 */
export function shippedSkills() {
    try {
        return readdirSync(fileURLToPath(new URL('../skills/', import.meta.url)), { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort();
    }
    catch {
        return [];
    }
}
/**
 * The text, rendered from the skills that ship.
 *
 * The rule is stated at both ends, in different words. That is a measured change, not a stylistic
 * one: with a single statement, the one case that needed the plugin - a migration question the
 * session believed it could answer from memory - loaded no skill and ran no tool. Stated at the
 * start and restated at the end, it did both, and a control task was not over-triggered.
 *
 * The shape follows the ops plugin's injected section: a table that chooses between near-equals,
 * rows only for what is installed, and a rule against degrading silently when a tool refuses.
 *
 * @param skills - the skills to advertise; defaults to the ones on disk.
 * @param extraGuidance - a deployment's own sentence, appended last.
 */
export function renderGateText(skills = shippedSkills(), extraGuidance = '') {
    const rows = skills.map((skill) => '| ' + (SKILL_ROWS[skill] ?? 'see its catalog line') + ' | `' + skill + '` |');
    const extra = extraGuidance.trim();
    return `<EXTREMELY_IMPORTANT>
Before answering anything about code, a design or a diagram: load the skill whose row matches, and let its tool decide. Do not answer from memory first.

Plugin dsh-model-everything is active. It checks claims about designs and code: facts against the source, behaviour as an executable model, structure as a graph.

**Unsure which row applies?** Load \`model-everything\` first: it owns the doctrine, the model schema and the routing to its siblings.

| The request | The skill |
| --- | --- |
${rows.join('\n')}

**Tools** (dsh):

- \`model_verify\` — one state machine: structural checks, adversarial probes, budgets, deadlines, before/after regression.
- \`model_compose_verify\` — two or more machines: deadlock, a rendezvous that never fires, and - with \`shared\` + \`accesses\` - an unordered write (C4) or a non-atomic update (C5).
- \`model_datamodel_verify\` — a data model and its migration: keys, domains, migration coverage, copy consistency, rollback symmetry.
- \`model_design_review\` — a design against its own declarations: layering, boundaries, substitutability, interface width. The graph's shape is reported, not judged.
- \`model_interleaving_scan\` — finds claims about threads, synchronization, async and interrupts, names the family, and routes each to the tool that decides it. It proves nothing about any of them.
- \`model_export\` — UPPAAL, TLA+, PRISM or SPIN input from a verified model. It exports; it does not check the target tool.
- \`uml_render\`, \`uml_parse\`, \`uml_review\` — draw a model, read a diagram into one, audit one. Round-trip fidelity is measured, never assumed.
- \`uml_explain_labels\` — the accepted label and comment forms for one notation.
- \`uml_structure_verify\` — dependency review of a structure drawing, one level or several. It audits the drawing, not the code.
- \`report_diff\` — baseline against current: what a change added, removed or changed.

**Read a report**: gate on \`verdict\` (\`pass\`, \`pass_with_findings\`, \`fail\`), never on \`ok\`. \`verdictReason\` says why and \`nextSteps\` says what to do. \`ran\` says whether it executed, \`checksRun\` how much it examined: a \`skip\` is not a \`pass\`, and a code ending \`_UNDECIDED\` means the search hit its limit and decided nothing. Keys starting with \`_\` are notes: ignored, and left out of the model hash.

**When a tool refuses, or is not there.** Read its \`errorCode\` and fix the input before retrying; if the tool is not registered in this deployment, say so and use the general method. A check that nothing ran is not a passing check.${extra === '' ? '' : '\n\n' + extra}

The rule again, because it is the one that gets skipped: before answering anything about code, a design or a diagram, load the skill whose routing applies and let its tool decide - a claim you can check is not a claim you may answer from memory.
</EXTREMELY_IMPORTANT>`;
}
/** The shipped default: every row the package can advertise, no deployment guidance. */
export const DEFAULT_GATE_TEXT = renderGateText();
function live(field) {
    const probe = field;
    return typeof probe.volatile === 'function' ? probe.volatile() : field;
}
export const Config = z.object({
    // On by default, and live so a deployment can turn it off without a restart. The comparison that
    // decided this is in the routing measurement: at 2933 characters it fixed the one request class
    // the plugin otherwise never reached, and a control task was not over-triggered.
    enabled: live(z.boolean().default(true)),
    // Not volatile on purpose: the settings projection feeds a GUI form, and a kilobyte of
    // prose does not belong in one.
    gateContent: z.string().default(DEFAULT_GATE_TEXT),
    // The ops plugin's technique, adopted: a short free-text slot a deployment can use for its own
    // rule without forking the package. Appended last, so it is read after the routing.
    extraGuidance: z.string().default(''),
});
/**
 * Read the switch as a boolean, whichever shape this host produced.
 * @param config - the resolved plugin configuration.
 * @returns whether the gate may be injected.
 */
function injectionEnabled(config) {
    const value = config.enabled;
    return typeof value === 'boolean' ? value : value.get();
}
function gateText(config) {
    const extra = typeof config.extraGuidance === 'string' ? config.extraGuidance.trim() : '';
    return extra === '' ? config.gateContent : config.gateContent + '\n\n' + extra;
}
function gateMessage(text) {
    return createUserMessage({
        content: [{ type: 'text', text }],
        source: { kind: GATE_SOURCE_KIND },
    });
}
function readSessionEvents(session) {
    const source = session;
    if (typeof source.snapshotEvents === 'function') {
        const snapshot = source.snapshotEvents();
        if (Array.isArray(snapshot))
            return snapshot;
    }
    if (Array.isArray(source.events))
        return source.events;
    return [];
}
/**
 * Whether the gate already entered this session's durable history. The pre-step listener
 * re-appends the gate until it does; once a step committed it, every later step - and a
 * resume of a session that kept it - skips the injection. A gate dropped before any step
 * ran simply re-injects on the first step that does.
 * @param session - the agent's session.
 * @returns whether a gate message is already in the log.
 */
function gateInHistory(session) {
    return readSessionEvents(session).some((event) => {
        if (event.type !== 'user/message')
            return false;
        const source = event.data?.source;
        return source?.kind === GATE_SOURCE_KIND;
    });
}
/**
 * Model-visible status, so "is the gate on" is answered by inspection rather than by reading
 * a session transcript. A separate provider id from the main row: these are two components,
 * and one of them being mounted says nothing about the other.
 * @param config - the resolved plugin configuration.
 * @returns the inspect provider registration.
 */
function inspectProvider(config) {
    return {
        manifest: {
            id: 'dsh-model-everything-gate',
            description: 'The optional session-start routing message of dsh-model-everything: whether it is injected, and how much text it costs. It routes a request to a skill; it checks nothing.',
            methods: [
                {
                    name: 'status',
                    description: 'Read the gate status: whether injection is enabled and how long the injected text is.',
                    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
                    outputSchema: {
                        type: 'object',
                        description: 'Gate status.',
                        properties: {
                            enabled: { type: 'boolean', description: 'Whether the gate is injected into new sessions.' },
                            gateContentLength: { type: 'integer', description: 'Length in characters of the injected text.' },
                        },
                        additionalProperties: false,
                    },
                },
            ],
        },
        query: async (method) => {
            if (method === 'status') {
                return {
                    enabled: injectionEnabled(config),
                    gateContentLength: config.gateContent.length,
                };
            }
            return null;
        },
    };
}
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
export function apply(ctx, config) {
    // Catalog visibility is optional and the registry may be mounted after this row applies,
    // so registration is retried on each step until it lands.
    let providerRegistered = false;
    const registerProvider = () => {
        if (providerRegistered)
            return;
        const inspect = ctx.get('cordisInspect');
        if (inspect === undefined)
            return;
        try {
            ctx.effect(() => inspect.register(inspectProvider(config)), 'dsh-model-everything-gate: inspect provider');
            providerRegistered = true;
        }
        catch (error) {
            console.warn('[dsh-model-everything-gate] inspect provider registration failed', error);
        }
    };
    registerProvider();
    // Inject on the FIRST model step that runs, instead of at session start: a session-start
    // message lands in the inbox, which a blank-session preset switch can clear before the
    // first step. The pre-step decision is durable - the message enters history with the step,
    // and the guard below stops it from being added a second time.
    ctx.on('agent/pre-step', async ({ agent }, next) => {
        const decision = await next();
        if (decision.kind === 'reject')
            return decision;
        registerProvider();
        if (!injectionEnabled(config))
            return decision;
        if (gateInHistory(agent.session))
            return decision;
        return {
            kind: 'enter',
            messages: [...decision.messages, gateMessage(gateText(config))],
        };
    });
}
