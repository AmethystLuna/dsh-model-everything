/**
 * Collapsing a group: the drawing with one boundary folded into a single box.
 *
 * A fold is a transform on the model, not a mode of the painter. That keeps the painter's rules unchanged -
 * it still draws boxes and edges it is given - and it makes the behaviour testable without a browser: feed a
 * diagram in, assert what came out.
 *
 * Folding is what makes a hierarchy usable: a reader who has understood a package wants it out of the way, and
 * an architecture diagram that cannot be folded is read at one zoom level forever.
 */

import type { Diagram, DiagramEdge, DiagramGroup, DiagramNode } from './model.js'

/** How many nodes a group holds, counting the whole subtree - what the folded box offers to unfold. */
function subtreeSize(diagram: Diagram, groupId: string, seen: Set<string>): number {
  if (seen.has(groupId)) return 0
  seen.add(groupId)
  const groups = diagram.groups ?? []
  const group = groups.find((entry) => entry.id === groupId)
  if (group === undefined) return 0
  const children = groups.filter((entry) => entry.parent === groupId)
  return group.members.length + children.reduce((total, child) => total + subtreeSize(diagram, child.id, seen), 0)
}

/** The group that directly holds a node, when one does. */
function ownerOf(diagram: Diagram, nodeId: string): string | undefined {
  return (diagram.groups ?? []).find((group) => group.members.includes(nodeId))?.id
}

/**
 * Fold the named groups.
 *
 * A folded group becomes a node carrying its name and how many nodes it holds; its members - and every group
 * inside it - leave the drawing. An edge that pointed at something inside the fold is re-aimed at the fold's
 * box, and an edge between two members of the same fold disappears: both ends are now the same box, and a
 * self-loop would be a claim the source never made.
 *
 * Ids nobody declared are ignored, and folding a group whose contents are already gone changes nothing, so the
 * function is total on any diagram and any set of names.
 */
export function collapse(diagram: Diagram, folded: Iterable<string>): Diagram {
  const asked = new Set(folded)
  const groups: DiagramGroup[] = diagram.groups ?? []
  if (asked.size === 0 || groups.length === 0) return diagram

  // Only groups that exist, and that still have contents, can be folded.
  const byId = new Map(groups.map((group) => [group.id, group] as const))
  const targets = new Set<string>()
  for (const id of asked) {
    const group = byId.get(id)
    if (group !== undefined && subtreeSize(diagram, id, new Set()) > 0) targets.add(id)
  }
  if (targets.size === 0) return diagram

  // A fold inside another fold is served by the outer one: the inner box would not be drawn anyway.
  for (const id of [...targets]) {
    let cursor = byId.get(id)?.parent
    const seen = new Set<string>()
    while (cursor !== undefined && !seen.has(cursor)) {
      seen.add(cursor)
      if (targets.has(cursor)) {
        targets.delete(id)
        break
      }
      cursor = byId.get(cursor)?.parent
    }
  }

  const removedNodes = new Set<string>()
  const removedGroups = new Set<string>()
  const descend = (groupId: string, seen: Set<string>): void => {
    if (seen.has(groupId)) return
    seen.add(groupId)
    removedGroups.add(groupId)
    const group = byId.get(groupId)
    if (group === undefined) return
    for (const member of group.members) removedNodes.add(member)
    for (const child of groups.filter((entry) => entry.parent === groupId)) descend(child.id, seen)
  }
  for (const id of targets) descend(id, new Set())

  /** The innermost fold that swallowed this id, if any. */
  const foldOf = (id: string): string | undefined => {
    for (const target of targets) {
      const inSubtree = (groupId: string, seen: Set<string>): boolean => {
        if (seen.has(groupId)) return false
        seen.add(groupId)
        if (groupId === target) return true
        return groups.filter((entry) => entry.parent === groupId).some((child) => inSubtree(child.id, seen))
      }
      const group = byId.get(target) as DiagramGroup
      if (group.members.includes(id) || inSubtree(ownerOf(diagram, id) ?? '', new Set())) return target
    }
    return undefined
  }

  // The box that replaces a fold takes the place of its first member, so the drawing keeps the order the source
  // gave it: a folded package belongs where the package was, not at the end of the page.
  const nodes: DiagramNode[] = []
  const emitted = new Set<string>()
  for (const node of diagram.nodes) {
    if (!removedNodes.has(node.id)) {
      nodes.push(node)
      continue
    }
    const fold = foldOf(node.id)
    if (fold === undefined || emitted.has(fold)) continue
    emitted.add(fold)
    const group = byId.get(fold) as DiagramGroup
    nodes.push({ id: fold, label: group.label + ' (' + String(subtreeSize(diagram, fold, new Set())) + ')', role: 'normal' })
  }
  // A fold whose members are not in `nodes` at all still deserves a box rather than vanishing.
  for (const id of targets) {
    if (emitted.has(id)) continue
    const group = byId.get(id) as DiagramGroup
    nodes.push({ id, label: group.label + ' (' + String(subtreeSize(diagram, id, new Set())) + ')', role: 'normal' })
  }

  const edges: DiagramEdge[] = []
  const seenEdges = new Set<string>()
  for (const edge of diagram.edges) {
    const from = removedNodes.has(edge.from) ? foldOf(edge.from) : edge.from
    const to = removedNodes.has(edge.to) ? foldOf(edge.to) : edge.to
    if (from === undefined || to === undefined) continue
    if (from === to) continue
    const key = from + '>' + to + ':' + edge.label
    if (seenEdges.has(key)) continue
    seenEdges.add(key)
    edges.push({ ...edge, from, to })
  }

  // A folded box stands where its group stood, so it belongs to that group's parent: without this the box that
  // replaced an inner boundary would be drawn outside the outer one, which reads as "it left the package".
  const adopted = new Map<string, string[]>()
  for (const id of targets) {
    const parent = byId.get(id)?.parent
    if (parent === undefined || targets.has(parent) || removedGroups.has(parent)) continue
    adopted.set(parent, [...(adopted.get(parent) ?? []), id])
  }
  const remaining = groups
    .filter((group) => !removedGroups.has(group.id) && targets.has(group.id) === false)
    .map((group) => {
      const extra = adopted.get(group.id)
      if (extra === undefined) return group
      return { ...group, members: [...group.members.filter((member) => !removedNodes.has(member)), ...extra] }
    })
  const caption = diagram.caption + (targets.size === 1 ? ', 1 group folded' : ', ' + String(targets.size) + ' groups folded')
  return {
    ...diagram,
    nodes,
    edges,
    ...(remaining.length === 0 ? { groups: undefined } : { groups: remaining }),
    caption,
  }
}
