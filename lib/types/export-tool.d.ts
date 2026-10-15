export declare const EXPORT_TOOL_NAME = "model_export";
/**
 * DSH tool wrapping the external-tool exporters: turn a LogicModelV1 machine into
 * native input for the tool this plugin routes to (UPPAAL / TLA+ / PRISM / SPIN).
 * v1 translates the core machine; unrepresentable invariants become warnings.
 */
export declare const modelExportTool: import("@deepseek-ai/dsh-tools").ToolDefinition;
