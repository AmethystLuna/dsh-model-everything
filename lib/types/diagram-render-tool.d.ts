/**
 * The drawing tool: source text in, SVG out.
 *
 * One job per file: this module declares the tool and nothing else, so the documentation generator that walks
 * `*-tool` modules finds it, and so a change to the drawing never touches the reviewing.
 */
export declare const DIAGRAM_TOOL_NAME = "diagram_render";
export declare const diagramRenderTool: import("@deepseek-ai/dsh-tools").ToolDefinition;
