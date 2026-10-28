/**
 * Fan-in trunks: a batch of arrows into one box from one side, drawn as one bundle.
 *
 * A node that four relations point at is drawn as four ports along its side and four lines converging on it. Each
 * line is right on its own, and the picture is wrong: the bundle reads as a comb, and a reader counts ports to count
 * arrows. The mature layered implementations solve this by merging the edges - ELK's *Merge Edges* with junction
 * points, Graphviz's `concentrate` - and the shape they produce is one straight run outside the node, with a branch
 * joining it wherever a separate edge arrives, and one shared stub into the node.
 *
 * This module decides only which ends may merge, where the shared run sits and which of the branches becomes the
 * shared entry. It is pure geometry over boxes and ports, so the rules can be asserted without a canvas; the painter
 * draws the answer.
 *
 * The rules, and why each one exists:
 *
 * - **One target, one entry side.** Edges that arrive from different sides are travelling in different directions,
 *   and a trunk that changed axis would be two trunks.
 * - **The exit faces the trunk.** A branch arrives at the trunk along the direction its own port leaves by, so the
 *   trunk is outside the source as well as outside the target. An end that does not face the trunk is not merged: it
 *   would have to turn before it got there, which is the bend the merge was supposed to save.
 * - **Distinct sources, three or more.** Two merged edges read as one thick line. A pair of relations about one pair
 *   has its own, older rule - they stay visibly apart - and that rule is the distinct-source rule here: two
 *   statements about one pair share their source, so they can never both be a branch of one trunk.
 * - **One arrow semantics.** A composition and an association are different statements about the relation; drawn on
 *   one trunk they would be read as one statement. Ends that disagree on their arrow are not merged with each other.
 * - **Clear of every box.** A trunk that crosses a box is the same defect as a route that does, and it is worse here
 *   because it is drawn once for the whole bundle.
 * - **One trunk per line.** Two groups whose trunks would be drawn on one line would read as one bundle between two
 *   unrelated targets, so the later group is refused.
 *
 * The shared entry is the middle of the target's side. A bundle enters the target through one port, and a side that
 * carries one port is centred on it, so the trunk runs to the middle and every branch joins it there: the branches
 * that are not in the middle bend, which is the price of one entry that reads as centred rather than one that leans
 * towards whichever branch happened to arrive straightest.
 *
 * Merging forces every branch but one to bend twice, so an unmerged drawing of `k` straight branches costs
 * `2 * (n - k)` bends and a merged one costs `2 * (n - 1)`; the branch nearest the middle is the lead because it is
 * the only one that can still reach the shared port without a horizontal leg, and on a target whose middle happens
 * to fall on a branch's own line that branch is free, as before.
 *
 * What this module does not decide: the colour of a branch, the text of its label, and how a branch's own route
 * reaches the trunk. Those belong to the painter.
 */

import { crossesBox, normalOf, ROUTE_STUB, type Side } from './route.js'
import type { Box } from './place.js'
import type { EdgeArrow } from './model.js'

/** The least a trunk is worth drawing for: two merged edges read as one thick line. */
const TRUNK_MIN_EDGES = 3

/** One edge end, as the trunk planner reads it. */
export interface TrunkEnd {
  /** The edge's index in the diagram, so the painter can key its answer back to the edge. */
  index: number
  from: string
  to: string
  /** The side the edge's port leaves by, and the side it arrives at, as the port stage decided them. */
  exit: Side
  entry: Side
  /** The arrow the notation stated. Ends merge only when they agree on it; two unset arrows agree. */
  arrow?: EdgeArrow
  /** The height of the run the channel stage gave the edge. An edge without one is not drawn by a run. */
  runY?: number
}

/** A port in the drawing's coordinates. Structural, so this module needs no import from the painter. */
export interface TrunkPoint {
  x: number
  y: number
}

export interface TrunkInput {
  ends: TrunkEnd[]
  /** The box of a node, and nothing else: a boundary is not a trunk target, because an arrow points past it. */
  boxOf: (id: string) => Box | undefined
  /** Every box the trunk and its branches must keep clear of. A boundary is not an obstacle, as on any route. */
  boxes: Iterable<Box>
  /** Where an edge's own exit port sits, when it has one. The branch joins the trunk at that port's coordinate. */
  exitPortOf: (index: number) => TrunkPoint | undefined
}

