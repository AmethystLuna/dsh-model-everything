export declare const COMPOSE_TOOL_NAME = "model_compose_verify";
/**
 * DSH tool wrapping multi-machine composition verification:
 * product-space reachability with rendezvous handshakes (C1 deadlock, C2 sync), and the shared
 * locations the machines both touch (C3 declarations, C4 unordered write, C5 non-atomic update).
 */
export declare const modelComposeTool: import("@deepseek-ai/dsh-tools").ToolDefinition;
