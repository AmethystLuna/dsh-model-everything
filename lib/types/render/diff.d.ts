/**
 * Structural diff between two drawings.
 *
 * A text diff of two diagrams tells a reader that a line moved; it does not tell them that `Cache` left the
 * `Platform` package, or that `Core` gained a nested boundary. Those are the changes a design review is about,
 * and they are decided by comparing the containment tree, not the source.
 *
 * The diff judges movement, not merit: a group that moved, a member that changed owner, a boundary added or
 * removed. Whether the new arrangement is better is the reader's call, so the verdict only says whether anything
 * changed and whether the comparison could run at all.
 */
import type { Diagram } from './model.js';
export type ChangeKind = 'added' | 'removed' | 'renamed' | 'moved' | 'regrouped';
export interface StructuralChange {
    code: string;
    severity: 'error' | 'warning' | 'info';
    kind: ChangeKind;
    /** What changed, by id: a group id or a node id. */
    subject: string;
    message: string;
}
export interface DiffReport {
    verdict: 'pass' | 'pass_with_findings' | 'fail';
    changes: StructuralChange[];
    /** Both sides, so an empty change list cannot be confused with a comparison that never ran. */
    measured: {
        before: {
            nodes: number;
            groups: number;
        };
        after: {
            nodes: number;
            groups: number;
        };
    };
}
/**
 * Compare the containment structure of two drawings.
 *
 * Renames are reported by id: a group that kept its id but changed its text is a rename, while a group whose id
 * is gone and another whose id is new are an unrelated removal and addition, because the ids are what a caller
 * tracks across versions.
 */
export declare function diffStructure(before: Diagram, after: Diagram): DiffReport;
