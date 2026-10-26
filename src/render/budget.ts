/**
 * Structural budgets for a diagram: the checks a drawing can fail without being wrong.
 *
 * A diagram is not verified the way a state machine is - there is no deadlock to find - but an architecture
 * picture has properties a reader relies on, and they are checkable: a package that holds twenty things is not
 * communicating anything, a boundary around one box is a layer the source did not mean, a group nothing points
 * into and nothing leaves is a group that belongs on another page.
 *
 * Pure: a diagram and a set of limits in, findings out. The limits are arguments, not constants, because what
 * counts as too wide depends on the medium - a slide holds less than a scrollable tab.
 */

import type { Diagram, DiagramGroup } from './model.js'

export type Severity = 'error' | 'warning'

export interface BudgetFinding {
  code: string
  severity: Severity
  message: string
  /** The group the finding is about, when it is about one. */
  group?: string
}

export interface BudgetLimits {
  /** How many direct children a boundary may hold: its own nodes plus the groups directly inside it. */
  maxMembers: number
  /** How deep boundaries may nest. */
  maxDepth: number
  /** How many nodes the whole drawing may hold. */
  maxNodes: number
}

/**
 * Defaults, chosen for a drawing read in a conversation pane: a package with more than a handful of boxes stops
 * being a package and becomes a diagram of its own, and three levels is what fits on one screen before a reader
 * needs the source.
 */
export const DEFAULT_LIMITS: BudgetLimits = { maxMembers: 7, maxDepth: 3, maxNodes: 40 }

export interface BudgetReport {
  verdict: 'pass' | 'pass_with_findings' | 'fail'
  findings: BudgetFinding[]
  /** What was measured, so a reader can tell "nothing to check" from "checked and clean". */
  measured: { nodes: number; groups: number; deepest: number; widest: { group: string; size: number } | null }
}

/** The direct children of a boundary: its own nodes plus the groups that name it as parent. */
function childrenOf(groups: DiagramGroup[], group: DiagramGroup): number {
  const nested = groups.filter((entry) => entry.parent === group.id).length
  return group.members.length + nested
}

/** How deep the nesting goes, guarding against a parent cycle in the data. */
function depthOf(groups: DiagramGroup[], groupId: string): number {
  const byId = new Map(groups.map((group) => [group.id, group] as const))
  let depth = 1
  let cursor = byId.get(groupId)?.parent
  const seen = new Set<string>([groupId])
  while (cursor !== undefined && !seen.has(cursor)) {
    seen.add(cursor)
    depth += 1
    cursor = byId.get(cursor)?.parent
  }
  return depth
}

/**
 * Measure a drawing against its limits.
 *
 * Every finding names the group it is about, because a budget report that says "a group is too wide" without
 * saying which one is a report nobody can act on.
 */
export function checkBudget(diagram: Diagram, limits: Partial<BudgetLimits> = {}): BudgetReport {
  const caps: BudgetLimits = { ...DEFAULT_LIMITS, ...limits }
  const groups = diagram.groups ?? []
  const findings: BudgetFinding[] = []

  const nodeIds = new Set(diagram.nodes.map((node) => node.id))
  for (const group of groups) {
    const size = childrenOf(groups, group)
    const depth = depthOf(groups, group.id)
    if (size > caps.maxMembers) {
      findings.push({
        code: 'B1_GROUP_TOO_WIDE',
        severity: 'error',
        group: group.id,
        message: 'group "' + group.label + '" holds ' + String(size) + ' direct children; the budget is ' + String(caps.maxMembers),
      })
    }
    if (depth > caps.maxDepth) {
      findings.push({
        code: 'B2_TOO_DEEP',
        severity: 'error',
        group: group.id,
        message: 'group "' + group.label + '" nests ' + String(depth) + ' levels deep; the budget is ' + String(caps.maxDepth),
      })
    }
    const realMembers = group.members.filter((member) => nodeIds.has(member))
    if (realMembers.length === 0 && groups.every((entry) => entry.parent !== group.id)) {
      findings.push({
        code: 'B3_EMPTY_GROUP',
        severity: 'error',
        group: group.id,
        message: 'group "' + group.label + '" holds nothing that is drawn, so the boundary claims a containment the drawing does not show',
      })
    }
    if (size === 1) {
      findings.push({
        code: 'B4_SINGLE_MEMBER',
        severity: 'warning',
        group: group.id,
        message: 'group "' + group.label + '" holds one child; a boundary around one thing usually means a layer that was never split',
      })
    }
  }

  if (diagram.nodes.length > caps.maxNodes) {
    findings.push({
      code: 'B5_TOO_MANY_NODES',
      severity: 'error',
      message: 'the drawing holds ' + String(diagram.nodes.length) + ' nodes; the budget is ' + String(caps.maxNodes),
    })
  }

  const deepest = groups.reduce((max, group) => Math.max(max, depthOf(groups, group.id)), 0)
  const widest = groups.reduce<{ group: string; size: number } | null>((best, group) => {
    const size = childrenOf(groups, group)
    return best === null || size > best.size ? { group: group.label, size } : best
  }, null)

  const errors = findings.filter((finding) => finding.severity === 'error').length
  const verdict: BudgetReport['verdict'] = errors > 0 ? 'fail' : findings.length > 0 ? 'pass_with_findings' : 'pass'
  return { verdict, findings, measured: { nodes: diagram.nodes.length, groups: groups.length, deepest, widest } }
}
