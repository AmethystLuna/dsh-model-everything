export declare const DESIGN_TOOL_NAME = "model_design_review";
/**
 * Model-visible DSH tool that reviews a *design*: the shape of its dependency graph, and the
 * contracts the design states about itself.
 *
 * This is not `model_verify`. That one asks whether a machine can misbehave; this one asks
 * whether a design keeps its own declarations - which layer may depend on which, which
 * responsibility owns which dependency, which subtype may refuse which event. Two engines,
 * two questions, two verdicts that mean different things.
 */
export declare const designTool: import("@deepseek-ai/dsh-tools").ToolDefinition;
