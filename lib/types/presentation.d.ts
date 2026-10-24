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
import type { ToolCallView, ToolResultView } from '@deepseek-ai/dsh-tools';
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
    /** `model_edit`: the changes this call applied, as the report lists them. */
    changes?: Array<{
        kind: string;
        what: string;
        detail?: string;
    }>;
    /** `model_edit` and `report_diff`: how the findings moved, when either report could compare. */
    delta?: {
        added: number;
        removed: number;
        changed: number;
        addedErrors: number;
    };
    /** `report_diff`: the first finding the change adds, so a card can lead with it. */
    firstAdded?: CardFinding;
    /** `report_diff`: the current report's own verdict, which differs from the delta's when a clean change lands on a failing report. */
    currentVerdict?: string;
    /** The artifact a translation or a rendering produced, as the first lines of it. */
    source?: {
        label: string;
        lines: string[];
        total: number;
    };
    /** `uml_structure_verify`: the graph's own counts, which are measurements rather than findings. */
    graph?: {
        nodes: number;
        edges: number;
        cycles: number;
        isolated: number;
        dangling: number;
    };
    /** `model_design_review`: three levels, because a signal is not a violation and a fact is neither. */
    levels?: {
        violations: number;
        signals: number;
        facts: number;
        skipped: number;
    };
    /** `uml_structure_verify` with `repoPath`: what the scan itself resolved, and what it could not. */
    scan?: {
        files: number;
        unresolved: number;
        packages: number;
    };
    /** `model_interleaving_scan`: how many claims were found, and in which families. */
    claims?: {
        absolute: number;
        keywords: number;
        families: Array<{
            family: string;
            count: number;
        }>;
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
 * The pending card for a report tool: a title naming the artifact, and the file to follow.
 *
 * From the arguments only, because a UI calls this during streaming and again on replay; the file has not
 * been opened at that point and must not be.
 */
/**
 * The card payload with the artifact previewed.
 *
 * A translation and a rendering both produce text a reader wants to see the shape of, and neither should
 * paste the whole file into a card: the preview is bounded, and it says how much it left out. The report
 * keeps the artifact in full for whoever needs it.
 */
export declare function cardWithSource(value: unknown, family: string, text: string | undefined, label: string, limit?: number): ReportCard;
export declare function reportCallView(family: string): (args: unknown) => ToolCallView | undefined;
/**
 * The card for `model_edit`: what changed, and what the change did to the findings.
 *
 * Both lists are already in the report, so this is a rendering of the same value rather than a second
 * computation - the rule every card here follows.
 */
export declare function editCardBlocks(card: ReportCard): ContentBlock[];
/**
 * The card for `report_diff`: does this change add anything, read as counts and the first added error.
 *
 * A diff's `verdict` is about the delta, so the card leads with the delta and never with the current
 * report's own verdict - the two differ exactly when a clean change lands on an already-failing report.
 */
export declare function diffCardBlocks(card: ReportCard): ContentBlock[];
/** `presentResult` for `model_edit`, falling back to the generic card when the payload has no changes. */
export declare function editResultView(family: string): (_args: unknown, result: {
    content: ContentBlock[];
    meta?: unknown;
}) => ToolResultView | undefined;
export declare function reportResultView(family: string): (_args: unknown, result: {
    content: ContentBlock[];
    meta?: unknown;
}) => ToolResultView | undefined;
/** The card for `uml_structure_verify`: the graph's shape first, then the first finding. */
export declare function structureCardBlocks(card: ReportCard): ContentBlock[];
/** The card for `model_design_review`: violations, then signals, then facts - never one number. */
export declare function designCardBlocks(card: ReportCard): ContentBlock[];
/** The card for `model_interleaving_scan`: claims by family, and the reminder that nothing was proven. */
export declare function scanCardBlocks(card: ReportCard): ContentBlock[];
/** One `presentResult` per card body, since the shapes differ but the fallback does not. */
export declare function familyResultView(family: string, body: (card: ReportCard) => ContentBlock[]): (_args: unknown, result: {
    content: ContentBlock[];
    meta?: unknown;
}) => ToolResultView | undefined;
export declare const structureResultView: (_args: unknown, result: {
    content: ContentBlock[];
    meta?: unknown;
}) => ToolResultView | undefined;
export declare const designResultView: (_args: unknown, result: {
    content: ContentBlock[];
    meta?: unknown;
}) => ToolResultView | undefined;
export declare const scanResultView: (_args: unknown, result: {
    content: ContentBlock[];
    meta?: unknown;
}) => ToolResultView | undefined;
/** `presentResult` for `report_diff`: the delta leads, never the current report's own verdict. */
export declare function diffResultView(family: string): (_args: unknown, result: {
    content: ContentBlock[];
    meta?: unknown;
}) => ToolResultView | undefined;
