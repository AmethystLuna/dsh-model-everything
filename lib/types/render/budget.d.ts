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
import type { Diagram } from './model.js';
export type Severity = 'error' | 'warning';
export interface BudgetFinding {
    code: string;
    severity: Severity;
    message: string;
    /** The group the finding is about, when it is about one. */
    group?: string;
}
export interface BudgetLimits {
    /** How many direct children a boundary may hold: its own nodes plus the groups directly inside it. */
    maxMembers: number;
    /** How deep boundaries may nest. */
    maxDepth: number;
    /** How many nodes the whole drawing may hold. */
    maxNodes: number;
}
/**
 * Defaults, chosen for a drawing read in a conversation pane: a package with more than a handful of boxes stops
 * being a package and becomes a diagram of its own, and three levels is what fits on one screen before a reader
 * needs the source.
 */
export declare const DEFAULT_LIMITS: BudgetLimits;
export interface BudgetReport {
    verdict: 'pass' | 'pass_with_findings' | 'fail';
    findings: BudgetFinding[];
    /** What was measured, so a reader can tell "nothing to check" from "checked and clean". */
    measured: {
        nodes: number;
        groups: number;
        deepest: number;
        widest: {
            group: string;
            size: number;
        } | null;
    };
}
/**
 * Measure a drawing against its limits.
 *
 * Every finding names the group it is about, because a budget report that says "a group is too wide" without
 * saying which one is a report nobody can act on.
 */
export declare function checkBudget(diagram: Diagram, limits?: Partial<BudgetLimits>): BudgetReport;
