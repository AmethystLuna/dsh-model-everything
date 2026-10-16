/**
 * UML front end for LogicModelV1 — model a code flow as a UML diagram, then
 * review the modelling itself.
 *
 * Two halves, one data flow:
 *
 *   1. `renderUml` turns a validated LogicModelV1 into Mermaid or PlantUML text
 *      (state machine, activity/flow, or sequence trace). The diagram is a
 *      *view*: it never invents structure the model does not have, and anything
 *      the notation cannot express is reported as a warning instead of being
 *      dropped silently.
 *   2. `parseUml` reads that text back into a LogicModelV1, and `reviewUml`
 *      compares the two. That comparison is the point of the feature: a UML
 *      diagram of a code flow is itself a model, and a model can be wrong —
 *      ambiguous branches, dead ends, flows nobody can enter, symbols the
 *      source never names. A diagram that does not round-trip to the model it
 *      was drawn from is mis-modelled, and the review says so.
 *
 * Why the round trip is the fidelity check: rendering and parsing are inverse
 * only if every construct survives the notation. The generated text carries
 * `dsh-model-everything:` directives (ignored by Mermaid/PlantUML renderers) that pin the
 * initial state, the terminal states and any state id the notation cannot spell
 * verbatim, so an exact comparison is possible rather than a fuzzy one.
 *
 * The review deliberately does NOT replace `model_verify`: it checks the
 * modelling (structure the diagram claims, documentation coverage, notation
 * fidelity), while S1-S8/A1-A14 check the machine's behaviour (guard
 * exhaustiveness under real valuations, invariant paths, deadlock/liveness in
 * the runtime state space). Findings name the engine check to run next.
 *
 * @module model-everything-uml
 */
import { type HashSpec, type NarrativeCoverage, type ReportSchema, type Verdict } from './engine.js';
import type { GuardNode, LogicModelV1, UpdateSpec } from './engine.js';
import { type UmlNotation, type UmlFamilyId } from './uml-syntax.js';
import { type UseCaseModelV1 } from './uml-usecase.js';
import { type StructureModelV1 } from './uml-structure.js';
import { type TimingModelV1 } from './uml-timing.js';
import { type ProfileModelV1 } from './uml-profile.js';
import { type CompositeModelV1 } from './uml-composite.js';
import { type CommunicationModelV1 } from './uml-communication.js';
import { type InteractionOverviewModelV1 } from './uml-interaction-overview.js';
export { UmlError, UML_NOTATIONS } from './uml-syntax.js';
export type { UmlNotation, UmlFamilyId } from './uml-syntax.js';
export { validateTimingModel, reviewTimingModel, TIMING_FINDING_CODES, parseTiming, renderTiming } from './uml-timing.js';
export type { TimingModelV1, TimingSegment, TimingLifeline, TimingFindingCode } from './uml-timing.js';
export { validateProfileModel, reviewProfileModel, PROFILE_FINDING_CODES, renderProfile, profileModule } from './uml-profile.js';
export type { ProfileModelV1, ProfileExtension, ProfileApplication, ProfileFindingCode } from './uml-profile.js';
export { validateCompositeModel, reviewCompositeModel, COMPOSITE_FINDING_CODES, renderComposite, parseComposite, compositeModule } from './uml-composite.js';
export type { CompositeModelV1, CompositePart, CompositePort, CompositeConnector, CompositeFindingCode } from './uml-composite.js';
export { validateCommunicationModel, reviewCommunicationModel, COMMUNICATION_FINDING_CODES, renderCommunication, parseCommunication, communicationModule, communicationSequenceOrder } from './uml-communication.js';
export type { CommunicationModelV1, CommunicationLifeline, CommunicationMessage, CommunicationFindingCode } from './uml-communication.js';
export { validateInteractionOverviewModel, reviewInteractionOverviewModel, INTERACTION_OVERVIEW_FINDING_CODES, renderInteractionOverview, parseInteractionOverview, interactionOverviewModule } from './uml-interaction-overview.js';
export type { InteractionOverviewModelV1, InteractionOverviewNode, InteractionOverviewEdge, InteractionOverviewFindingCode } from './uml-interaction-overview.js';
/**
 * The diagram families this front end knows, in the engine's order. The name is kept
 * for callers that already use it: it is now the whole UML 2.5 family list rather
 * than the three machine views.
 */
export type UmlDiagram = UmlFamilyId;
export declare const UML_DIAGRAMS: readonly UmlDiagram[];
/**
 * What the caller is going to do with the artifact, declared up front.
 *
 * The view follows the question, not the machine, so the tool cannot pick it. What it
 * can do is refuse a pairing that cannot serve the question — before the work, not as
 * a finding after it.
 */
