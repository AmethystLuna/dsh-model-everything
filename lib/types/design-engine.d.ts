/**
 * The design-review engine: shape, and the declared design principles.
 *
 * This is not the verification engine. That one decides whether a machine can misbehave;
 * this one decides whether a design keeps the contracts it declares about *itself* - which
 * layers may depend on which, which responsibility owns which dependency, which subtype may
 * refuse which event. The two answer different questions and their verdicts mean different
 * things, which is why they are two engines and two tools.
 *
 * Three levels, kept apart in the report because they are not the same claim:
 *
 * - **violations** - the design contradicts something it declared. These decide `verdict`.
 * - **signals** - a structural fact worth a reader's attention, reported without claiming it
 *   is wrong. A hub with high fan-in is a fact about a graph; whether it is a design defect
 *   depends on the design, and nothing here knows that.
 * - **facts** - counts and computed structure, for a reader or another tool.
 *
 * What this engine does *not* do is judge a design. It never says a decomposition is good,
 * a responsibility name is meaningful, or an abstraction is the right one. It compares a
 * design against its own declarations and computes features of its graph, and the wording of
 * every finding says which of those it is.
 *
 * @module model-everything-design-engine
 */
import { REPORT_SCHEMAS, type Finding, type Verdict } from './engine.js';
export { REPORT_SCHEMAS };
/** How a type is drawn and what it promises. */
export type DesignStereotype = 'class' | 'interface' | 'abstract-class' | 'enum' | 'component' | 'abstract-component';
export interface DesignOperation {
    name: string;
    /** Parameter type names, positional: `['Money']`. */
    parameters?: string[];
    returns?: string;
}
/** A declared state change, used only where behaviour is part of the contract. */
export interface DesignEvent {
    event: string;
    /** A guard the model states in words; compared as text, never parsed. */
    guard?: string;
}
export interface DesignResponsibility {
    name: string;
    /** The dependencies this responsibility owns. */
    uses: string[];
}
/** A type, with whatever the model chose to say about it. */
export interface DesignType {
    name: string;
    stereotype: DesignStereotype;
    /** The type this one specialises, when the model declares one. */
    extends?: string;
    implements?: string[];
    /** Operations the type exposes, for signature and interface checks. */
    operations?: DesignOperation[];
    /** Events the type handles. Its presence is what makes behaviour checkable. */
    transitions?: DesignEvent[];
    /** Events the type refuses. A refusal its supertype does not also declare is a violation. */
    forbids?: DesignEvent[];
    /** Declared responsibilities, each owning a subset of the dependencies. */
    responsibilities?: DesignResponsibility[];
    /** Types this one depends on, by name. */
    dependsOn?: string[];
    /** What this type calls on another, operation by operation: the interface-segregation input. */
    uses?: Array<{
        type: string;
        operations: string[];
    }>;
    /** The layer the model places this type in, when it places it. */
    layer?: string;
}
/** A declared layer: an ordered band of the design. */
export interface DesignLayer {
    name: string;
    members: string[];
}
/** A declared boundary of responsibility; not ordered, unlike a layer. */
export interface DesignBoundary {
    name: string;
    members: string[];
}
/** One rule about which edges may exist. Deny beats allow. */
export interface DesignEdgeRule {
    id: string;
    source: string;
    allow?: string[];
    deny?: string[];
}
/** A dependency the design says must exist. */
export interface DesignRequirement {
    id: string;
    from: string;
    to: string;
}
/**
 * A design as a model.
 *
 * `architecture` is the dependency graph every shape feature is computed from. `types` is the
 * vocabulary that makes the principle checks possible at all: with no `extends` there is no
 * substitutability to check, with no `uses` no interface can be called fat. An empty
 * vocabulary is not a pass - it is a design that declared nothing for those checks to hold
 * it to, and the report says so.
 */
export interface DesignModelV1 {
    schemaVersion: 1;
    /** What this design is, for a reader; carried into the report unchanged. */
    artifact?: string;
    architecture: {
        nodes: string[];
        edges: Array<[string, string]>;
    };
    types?: DesignType[];
    declare?: {
        layers?: DesignLayer[];
        boundaries?: DesignBoundary[];
        allowedEdges?: DesignEdgeRule[];
        requiredEdges?: DesignRequirement[];
    };
    narrative?: {
        types?: Record<string, string>;
    };
}
export interface DesignValidation {
    ok: boolean;
    errors: string[];
    model?: DesignModelV1;
}
/**
 * Validate a candidate design.
 *
 * The schema is closed, for the reason the verification engine gives: a mistyped field is not
 * a missing feature, it is a different design, and reviewing the wrong one silently is worse
 * than refusing.
 */
export declare function validateDesignModel(input: unknown): DesignValidation;
export interface GraphFeatures {
    nodes: number;
    edges: number;
    components: number;
    /** McCabe's cyclomatic complexity over the dependency graph: E - V + 2P. */
    cyclomatic: number;
    density: number;
    /** The largest strongly connected component, and its members when it has more than one. */
    largestCycle: string[];
    /** One canonical peeling: remove these and the graph is acyclic. */
    /** The edges whose removal makes the graph acyclic, and whether that count is a proven minimum. */
    feedbackArcs: {
        edges: Array<[string, string]>;
        exact: boolean;
        note: string;
    };
    /** Removing one of these disconnects the graph. */
    articulationPoints: string[];
    /** Removing one of these disconnects the graph. */
    bridges: Array<[string, string]>;
    /** Longest-path rank over the condensation; one band per layer the design actually has. */
    ranks: Record<string, number>;
    /** Fan-out per node: how many distinct dependencies it has. */
    fanOut: Record<string, number>;
    /** Fan-in per node: how many distinct dependents it has. */
    fanIn: Record<string, number>;
    /** Pairs that depend on each other. */
    mutualPairs: Array<[string, string]>;
}
/** Every shape feature, computed once so every check reads the same numbers. */
export declare function designFeatures(model: DesignModelV1): GraphFeatures;
interface CheckResult {
    id: string;
    name: string;
    status: 'pass' | 'fail' | 'skip';
    detail: string;
    findings: Finding[];
}
export type DesignPrincipleLevel = 'violation' | 'signal' | 'fact';
/** Which level each code belongs to, so a reader never has to guess. */
export declare const DESIGN_CODE_LEVEL: Record<string, DesignPrincipleLevel>;
export interface DesignReport {
    ok: boolean;
    ran: boolean;
    verdict: Verdict;
    verdictReason: string;
    schema: typeof REPORT_SCHEMAS.design;
    artifact?: string;
    /** The check-by-check results, in a fixed order. */
    checks: CheckResult[];
    /** Violations of something the design declared. These decide `verdict`. */
    violations: Finding[];
    /** Structural facts a reader should see, reported without claiming they are wrong. */
    signals: Finding[];
    /** Counts and computed structure. */
    facts: Record<string, unknown>;
    summary: {
        errors: number;
        warnings: number;
        info: number;
        checksRun: number;
        nodes: number;
        edges: number;
    };
    hashes: {
        modelHash: string;
    };
    modelHash: string;
    nextSteps: string[];
}
/**
 * Review a design: its graph, and the contracts it declares about itself.
 *
 * Read `verdict`, never `ok`. A design that declares nothing gets `pass` with an empty
 * vocabulary only for the checks that had something to hold it to - which is why the report
 * carries each check's `status` and `detail`, and why `facts.declared` says how much the
 * model actually declared.
 */
export declare function runDesignReview(input: unknown): DesignReport;
/** A stable hash of the design, for a baseline diff or an archive record. */
export declare function designHash(model: DesignModelV1): string;
