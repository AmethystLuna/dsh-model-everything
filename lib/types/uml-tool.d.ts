export declare const UML_RENDER_TOOL_NAME = "uml_render";
export declare const UML_PARSE_TOOL_NAME = "uml_parse";
export declare const UML_REVIEW_TOOL_NAME = "uml_review";
export declare const UML_LABELS_TOOL_NAME = "uml_explain_labels";
/** Draw a model as diagram source. */
export declare const umlRenderTool: import("@deepseek-ai/dsh-tools").ToolDefinition;
/** Read diagram text into the model of the family it declares. */
export declare const umlParseTool: import("@deepseek-ai/dsh-tools").ToolDefinition;
/** Audit the modelling: the diagram, the model, or the two against each other. */
export declare const umlReviewTool: import("@deepseek-ai/dsh-tools").ToolDefinition;
/** Print the label and comment contract the parser accepts. */
export declare const umlExplainLabelsTool: import("@deepseek-ai/dsh-tools").ToolDefinition;
