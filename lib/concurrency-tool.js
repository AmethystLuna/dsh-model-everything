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
    description: 'Scan a document or plan text for concurrency risk points. Use ONLY after confirming the target actually has concurrency requirements or behavior (threads, async tasks, interrupts, shared state, parallel execution). If the target is purely sequential, do not call this tool. Returns findings for keywords like thread-safe, lock-free, wait-free, data race, race condition, atomic, synchronized, mutex, semaphore, spinlock, shared variable, shared memory, reentrant, interrupt-safe, ISR, IRQ, NMI, critical section, disable_irq/enable_irq, and their Chinese counterparts (线程安全, 无数据竞争, 无锁, 互斥, 原子, 并发, 临界区 and so on). Absolute claims (thread-safe, lock-free, no data race, interrupt-safe, ISR-safe) are flagged as errors requiring dedicated verification, and each carries suggestions naming the analysis to run instead (TSan/Helgrind, CBMC, TLA+, or RTOS-aware interrupt analysis). Text with no claim to mine is refused with `CONCURRENCY_NO_CLAIM` rather than reported as clean: a scan of nothing is not a clean bill of health, and that includes text in a vocabulary this scan does not match. This plugin does not prove concurrency safety, and this tool does not check a machine: to decide a protocol it mined, model it and call `model_verify`, or compose two of them with `model_compose_verify`.',
    parameters: {
        text: {
            type: 'string',
            required: true,
            description: 'Document or plan text to scan for concurrency-related claims.',
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