export type UmlIntent = 'present' | 'verify' | 'fidelity';
export declare const UML_INTENTS: readonly UmlIntent[];
/** The tool actions, for the entry check. `labels` is `action=explain-labels`. */
export type UmlIntentAction = 'render' | 'parse' | 'review' | 'labels';
export interface UmlRenderResult {
    notation: UmlNotation;
    diagram: UmlDiagram;
    /** The diagram source; hand this to the user or a renderer as-is. */
    primary: string;
    warnings: string[];
}
/** What a family's parse produces: a LogicModelV1 for the machine families, the family model otherwise. */
export type UmlFamilyModel = LogicModelV1 | UseCaseModelV1 | StructureModelV1 | TimingModelV1 | ProfileModelV1 | CompositeModelV1 | CommunicationModelV1 | InteractionOverviewModelV1;
export interface UmlParseResult {
    notation: UmlNotation;
    diagram: UmlDiagram;
    /** Which family model `model` holds. */
    family: UmlFamilyId;
    model: UmlFamilyModel;
    /**
     * Display labels found in the diagram, keyed by state id. They are how a
     * reader learns what a symbol means; a missing entry is an undocumented
     * symbol, which the review reports.
     */
    labels: Record<string, string>;
    /**
     * Declarations found in the text that LogicModelV1 cannot represent. A non-empty
     * list means the parsed model is NOT this diagram: the text belongs to another
     * diagram family (component, package, class, deployment, …), so whatever came
     * out is a by-product of reading keywords the parser does not own.
     */
    discardedConstructs: DiscardedConstruct[];
    /**
     * Arrows whose endpoints were declared by a discarded construct. They survive
     * parsing as state transitions, which is exactly why they are counted out loud.
     */
    discardedEdges: number;
    warnings: string[];
}
/** One declaration the parser could not represent, with the source line that carried it. */
export interface DiscardedConstruct {
    /** The construct keyword, lower-cased (`component`, `package`, `classDiagram`). */
    construct: string;
    /** 1-based line number in the diagram source. */
    line: number;
    /** The source line, trimmed. */
    text: string;
}
export interface UmlFinding {
    code: string;
    severity: 'error' | 'warning' | 'info';
    message: string;
    states?: string[];
    events?: string[];
    transitions?: Array<{
        from: string;
        event: string;
        to: string;
    }>;
    detail?: string;
    /** Machine-readable context for the finding (ids, coverage, rule matches), same shape as the engine's findings. */
    evidence?: Record<string, unknown>;
}
export interface UmlRoundTripReport {
    notation: UmlNotation;
    diagram: UmlDiagram;
    ok: boolean;
    /** Which published hash specification the two hashes follow (see references/hash-spec.md). */
    hashSpec: HashSpec;
    modelHash: string;
    parsedHash: string;
    diffs: string[];
    warnings: string[];
}
export interface UmlReviewReport {
    /** The review ran and produced this report. It does NOT mean the modelling passed — read `verdict`. */
    ok: boolean;
    ran: boolean;
    verdict: Verdict;
    verdictReason: string;
    /** The versioned report contract this result follows. */
    schema: ReportSchema;
    source: 'model' | 'diagram' | 'model+diagram';
    /** Which UML family this review covers. */
    family?: UmlFamilyId;
    /** Element counts for a family whose model is not a machine. */
    familySummary?: {
        actors?: number;
        useCases?: number;
        relations?: number;
        nodes?: number;
        edges?: number;
    };
    summary: {
        errors: number;
        warnings: number;
        info: number;
        states: number;
        events: number;
        transitions: number;
        terminalStates: number;
        reachableStates: number;
        documentedStates: number;
    };
    findings: UmlFinding[];
    roundTrip: UmlRoundTripReport | null;
    /** Diagram display labels, when a diagram took part in the review. */
    labels?: Record<string, string>;
    /** Model parsed from the diagram, when a diagram was given (a machine feeds `model_verify`). */
    model?: UmlFamilyModel;
    /** Diagram rendered from the model, when only a model was given. */
    primary?: string;
    /** Paths of the `_`-prefixed metadata keys found in the supplied model, when it carried any. */
    metadataKeys?: string[];
    /** How much of the model the narrative documents; absent when there is no narrative. */
    narrativeCoverage?: NarrativeCoverage;
    /** Hashes of what was reviewed, in one place. */
    hashes: {
        hashSpec: HashSpec;
        modelHash?: string;
        parsedHash?: string;
    };
    /** Declarations the parser could not represent; a non-empty list fails the review. */
    discardedConstructs?: DiscardedConstruct[];
    /** Arrows whose endpoints came from a discarded construct. */
    discardedEdges?: number;
    warnings: string[];
    nextSteps: string[];
}
/** Canonical guard text. Rendering wraps every composite node in parentheses, and the parser flattens same-operator chains, so render∘parse is the identity. */
export declare function guardText(node: GuardNode): string;
/**
 * Refuse a view the requested notation cannot draw, before any work. The entry check
 * every caller already used now asks the engine and the registry.
 */
