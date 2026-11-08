/**
 * Thx diagram a renderer draws, in the notation it came from being nobody's business.
 *
 * Every source - a verification report, a Mermaid file, a PlantUML component diagram, a dependency scan -
 * is reduced to this one shape before anything is laid out. A renderer that understood notations would have
 * to be changed for each of them; a renderer that understands this does not.
 *
 * Pure data, no functions: a model can be serialised, compared and asserted.
 */

/** What a node is, as far as colour is concerned. */
export type NodeRole = 'normal' | 'error' | 'warning' | 'muted'

/** The symbol a node is drawn as. UML and Mermaid both distinguish these; the notation decides which one applies. */
export type NodeShape =
  | 'rect'
  | 'diamond'
  | 'cylinder'
  | 'stadium'
  | 'circle'
  | 'subroutine'
  | 'hexagon'
  | 'note'
  | 'file'
  | 'card'
  | 'frame'
  | 'queue'
  | 'stack'
  | 'storage'
  | 'boundary'
  | 'control'
  | 'collections'

export interface DiagramNode {
  id: string
  /** The text drawn inside the box. Defaults to the id when a notation labelled it. */
  label?: string
  role: NodeRole
  /** Defaults to a rectangle: a node the source gave no shape has no shape to draw. */
  shape?: NodeShape
}

/**
 * What an edge's head means, when the notation distinguished it.
 *
 * The painter draws the meaning: a plain arrow for an association, a hollow triangle for a generalisation or a
 * realisation, a filled diamond at the source for a composition, a hollow one for an aggregation, and a dashed
 * line for the two dependency-flavoured kinds.
 */
export type EdgeArrow =
  | 'association'
  | 'dependency'
  | 'generalization'
  | 'realization'
  | 'composition'
  | 'aggregation'
  /** A line with no head: `A -- B`, which states a connection and no direction. */
  | 'none'

export interface DiagramEdge {
  from: string
  to: string
  label: string
  /** A dashed edge, for notations that distinguish one. */
  dashed?: boolean
  /**
   * The arrow the notation stated. Absent means the plain arrow every edge has been drawn with: a Mermaid edge
   * states no arrow type, so it carries no field and is drawn exactly as before.
   */
  arrow?: EdgeArrow
  /**
   * An edge that ranks and is not drawn: `A -[hidden]-> B`.
   *
   * PlantUML uses one to say where boxes go without saying they connect, and a renderer that ranks from edges can
   * honour that - the layout reads the edge like any other - and must then not draw the line.
   */
  invisible?: boolean
  /**
   * The direction the source asked for: `A -down-> B` and its three siblings.
   *
   * `down` is what a layered drawing does anyway; `up` puts B above A; `right` and `left` put the two on one row, in
   * that order. PlantUML states it on the edge, so it is carried on the edge.
   */
  hint?: 'up' | 'down' | 'left' | 'right'
}

/**
 * Boxes a source asked to keep on one row: `together { A B }`.
 *
 * PlantUML's together is a statement about the drawing, not about the subject, so it is carried beside the groups
 * rather than as one: a group is a boundary drawn around its members, and this is a row they share.
 */
export type SameRank = string[]

export interface DiagramGroup {
  id: string
  label: string
  /**
   * The nodes declared directly inside it: a group is a box around boxes, and its own members are the ones a
   * source named there. A node inside a nested group is that group's member, not this one's.
   */
  members: string[]
  /**
   * The group that contains this one, when the source said so.
   *
   * Only a parser can know this - nesting is a property of where the text put the boundary - so the layout does
   * not guess it. Left absent, the painter falls back to inferring containment from member sets, which is the
   * best a hand-written model can offer.
   */
  parent?: string
  /**
   * How the boundary is outlined. A package is dashed; a composite state is solid, and the difference is the notation's,
   * not the painter's - so it travels on the group.
   */
  outline?: 'dashed' | 'solid'
}

export interface Diagram {
  kind: 'machine' | 'graph' | 'none'
  /** The state the machine starts in, when the source declared one. */
  init?: string
  title: string
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  groups?: DiagramGroup[]
  /** Boxes a source asked to share a row: `together { A B }`. */
  sameRank?: string[][]
  /** The axis the drawing flows along: `right` comes from `left to right direction`. */
  direction?: 'down' | 'right'
  /** The lines a `legend` block wrote: page furniture, drawn under the drawing and never part of it. */
  legend?: string[]
  /** A `header` line: page text above the drawing, in the source's own words. */
  header?: string
  /** A `footer` line: page text below the drawing, in the source's own words. */
  footer?: string
  /** A `caption` line: the source's own caption, drawn under the drawing beside the one this renderer writes. */
  sourceCaption?: string
  /** One line under the drawing: what was decided, in words the drawing cannot carry. */
  caption: string
}

/** An empty drawing, for a source that produced no nodes. */
export function emptyDiagram(title: string, caption: string): Diagram {
  return { kind: 'none', title, nodes: [], edges: [], caption }
}

/**
 * What an empty drawing says about itself.
 *
 * `no nodes found` is right for an empty source and wrong for one whose every line was refused: the reader
 * then looks for a fault in an input that was written, not empty. The refused count is the difference, and
 * it is already computed by the time this is asked.
 */
export function emptyCaption(refused: number): string {
  return refused === 0 ? 'no nodes found' : 'nothing drawable: ' + String(refused) + ' line(s) refused'
}

/** The label to draw for a node: its own label when the notation gave one, else its id. */
export function labelOf(node: DiagramNode): string {
  return node.label !== undefined && node.label !== '' ? node.label : node.id
}
