/**
 * The timing diagram module.
 *
 * A timing diagram is an interaction seen against a clock: which participants exist,
 * what state each one is in over time, and what they send each other. It is not a
 * machine and not a trace, so it has its own model — lifelines, the time points they
 * change state at, the messages between them, and the duration constraints — its own
 * renderer, and its own review.
 *
 * PlantUML is the only notation that draws one. Mermaid has no timing diagram, and the
 * engine's capability table says so with a reason instead of drawing something else
 * under the name.
 *
 * @module model-everything-uml-timing
 */
import { type UmlNotation, type UmlFamilyModule, type UmlFamilyParse, type UmlFamilyRender, type UmlFamilyFinding } from './uml-syntax.js';
/**
 * What this module carries out of the PlantUML timing syntax, and what it does not.
 *
 * Carried: the lifeline kinds with their `period`, state points and ranges, relative
 * times, messages with their own time, and the `<->` duration constraints.
 *
 * Not carried, and reported as discarded constructs rather than dropped: participant
 * blocks (`@WB` with per-lifeline times), anchor points (`@XX as :name`), states with
 * comments or colours (`is Waiting : note`, `is Waiting #LightCyan`), `highlight`,
 * `note top of`, scale and date axes, `mode compact`, and the `has` state-order
 * declaration. Each is a real construct of the notation; none of them is a state or a
 * message, and inventing a model for them would be the fabrication this plugin exists to
 * refuse.
 *
 * The syntax reference is <https://plantuml.com/timing-diagram>.
 */
/**
 * How PlantUML draws a lifeline. The kind is part of the model, not decoration: a
 * `binary` lifeline can only be in two states, and a `clock` one carries a period.
 */
export type TimingLifelineKind = 'robust' | 'concise' | 'binary' | 'clock' | 'analog' | 'rectangle';
export interface TimingLifeline {
    id: string;
    /** Human-readable name, when the diagram gave one that differs from the id. */
    label?: string;
    /** Drawing style. Absent means PlantUML's default. */
    kind?: TimingLifelineKind;
    /** `clock` only: the period PlantUML draws the clock with. */
    period?: number;
}
/**
 * One state a lifeline is monitored in, over a half-open time interval `[from, to)`.
 *
 * `to` is optional in the input and always written on parse: a state runs until the
 * next one on the same lifeline begins. Carrying it makes "how long was it in this
 * state" a property of the model instead of a question about its neighbours.
 */
export interface TimingLifelineState {
    id: string;
    /** What the state means to a reader, when it is more than the id. */
    label?: string;
}
/**
 * One stretch of time a lifeline spends in a state, starting at `from`.
 *
 * There is no `to`. The PlantUML syntax has no way to say "this state ends here": a
 * lifeline is a list of changes, so the next change on the same lifeline *is* this
 * one's end. Carrying an explicit end would be a field the diagram cannot express, and
 * the round trip would drop it — which is exactly what it did before this field was
 * removed.
 */
export interface TimingSegment {
    /** The lifeline being monitored. */
    lifeline: string;
    /** The state it is in from `from` up to the next state change on the same lifeline. */
    state: string;
    from: number;
    /** PlantUML's `at <time> is <state>`, which marks the left edge as well. */
    atStart?: boolean;
}
export interface TimingMessage {
    from: string;
    to: string;
    time: number;
    label?: string;
}
/** `@a <-> @b : {duration}` between two moments of the timeline. */
export interface TimingConstraint {
    fromTime: number;
    toTime: number;
    /** The duration text as PlantUML draws it, braces included. */
    label?: string;
}
/**
 * A timing diagram as a model.
 *
 * Times are numbers on one axis for the whole diagram. Their unit is a property of the
 * diagram (`unit`), not of a point: `{ms}` on one arrow and `{s}` on the next would be
 * a diagram that cannot be read.
 */
export interface TimingModelV1 {
    schemaVersion: 1;
    /** The time unit the axis is drawn in, when the diagram declares one. */
    unit?: string;
    lifelines: TimingLifeline[];
    states: TimingLifelineState[];
    segments: TimingSegment[];
    messages: TimingMessage[];
    constraints: TimingConstraint[];
    /**
     * Ids a message or a segment named that no declaration introduced. PlantUML accepts
     * them and draws a bare timeline, which is exactly how a typo stays invisible.
     */
    undeclared?: string[];
    narrative?: {
        lifelines?: Record<string, string>;
        states?: Record<string, string>;
        unit?: string;
    };
}
/**
 * Validate a candidate model and normalize it.
 *
 * The contract other families keep: an undeclared key or a wrong type is a refusal with
 * `UML_INPUT`, never a silently dropped field. A model that renders into a diagram that
 * is not the model is worse than no diagram.
 */
export declare function validateTimingModel(input: unknown): TimingModelV1;
/**
 * Render a timing model as PlantUML.
 *
 * @param input - candidate `TimingModelV1`.
 * @param notation - only `plantuml` draws a timing diagram; another notation is refused
 *   by the capability table before reaching here.
 */
export declare function renderTiming(input: unknown, notation: UmlNotation): UmlFamilyRender;
/**
 * Read PlantUML timing text back into a model.
 *
 * Two sources are read together, and the diagram wins where they disagree: the diagram
 * is what a reader sees. The directives carry only what the syntax cannot spell — the
 * exact state ids, the explicit end of a segment, the unit — so a hand-written diagram
 * with no directives still parses into a complete model.
 */
export declare function parseTiming(text: string, notation: UmlNotation): UmlFamilyParse<TimingModelV1>;
export type TimingFindingCode = 'UML042_TIMING_NO_LIFELINES' | 'UML043_TIMING_EMPTY_LIFELINE' | 'UML044_TIMING_TIME_ORDER' | 'UML045_TIMING_SIMULTANEOUS_STATES' | 'UML046_TIMING_UNDECLARED_REFERENCE' | 'UML047_TIMING_CONSTRAINT_RANGE' | 'UML048_TIMING_STATE_UNUSED' | 'UML049_TIMING_UNDOCUMENTED';
export declare const TIMING_FINDING_CODES: readonly TimingFindingCode[];
/**
 * What a reader would get wrong about a timing diagram.
 *
 * The checks read the model alone: whether a duration is achievable is a question about
 * the system, not about the diagram, and it is not answered here.
 */
export declare function reviewTimingModel(model: TimingModelV1, labels: Record<string, string>): UmlFamilyFinding[];
/** The timing family, as the engine's registry expects it. */
export declare const timingModule: UmlFamilyModule<TimingModelV1>;
