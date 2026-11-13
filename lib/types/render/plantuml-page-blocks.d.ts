export interface PageBlocks {
    legend: string[];
    header: string[];
    footer: string[];
    sourceCaption: string[];
    title?: string;
}
export interface Collected {
    blocks: PageBlocks;
    /** The lines a block consumed: never read as statements. */
    skip: Set<number>;
    /** What the reader is told about a block that cannot be honoured or never closed, in the order it was found. */
    notes: {
        channel: 'ignored' | 'refused';
        message: string;
    }[];
}
/**
 * Collect every block, rewriting the source where a block has a one-line form.
 *
 * `lines` is changed in place for notes only, and `skip` names the lines the reader of statements must not see.
 */
export declare function collectPageBlocks(lines: string[]): Collected;
