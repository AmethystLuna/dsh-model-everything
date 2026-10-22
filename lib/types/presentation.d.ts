/**
 * What a UI shows for a report, separated from what the model reads.
 *
 * A report is written for a model: it names every check, every finding and the next step, because the
 * model has to act on all of it. A reader wants four things instead - did it run, what does it decide,
 * what is the first thing wrong, what to do next - and wants the rest folded away.
 *
 * Two host hooks carry that split:
 *
 * - `output.presentationMeta` projects a small JSON payload the host persists on the result; a client
 *   card narrows it without parsing prose.
 * - `presentResult` returns the card body from that payload, so a UI that supports it shows the summary
 *   and a UI that does not falls back to the raw text. The model-facing content never changes.
 *
 * Both are pure and replayable: they read the persisted value, never the filesystem.
 */
import type { ContentBlock } from '@deepseek-ai/dsh-llm';
import type { ToolResultView } from '@deepseek-ai/dsh-tools';
/** One finding, as a card needs it: a code to name it and a sentence to read. */
export interface CardFinding {
    code: string;
    severity: string;
    message: string;
}
/** The payload a client card narrows. Small on purpose: a card is a summary, not a second report. */
export interface ReportCard {
    verdict?: string;
    verdictReason?: string;
    errors: number;
    warnings: number;
    checksRun?: number;
    first: CardFinding | null;
    /** The one step a reader should take, already a sentence. */
    next: string | null;
    /** Which family produced this, so a card can pick an icon and a colour without parsing codes. */
    family: string;
    /** What this family owns, and where the case just outside it goes. One table, not a second prose copy. */
    route?: {
        owns: string;
        instead: string;
    };
}
/**
 * Project a report into the card payload.
 *
 * Read defensively: this runs on replay too, and a payload that once had a shape may come back with a
 * field missing. A card that throws would take the whole session view with it.
 */
export declare function reportCard(value: unknown, family: string): ReportCard;
/** The card body: four lines, in the order a reader asks the questions. */
export declare function cardBlocks(card: ReportCard): ContentBlock[];
/**
 * `presentResult` for a report tool: render the card from the persisted payload, and fall back to the
 * raw content by returning undefined when there is none.
 */
export declare function reportResultView(family: string): (_args: unknown, result: {
    content: ContentBlock[];
    meta?: unknown;
}) => ToolResultView | undefined;
