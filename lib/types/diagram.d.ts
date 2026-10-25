/**
 * The diagram component: one row, one switch, one tool.
 *
 * A separate component rather than a feature of the tools above it, because drawing has nothing to do with
 * verifying. It can be on while the tools are off, off while they are on, and it carries no engine: a
 * deployment that only wants pictures of its Mermaid diagrams installs the same package and leaves the rest
 * of it alone.
 *
 * The switch is `config.enabled`, live, exactly like the routing gate: a deployment can turn the drawing off
 * at boot, from the Plugins page, or by disabling this row, and none of those touches the tools or the
 * skills.
 */
import z from '@deepseek-ai/schemastery';
export interface Config {
    /** Whether the diagram tool is registered. Read through {@link enabledOf}. */
    enabled: unknown;
    /** The title a drawing carries when the caller did not name one. */
    defaultTitle: string;
}
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    enabled: z<boolean, boolean, "defined">;
    defaultTitle: z<string, string, "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    enabled: z<boolean, boolean, "defined">;
    defaultTitle: z<string, string, "defined">;
}>>, "plain">;
export declare const DIAGRAM_TOOL_NAME = "diagram_render";
export declare const diagramRenderTool: import("@deepseek-ai/dsh-tools").ToolDefinition;
/** Read the switch as a boolean, whichever shape this host produced. */
export declare function enabledOf(config: Config): boolean;
export interface ComponentContext {
    tools: {
        register(definition: unknown): () => void;
    };
}
export declare function apply(ctx: ComponentContext, config: Config): void;
export declare const inject: string[];
