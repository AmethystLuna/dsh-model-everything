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
import { live, switchOf } from './live-config.js';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { diagramDiffTool } from './diagram-diff-tool.js';
import { diagramRenderTool } from './diagram-render-tool.js';
import { diagramReviewTool } from './diagram-review-tool.js';
/** The default a deployment inherits: on, because a component nobody knows about is a component nobody uses. */
const DEFAULT_ENABLED = true;
export const Config = z.object({
    enabled: live(z.boolean().default(DEFAULT_ENABLED)),
    defaultTitle: z.string().default('diagram'),
});
/** Read the switch as a boolean, whichever shape this host produced. */
export function enabledOf(config) {
    return switchOf(config.enabled);
}
export function apply(ctx, config) {
    if (!enabledOf(config))
        return;
    ctx.tools.register(diagramRenderTool);
    ctx.tools.register(diagramReviewTool);
    ctx.tools.register(diagramDiffTool);
    registerAnnotateCommand(ctx);
}
/**
 * Offer an annotation as a session command, so a page can send one without a composer.
 *
 * Optional on purpose, and failure-tolerant on purpose: a host without the commands service keeps the
 * composer path, and a registration that throws must not take the drawing tools down with it.
 */
export function registerAnnotateCommand(ctx) {
    const commands = ctx.get?.('commands');
    if (commands === undefined || typeof commands.register !== 'function')
        return;
    try {
        commands.register({
            name: 'annotate',
            description: 'Send a diagram annotation to this session',
            handler: (invocation) => {
                const raw = typeof invocation.rawInput === 'string' ? invocation.rawInput.trim().replace(/^\/?annotate\s*/i, '') : '';
                const agent = invocation.agent;
                const followup = agent?.followup;
                if (raw === '' || typeof followup !== 'function')
                    return { kind: 'error', text: 'this host cannot take a follow-up note' };
                // A follow-up takes a UserMessage, not a bag of fields: the runtime stamps the id and the time, and a
                // hand-built object reaches the inbox without them. `createUserMessage` is the host's own constructor.
                followup.call(agent, createUserMessage({ content: [{ type: 'text', text: raw }], source: { kind: 'user' } }));
                return { kind: 'success', text: 'annotation sent' };
            },
        });
    }
    catch {
        // A host whose command API differs keeps the composer path; the tools above are already registered.
    }
}
export const inject = ['tools'];