export declare function assertUmlView(notation: UmlNotation, diagram: UmlDiagram): void;
/**
 * Refuse, before any work, a request whose declared purpose the view cannot serve.
 *
 * Without an intent this changes nothing: the review still reports `UML019` when the
 * fidelity check does not apply to the view it was given. With one, an impossible
 * pairing is an error carrying a code, instead of a report about the wrong artifact —
 * which is the failure this check exists to prevent.
 *
 * @param intent - the declared purpose, or `undefined` to leave the behaviour unchanged.
 * @param action - which action is about to run.
 * @param view - the requested `(notation, diagram)`, for the actions that have one.
 */
export declare function checkUmlIntent(intent: UmlIntent | undefined, action: UmlIntentAction, view?: {
    notation: UmlNotation;
    diagram: UmlDiagram;
}): void;
/**
 * Render a LogicModelV1 as UML.
 *
 * Mermaid covers all three views; PlantUML covers state and sequence (see
 * `assertUmlView` for why activity is refused).
 *
 * @param input - candidate LogicModelV1.
 * @param notation - `mermaid` (default) or `plantuml`.
 * @param diagram - `state` (default), `activity`, or `sequence`.
 * @param maxSteps - cap on the sequence trace length.
 * @param intent - what the diagram is for; a view that cannot serve it is refused first.
 */
export declare function renderUml(input: unknown, notation?: UmlNotation, diagram?: UmlDiagram, maxSteps?: number, intent?: UmlIntent): UmlRenderResult;
/** Parse a guard expression such as `(retry < 3 && armed == true)`. */
export declare function parseGuardText(text: string): GuardNode;
/** Parse a UML action clause such as `retry := retry + 1, armed := true`. */
export declare function parseUpdatesText(text: string, warnings: string[]): UpdateSpec[];
/**
 * Findings a parse result carries on its own. A diagram from another family parses
 * into something; without this finding that something is presented as a model of the
 * file, which is a false guarantee of exactly the kind this plugin exists to prevent.
 */
export declare function parseFindings(parsed: UmlParseResult): UmlFinding[];
/** One accepted way of writing a state's meaning into a diagram label. */
export interface LabelForm {
    form: string;
    example: string;
    note: string;
}
export interface LabelExplanation {
    notation: UmlNotation;
    /** The comment prefix a `dsh-model-everything:` directive uses in this notation. */
    directivePrefix: string;
    directiveLines: Array<{
        example: string;
        meaning: string;
    }>;
    /** Accepted label spellings, in the order `documentedMeaning` accepts them. */
    acceptedLabelForms: LabelForm[];
    /** What the renderer itself writes, so a hand-edited diagram can match it. */
    renderedForm: string;
    ignoredLines: Array<{
        pattern: string;
        behaviour: string;
    }>;
    rules: string[];
}
/**
 * What the front end expects of labels and comments, so "why does my hand-drawn diagram
 * report label drift or ignored lines?" has a printed answer instead of a guess.
 * `tests/uml/run.mjs` feeds every claim here back through the parser, so this text cannot
 * drift away from the behaviour it describes.
 */
export declare function explainLabels(notation?: UmlNotation): LabelExplanation;
/**
 * Parse a Mermaid or PlantUML diagram back into a LogicModelV1.
 *
 * State and activity diagrams carry the whole machine, so they parse into a
 * complete model. Sequence diagrams do not: a trace shows the paths that were
 * walked, not the branches that were not, so parsing one would silently prune
 * the machine. That case is refused rather than approximated.
 *
 * @param text - diagram source.
 * @param notation - `auto` (default) detects Mermaid vs PlantUML from the text.
 */
export declare function parseUml(text: string, notation?: UmlNotation | 'auto'): UmlParseResult;
/** Compare two machines by structure — the fidelity measure behind the round-trip check. */
export declare function diffModels(left: LogicModelV1, right: LogicModelV1): string[];
export interface UmlReviewOptions {
    /** LogicModelV1 to review. Provide it, `diagram`, or both. */
    model?: unknown;
    /** Diagram text: reviewed on its own, or compared against `model` when both are given. */
    diagram?: string;
    notation?: UmlNotation | 'auto';
    diagramKind?: UmlDiagram;
    /** Render-and-reparse fidelity check (default true; only meaningful with a model). */
    roundTrip?: boolean;
    /** Cap on the sequence trace used for the fidelity check. */
    maxSteps?: number;
    /** What the review is for; a view that cannot serve it is refused before any work. */
    intent?: UmlIntent;
}
export declare function reviewUml(options: UmlReviewOptions): UmlReviewReport;
