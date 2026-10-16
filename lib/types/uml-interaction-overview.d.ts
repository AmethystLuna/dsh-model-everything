/**
 * The interaction overview diagram module.
 *
 * An interaction overview is a control-flow graph whose nodes are interactions: a start, a
 * decision, one or more references to interactions, and a stop. PlantUML has no page for it
 * and no dedicated type, but the drawing is expressible with the activity diagram's
 * vocabulary plus a reference node - `start`, `:ref Login sequence;`, `if (ok?) then (yes)`
 * - which is what the notation research in this repository recorded as the manual form.
 *
 * So this family is drawn approximately, like the composite structure and the
 * communication diagram, and for the same reason the family table used to refuse it on
 * grounds that were simply wrong ("neither notation spells the inline interaction
 * references": it does).
 *
 * Reading it back is partial, and the parser refuses the part it cannot do. A sequence and
 * an `if`/`else` are spelled clearly enough to reconstruct. A `fork` is not: the notation
 * opens a `fork` block, lists the flows, and closes it with `end fork`, and the closing
 * marker carries no label tying it to the opening one, so nested or adjacent forks cannot
 * be told apart. Rather than guess, a diagram containing one is refused with that reason.
 *
 * @module model-everything-uml-interaction-overview
 */
import { type UmlNotation, type UmlFamilyModule, type UmlFamilyParse, type UmlFamilyRender, type UmlFamilyFinding } from './uml-syntax.js';
/** What a node of the overview is. */
export type InteractionOverviewNodeKind = 'initial' | 'final' | 'decision' | 'merge' | 'interaction' | 'reference';
export interface InteractionOverviewNode {
    id: string;
    kind: InteractionOverviewNodeKind;
    /** The interaction this node runs, inline (`interaction`) or by reference (`reference`). */
    interaction?: string;
    label?: string;
}
export interface InteractionOverviewEdge {
    from: string;
    to: string;
    /** The condition on the branch, as the diagram writes it. */
    condition?: string;
}
/**
 * An interaction overview diagram as a model.
 *
 * The flow is what the diagram is: nodes and the edges between them. `interaction` and
 * `reference` are kept apart because they are different facts - one is the interaction
 * written here, the other is a name that points somewhere else and may not exist.
 */
export interface InteractionOverviewModelV1 {
    schemaVersion: 1;
    nodes: InteractionOverviewNode[];
    edges: InteractionOverviewEdge[];
    /** Ids an edge named that no node declaration introduced. */
    undeclared?: string[];
    narrative?: {
        nodes?: Record<string, string>;
    };
}
/**
 * Validate a candidate model and normalize it.
 *
 * One initial node, and every node reachable from it: an overview whose flow starts nowhere
 * is a drawing, not a flow. That is a refusal rather than a finding because every later
 * check would be reading a graph with no entry.
 */
export declare function validateInteractionOverviewModel(input: unknown): InteractionOverviewModelV1;
/**
 * Render an interaction overview as Mermaid.
 *
 * Mermaid is the notation this family is drawn in, because the view is an activity graph
 * and PlantUML's activity syntax is refused by this build (a structured flowchart language
 * cannot carry a graph with merges or cycles without a while/if reconstruction). A Mermaid
 * flowchart carries exactly what an overview is: nodes, labelled branches, and a start and
 * an end.
 *
 * @param input - candidate `InteractionOverviewModelV1`.
 * @param notation - only `mermaid` draws this family.
 */
export declare function renderInteractionOverview(input: unknown, notation: UmlNotation): UmlFamilyRender;
export declare function parseInteractionOverview(_text: string, _notation: UmlNotation): UmlFamilyParse<InteractionOverviewModelV1>;
export type InteractionOverviewFindingCode = 'UML069_OVERVIEW_NO_INITIAL' | 'UML070_OVERVIEW_NODE_UNREACHABLE' | 'UML071_OVERVIEW_DECISION_ONE_BRANCH' | 'UML072_OVERVIEW_REFERENCE_UNDECLARED' | 'UML073_OVERVIEW_NODE_WITHOUT_INTERACTION' | 'UML074_OVERVIEW_UNDOCUMENTED';
export declare const INTERACTION_OVERVIEW_FINDING_CODES: readonly InteractionOverviewFindingCode[];
/**
 * What a reader would get wrong about an interaction overview.
 *
 * The overview's job is to say how the interactions fit together, so the checks are about
 * the flow being a flow: one way in, every node on some path from it, a decision that
 * actually decides. Whether the referenced interactions exist is a question about the other
 * diagrams - this plugin holds no registry of them - so an undeclared reference is reported
 * as a name nothing here can resolve, not as a missing interaction.
 */
export declare function reviewInteractionOverviewModel(model: InteractionOverviewModelV1, labels: Record<string, string>): UmlFamilyFinding[];
/** The interaction overview family, as the engine's registry expects it. */
export declare const interactionOverviewModule: UmlFamilyModule<InteractionOverviewModelV1>;
