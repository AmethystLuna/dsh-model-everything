/**
 * The structural diff tool: two drawings, compared by containment.
 *
 * One job per file: this module declares the tool and nothing else, so the documentation generator that walks
 * `*-tool` modules finds it, and so a change to the drawing never touches the reviewing.
 */
export declare const DIAGRAM_DIFF_TOOL_NAME = "diagram_diff";
export declare const diagramDiffTool: import("@deepseek-ai/dsh-tools").ToolDefinition;
