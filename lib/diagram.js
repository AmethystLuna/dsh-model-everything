/**
 * The diagram component: one row, one switch, three tools.
 *
 * A separate component rather than a feature of the tools above it, because drawing has nothing to do with
 * verifying. It can be on while the tools are off, off while they are on, and it carries no engine: a
 * deployment that only wants pictures of its Mermaid diagrams installs the same package and leaves the rest of
 * it alone.
 *
 * The switch is `config.enabled`, live, exactly like the routing gate: a deployment can turn the drawing off at
 * boot, from the Plugins page, or by disabling this row, and none of those touches the tools or the skills.
 */
import z from '@deepseek-ai/schemastery';
import { diagramDiffTool } from './diagram-diff-tool.js';
import { diagramRenderTool } from './diagram-render-tool.js';
import { diagramReviewTool } from './diagram-review-tool.js';
/** The default a deployment inherits: on, because a component nobody knows about is a component nobody uses. */
const DEFAULT_ENABLED = true;
/**
 * A live boolean, or a plain one on a host that predates the live wrapper.
 *
 * `live` is what makes the Plugins page switch take effect without a restart; the value it returns is read
 * through {@link enabledOf} rather than compared, because both shapes have been seen in the wild.
 */
const liveBoolean = z.live;
export const Config = z.object({
    enabled: liveBoolean === undefined
        ? z.boolean().default(DEFAULT_ENABLED)
        : liveBoolean(z.boolean().default(DEFAULT_ENABLED)),
    defaultTitle: z.string().default('diagram'),
});
/** Read the switch as a boolean, whichever shape this host produced. */
export function enabledOf(config) {
    const value = config.enabled;
    return typeof value === 'boolean' ? value : value.get();
}
export function apply(ctx, config) {
    if (!enabledOf(config))
        return;
    ctx.tools.register(diagramRenderTool);
    ctx.tools.register(diagramReviewTool);
    ctx.tools.register(diagramDiffTool);
}
export const inject = ['tools'];