/** One accepted bundle: what it merges, where its run sits, and which branch the target is entered by. */
export interface TrunkGroup {
  /** Position in `groups`, which is also the id a junction dot carries. */
  id: number
  target: string
  side: Side
  /** The coordinate of the trunk line: a y when the trunk runs across, an x when it runs down. */
  at: number
  /** The coordinate of the one port the bundle enters by: the middle of the target's side. */
  entryAlong: number
  /** The two ends of the run, along the axis it moves on. A branch joins it between them. */
  from: number
  to: number
  /** The member whose own exit is nearest the shared entry, and therefore the only branch that may still be a straight drop. */
  lead: number
  /** The edges in the bundle, in the order the source wrote them. */
  members: number[]
}

export interface TrunkPlan {
  groups: TrunkGroup[]
  /** By edge index: the id of the group it joined. An edge not in here travels alone. */
  groupOf: Map<number, number>
}

/** Does this side move along the page's vertical axis? A run on it is horizontal. */
function isVerticalSide(side: Side): boolean {
  return side === 'top' || side === 'bottom'
}

/**
 * Where the trunk outside a box sits.
 *
 * The same stub the router leaves before it turns, so the bundle starts exactly where a single route would have
 * turned: about `ROUTE_STUB` outside the target, square to the side it enters.
 */
function trunkAt(box: Box, side: Side): number {
  if (side === 'top') return box.y - ROUTE_STUB
  if (side === 'bottom') return box.y + box.height + ROUTE_STUB
  if (side === 'left') return box.x - ROUTE_STUB
  return box.x + box.width + ROUTE_STUB
}

/** The coordinate a point takes along the side it sits on: where along that side the port is. */
function alongSide(point: TrunkPoint, side: Side): number {
  return isVerticalSide(side) ? point.x : point.y
}

/** The coordinate a point takes on its side's outward normal: the axis a trunk outside that side moves on. */
function alongNormal(point: TrunkPoint, side: Side): number {
  return isVerticalSide(side) ? point.y : point.x
}

/** Does the port on `side` travel toward the trunk at `at`? A branch only merges into a trunk it moves toward. */
function facesTrunk(point: TrunkPoint, side: Side, at: number): boolean {
  const normal = normalOf(side)
  const outward = isVerticalSide(side) ? normal.y : normal.x
  return (at - alongNormal(point, side)) * outward > 0.5
}

/** The group an edge end belongs to: its target, the side it enters by, and the arrow it means. */
function keyOf(end: TrunkEnd): string {
  return end.to + '\u0000' + end.entry + '\u0000' + (end.arrow ?? '')
}

/** One end that has passed every per-edge rule, with the ports its group is built from. */
interface Candidate {
  end: TrunkEnd
  source: Box
  target: Box
  at: number
  /** The port the branch leaves by, and the coordinate it joins the trunk at. */
  exit: TrunkPoint
  branch: number
}

/** Is this axis-aligned segment clear of every box it does not attach to? */
function clearSegment(boxes: Iterable<Box>, skip: Box[], x1: number, y1: number, x2: number, y2: number): boolean {
  for (const box of boxes) {
    if (skip.includes(box)) continue
    if (crossesBox(x1, y1, x2, y2, box)) return false
  }
  return true
}

/** Would this run lie on the line of an accepted trunk and share a stretch of it? */
function onOneLine(group: TrunkGroup, side: Side, at: number, low: number, high: number): boolean {
  if (isVerticalSide(group.side) !== isVerticalSide(side)) return false
  if (group.at !== at) return false
  return Math.min(group.to, high) - Math.max(group.from, low) > 0.5
}

/**
 * Decide which ends merge, and where each accepted trunk runs.
 *
 * Ends that cannot merge are simply absent from the plan; the painter draws them as it always has. Groups are
 * ordered by the first member the source wrote, so the answer does not depend on map iteration order.
 */
