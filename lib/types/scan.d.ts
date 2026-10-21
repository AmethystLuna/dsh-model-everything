export interface ScannedEdge {
    from: string;
    to: string;
}
export interface ScannedGraph {
    /** Module ids, posix-style and relative to the scanned root. */
    nodes: string[];
    edges: ScannedEdge[];
    /** Files read, and files skipped because they are not source. */
    filesRead: number;
    /** Relative specifiers that pointed outside the root or at a file that does not exist. */
    unresolved: string[];
    /** Bare specifiers seen (a package name), counted once each. */
    packages: string[];
}
/** Read every source file under `root`, following no symlinks and skipping build directories. */
export declare function scanDependencyGraph(root: unknown): ScannedGraph;
