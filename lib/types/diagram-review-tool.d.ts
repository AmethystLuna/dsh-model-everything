/**
 * The structural review tool: budgets against one drawing.
 *
 * One job per file: this module declares the tool and nothing else, so the documentation generator that walks
 * `*-tool` modules finds it, and so a change to the drawing never touches the reviewing.
 */
export declare const DIAGRAM_REVIEW_TOOL_NAME = "diagram_review";
export declare const diagramReviewTool: import("@deepseek-ai/dsh-tools").ToolDefinition;
