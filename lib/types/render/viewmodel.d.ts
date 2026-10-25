/**
 * What a tool card shows, reduced to a drawing.
 *
 * The input is what the host hands a settled tool view: the arguments that were sent and the result that
 * came back. Neither is trusted - a view runs during streaming too, when the result does not exist yet -
 * so every field is read defensively and an absent one removes a shape rather than throwing.
 *
 * Pure. Everything decided here is a fact a test can assert: which nodes exist, which edges, why they are
 * coloured the way they are.
 */
export interface DiagramNode {
    id: string;
    /** The verdict or severity this node carries, when the report says something about it. */
    role: 'normal' | 'error' | 'warning' | 'muted';
}
export interface DiagramEdge {
    from: string;
    to: string;
    label: string;
}
export interface Diagram {
    kind: 'machine' | 'graph' | 'none';
    /** The state the machine starts in, when the model declared one. */
    init?: string;
    title: string;
    nodes: DiagramNode[];
    edges: DiagramEdge[];
    /** One line under the drawing: what the report decided, in words the drawing cannot carry. */
    caption: string;
}
export declare function viewModel(input: {
    phase?: unknown;
    args?: unknown;
    result?: unknown;
    toolName?: unknown;
}): Diagram;