export function planTrunks(input: TrunkInput): TrunkPlan {
  const groups: TrunkGroup[] = []
  const groupOf = new Map<number, number>()

  // Per edge first: the cheap rules. An end that fails one of them cannot join any group, so it never reaches the
  // count that decides whether a group is worth drawing.
  const buckets = new Map<string, Candidate[]>()
  for (const end of input.ends) {
    if (end.runY === undefined) continue
    // The branch approaches the trunk along its own exit normal, so the two ends must move on one axis: a mixed pair
    // would have to turn before it reached the trunk, which is the bend the merge exists to save.
    if (isVerticalSide(end.exit) !== isVerticalSide(end.entry)) continue
    const source = input.boxOf(end.from)
    const target = input.boxOf(end.to)
    if (source === undefined || target === undefined) continue
    if (source === target) continue
    const exit = input.exitPortOf(end.index)
    if (exit === undefined) continue
    const at = trunkAt(target, end.entry)
    if (!facesTrunk(exit, end.exit, at)) continue
    const candidate: Candidate = { end, source, target, at, exit, branch: alongSide(exit, end.exit) }
    const key = keyOf(end)
    const list = buckets.get(key)
    if (list === undefined) buckets.set(key, [candidate])
    else list.push(candidate)
  }

  for (const list of buckets.values()) {
    // A pair of relations about one node is not two branches: the pair's own rule keeps them visibly apart, and both
    // of them name the same source, so dropping the duplicated source drops the whole pair. Neither joins, and the
    // group keeps the singles.
    const bySource = new Map<string, Candidate[]>()
    for (const candidate of list) {
      const seen = bySource.get(candidate.end.from)
      if (seen === undefined) bySource.set(candidate.end.from, [candidate])
      else seen.push(candidate)
    }
    const members = list.filter((candidate) => (bySource.get(candidate.end.from) as Candidate[]).length === 1)
    if (members.length < TRUNK_MIN_EDGES) continue

    const target = members[0].target
    const side = members[0].end.entry
    const at = members[0].at

    // The shared entry is the middle of the target's side. A side that carries one port is centred on it, and a bundle
    // enters through one port, so the run reaches the middle rather than whichever branch asked for the middle first.
    const entryAlong = isVerticalSide(side) ? target.x + target.width / 2 : target.y + target.height / 2
    // The lead is the branch nearest that middle: the only member that can reach the shared port without a lateral
    // leg. The source's order breaks a tie, so the answer does not depend on map iteration.
    let lead = members[0]
    for (const candidate of members) {
      if (Math.abs(candidate.branch - entryAlong) < Math.abs(lead.branch - entryAlong) - 1e-9) lead = candidate
    }
    // The run: the whole stretch the branches and the one port span, so every branch joins a line that reaches it.
    let low = entryAlong
    let high = entryAlong
    for (const candidate of members) {
      low = Math.min(low, candidate.branch)
      high = Math.max(high, candidate.branch)
    }
    // Clearance. The run is checked against every box but the target; each branch's own drop is checked against every
    // box but its source and the target. The drop leaves a port square to its side, so those are the only two boxes it
    // can legitimately touch.
    const vertical = isVerticalSide(side)
    const run = vertical ? [low, at, high, at] : [at, low, at, high]
    if (!clearSegment(input.boxes, [target], run[0], run[1], run[2], run[3])) continue
    let blocked = false
    for (const candidate of members) {
      // The drop: from the branch's own port to the point where it meets the trunk, along its exit normal.
      const drop = vertical
        ? [candidate.branch, candidate.exit.y, candidate.branch, at]
        : [candidate.exit.x, candidate.branch, at, candidate.branch]
      if (!clearSegment(input.boxes, [candidate.source, target], drop[0], drop[1], drop[2], drop[3])) blocked = true
    }
    if (blocked) continue
    // Two trunks on one line would be drawn as one bundle. The first group keeps the line; the later one travels alone.
    if (groups.some((group) => onOneLine(group, side, at, low, high))) continue

    const id = groups.length
    groups.push({
      id,
      target: members[0].end.to,
      side,
      at,
      entryAlong,
      from: low,
      to: high,
      lead: lead.end.index,
      members: members.map((candidate) => candidate.end.index),
    })
    for (const candidate of members) groupOf.set(candidate.end.index, id)
  }

  return { groups, groupOf }
}
