/**
 * What a tool card shows, reduced to a drawing.
 *
 * The input is what the host hands a settled tool view: a phase and a block whose shape differs per phase.
 * A settled call carries the paired call's arguments as a **lazy view** (`PartialArguments`) and the result
 * as content blocks, so nothing here reads `block.args.model`: the view is asked, and the report text is
 * parsed for the two facts a drawing needs. Every reader is total - an absent field removes a shape rather
 * than throwing, because the same view renders during streaming.
 *
 * Pure. Everything decided here is a fact a test can assert: which nodes exist, which edges, why they are
 * coloured the way they are.
 */
import type { Diagram } from './model.js';
export interface ViewInput {
    phase?: unknown;
    toolName?: unknown;
    /** The whole block the host hands a view; its shape depends on the phase. */
    block?: unknown;
}
export declare function viewModel(input: ViewInput): Diagram;
