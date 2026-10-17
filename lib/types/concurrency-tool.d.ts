export declare const INTERLEAVING_SCAN_TOOL_NAME = "model_interleaving_scan";
/**
 * Model-visible DSH tool that mines design documents/plans for concurrency-related
 * claims and risk keywords. It does not prove concurrency safety; it flags terms
 * such as "thread-safe", "lock-free", "race condition", "atomic", "mutex", etc.,
 * so the model can either provide dedicated evidence or mark the claim unverified.
 */
export declare const modelConcurrencyScanTool: import("@deepseek-ai/dsh-tools").ToolDefinition;
