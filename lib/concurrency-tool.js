import { defineTool } from '@deepseek-ai/dsh-tools';
import { runConcurrencyScan } from './concurrency.js';
import { renderReportText } from './report-view.js';
export const CONCURRENCY_SCAN_TOOL_NAME = 'model_concurrency_scan';
/**
 * Model-visible DSH tool that mines design documents/plans for concurrency-related
 * claims and risk keywords. It does not prove concurrency safety; it flags terms
 * such as "thread-safe", "lock-free", "race condition", "atomic", "mutex", etc.,
 * so the model can either provide dedicated evidence or mark the claim unverified.
 */
export const modelConcurrencyScanTool = defineTool({
    name: CONCURRENCY_SCAN_TOOL_NAME,
    description: 'Scan a document or plan text for claims about how work is executed: threads, synchronization, async tasks, interrupts, shared state. Use ONLY after confirming the target actually has concurrency requirements or behavior; if the target is purely sequential, do not call this tool. Findings carry a family (threads, synchronization, async, interrupts, shared-state) and an absolute claim is one a plan makes about safety rather than a risk it mentions. Returns keywords like thread-safe, lock-free, wait-free, data race, race condition, atomic, synchronized, mutex, semaphore, spinlock, shared variable, shared memory, reentrant, interrupt-safe, ISR, IRQ, NMI, critical section, disable_irq/enable_irq; async ones such as async, await, promise, event loop, callback, microtask, coroutine, fire-and-forget, backpressure, task queue; and their Chinese counterparts (线程安全, 无数据竞争, 无锁, 互斥, 原子, 并发, 临界区, 异步, 回调, 事件循环, 微任务, 协程, 背压 and so on). Absolute claims (thread-safe, lock-free, no data race, interrupt-safe, ISR-safe, non-blocking, never blocks) are flagged as errors requiring dedicated verification, and each carries suggestions naming the analysis to run instead, chosen by family: TSan/Helgrind/CBMC/TLA+ for threads, RTOS-aware analysis for interrupts, and TLA+/UPPAAL plus a runtime check for async, where a blocking call on the event loop, a missing await and a lock held across an await are invisible to any model. Text with no claim to mine is refused with `CONCURRENCY_NO_CLAIM` rather than reported as clean: a scan of nothing is not a clean bill of health, and that includes text in a vocabulary this scan does not match. This plugin does not prove concurrency safety, and this tool does not check a machine: to decide a protocol it mined, model it and call `model_verify`, or compose two of them with `model_compose_verify`.',
    parameters: {
        text: {
            type: 'string',
            required: true,
            description: 'Document or plan text to scan for claims about threads, synchronization, async tasks, interrupts or shared state.',
        },
        reportView: {
            type: 'string',
            enum: ['digest', 'full'],
            description: 'digest (default) prints the readable body; full prints the structured report, which report_diff needs.',
        },
    },
    output: {
        schema: {
            type: 'json',
            description: 'Concurrency scan report with findings and summary.',
        },
        render(args, value) {
            return [{ type: 'text', text: renderReportText(value, { full: args.reportView === 'full' }) }];
        },
    },
    timeoutMs: 10_000,
    isConcurrencySafe: () => true,
    async execute(args) {
        return runConcurrencyScan(args.text);
    },
});
