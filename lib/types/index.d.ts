/**
 * dsh-model-everything — DeepSeek Harness native plugin for models and diagrams.
 *
 * It ships a skill set (one entry skill plus a skill per domain) and the tools that do
 * the work: UML diagrams render, parse and review; state machines, protocols and composed
 * machines are checked by running them; data models and migrations are checked by the same
 * doctrine; concurrency claims are mined and routed; a verified model is exported to an
 * external checker; a structure diagram is audited as a dependency graph; two reports are
 * diffed against each other.
 *
 * Every tool carries its own description and every report says what it proves, so a model
 * reaches for one the way it reaches for any other tool: by reading what it says it does.
 * The plugin writes nothing into a session.
 *
 * The skills ship in this package's `skills/` directory and are registered at apply time
 * into dsh's `ctx.skills` registry through the standard filesystem provider, so they appear
 * in every session catalog without a manual copy step.
 *
 * Method, doctrine and per-domain detail live in the skills and their references, not here.
 *
 * @module dsh-model-everything
 */
import type { Context, Volatile } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export declare const name = "dsh-model-everything";
export declare const inject: string[];
export type InteractionMode = 'ask' | 'auto' | 'follow-approval';
export interface Config {
    /**
     * The injection switch the Web client's Plugins page edits live: a `Volatile`
     * reference on a host whose schemastery supports one, an ordinary boolean on a
     * which accepts both shapes.
     */
    enabled: Volatile<boolean> | boolean;
    interaction: InteractionMode;
}
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    enabled: z<boolean, boolean, "defined">;
    interaction: z<"ask" | "auto" | "follow-approval", "ask" | "auto" | "follow-approval", "defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    enabled: z<boolean, boolean, "defined">;
    interaction: z<"ask" | "auto" | "follow-approval", "ask" | "auto" | "follow-approval", "defined">;
}>>, "plain">;
export declare function apply(ctx: Context, config: Config): void;
/**
 * Whether the gate already entered this session's durable history. The
 * pre-step listener re-appends the gate until it does; once a step committed
 * it, every later step (and a resume of a session that kept it) skips the
 * injection. A session whose gate was dropped before any step ran (e.g. an
 * inbox cleared by a blank-session preset switch) simply re-injects on the
 * first step that runs.
 */
