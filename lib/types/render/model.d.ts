/**
 * The diagram a renderer draws, in the notation it came from being nobody's business.
 *
 * Every source - a verification report, a Mermaid file, a PlantUML component diagram, a dependency scan -
 * is reduced to this one shape before anything is laid out. A renderer that understood notations would have
 * to be changed for each of them; a renderer that understands this does not.
 *
 * Pure data, no functions: a model can be serialised, compared and asserted.
 */
/** What a node is, as far as colour is concerned. */
export type NodeRole = 'normal' | 'error' | 'warning' | 'muted';
export interface DiagramNode {
    id: string;
    /** The text drawn inside the box. Defaults to the id when a notation labelled it. */
    label?: string;
    role: NodeRole;
}
export interface DiagramEdge {
    from: string;
    to: string;
    label: string;
    /** A dashed edge, for notations that distinguish one. */
    dashed?: boolean;
}
export interface DiagramGroup {
    id: string;
    label: string;
    /** The nodes drawn inside it. A group is a box around boxes, not a box itself. */
    members: string[];
}
export interface Diagram {
    kind: 'machine' | 'graph' | 'none';
    /** The state the machine starts in, when the source declared one. */
    init?: string;
    title: string;
    nodes: DiagramNode[];
    edges: DiagramEdge[];
    groups?: DiagramGroup[];
    /** One line under the drawing: what was decided, in words the drawing cannot carry. */
    caption: string;
}
/** An empty drawing, for a source that produced no nodes. */
export declare function emptyDiagram(title: string, caption: string): Diagram;
/** The label to draw for a node: its own label when the notation gave one, else its id. */
export declare function labelOf(node: DiagramNode): string;
