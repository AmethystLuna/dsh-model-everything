export interface ScannedEdge {
    from: string;
    to: string;
}
export interface ScannedGraph {
    /** Module ids, posix-style and relative to the scanned root. File ids for file languages, directory ids for package languages. */
    nodes: string[];
    edges: ScannedEdge[];
    /** Files read, and files skipped because they are not source. */
    filesRead: number;
    /**
     * Specifiers that are project-internal but did not resolve: a relative path that leaves the root or names
     * no file, and an alias-shaped specifier (`@/x`, `~/x`, `#x`) that no `tsconfig`/`jsconfig` declares.
     */
    unresolved: string[];
    /** Bare specifiers seen (a package name), counted once each. */
    packages: string[];
    /** Which languages were scanned, and at what granularity. */
    languages: {
        language: string;
        files: number;
        granularity: 'file' | 'package';
    }[];
}
export type LangGranularity = 'file' | 'package';
export interface Language {
    name: string;
    extensions: string[];
    granularity: LangGranularity;
    /** Specifiers this file names, already separated from external ones. */
    extract(text: string): {
        local: string[];
        external: string[];
    };
}
/** Every language this scan understands, by extension. */
export declare const LANGUAGES: Language[];
/** Which language a file belongs to, if any. */
export declare function languageOf(path: string): Language | undefined;
export declare function scanDependencyGraph(root: unknown): ScannedGraph;
