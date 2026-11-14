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

import z from '@deepseek-ai/schemastery'
import { live, switchOf } from './live-config.js'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { diagramDiffTool } from './diagram-diff-tool.js'
import { diagramRenderTool } from './diagram-render-tool.js'
import { diagramReviewTool } from './diagram-review-tool.js'

/** The default a deployment inherits: on, because a component nobody knows about is a component nobody uses. */
const DEFAULT_ENABLED = true

/**
 * The switch is projected to the Plugins page and read when this component mounts: turning it off registers no
 * diagram tool until the next mount. The field is `live` rather than plain because only a projected field appears
 * on that page at all - a plain boolean is a setting nobody can reach.
 */

export interface Config {
  /** Whether the diagram tools are registered. Read through {@link enabledOf}. */
  enabled: unknown
  /** The title a drawing carries when the caller did not name one. */
  defaultTitle: string
}

export const Config = z.object({
  enabled: live(z.boolean().default(DEFAULT_ENABLED)) as unknown as boolean,
  defaultTitle: z.string().default('diagram'),
})

/** Read the switch as a boolean, whichever shape this host produced. */
export function enabledOf(config: Config): boolean {
  return switchOf(config.enabled)
}

export interface ComponentContext {
  tools: { register(definition: unknown): () => void }
}

export function apply(ctx: ComponentContext, config: Config): void {
  if (!enabledOf(config)) return
  ctx.tools.register(diagramRenderTool)
  ctx.tools.register(diagramReviewTool)
  ctx.tools.register(diagramDiffTool)
  registerAnnotateCommand(ctx)
}

/**
 * Offer an annotation as a session command, so a page can send one without a composer.
 *
 * Optional on purpose, and failure-tolerant on purpose: a host without the commands service keeps the
 * composer path, and a registration that throws must not take the drawing tools down with it.
 */
export function registerAnnotateCommand(ctx: unknown): void {
  const commands = (ctx as { get?: (name: string) => unknown }).get?.('commands') as { register?: (definition: unknown) => unknown } | undefined
  if (commands === undefined || typeof commands.register !== 'function') return
  try {
    commands.register({
      name: 'annotate',
      description: 'Send a diagram annotation to this session',
      handler: (invocation: { agent?: { followup?: (input: unknown) => unknown }; rawInput?: string; commandId?: unknown; attachments?: unknown; signal?: unknown }) => {
        const raw = typeof invocation.rawInput === 'string' ? invocation.rawInput.trim().replace(/^\/?annotate\s*/i, '') : ''
        const agent = invocation.agent
        const followup = agent?.followup
        if (raw === '' || typeof followup !== 'function') return { kind: 'error' as const, text: 'this host cannot take a follow-up note' }
        // A follow-up takes a UserMessage, not a bag of fields: the runtime stamps the id and the time, and a
        // hand-built object reaches the inbox without them. `createUserMessage` is the host's own constructor.
        followup.call(agent, createUserMessage({ content: [{ type: 'text', text: raw }], source: { kind: 'user' } }))
        return { kind: 'success' as const, text: 'annotation sent' }
      },
    })
  } catch {
    // A host whose command API differs keeps the composer path; the tools above are already registered.
  }
}

export const inject = ['tools']
