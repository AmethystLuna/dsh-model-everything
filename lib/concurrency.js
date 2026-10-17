import { REPORT_SCHEMAS, refusalVerdict, verdictOfFindings } from './engine.js';
/** How a finding names its family in prose. */
const FAMILY_WORD = {
    threads: 'Concurrency',
    synchronization: 'Synchronization',
    async: 'Async',
    interrupts: 'Interrupt',
    'shared-state': 'Shared-state',
};
const KEYWORD_RULES = [
    // Threads: the vocabulary the scan started with.
    { pattern: /\bthread\s*-?\s*safe\b/i, label: 'thread-safe', absolute: true, family: 'threads' },
    { pattern: /\block\s*-?\s*free\b/i, label: 'lock-free', absolute: true, family: 'threads' },
    { pattern: /\bwait\s*-?\s*free\b/i, label: 'wait-free', absolute: true, family: 'threads' },
    { pattern: /\bno\s+data\s+race\b/i, label: 'no data race', absolute: true, family: 'threads' },
    { pattern: /\brace\s*-?\s*free\b/i, label: 'race-free', absolute: true, family: 'threads' },
    { pattern: /\bdata\s+race\b/i, label: 'data race', absolute: false, family: 'threads' },
    { pattern: /\brace\s+condition\b/i, label: 'race condition', absolute: false, family: 'threads' },
    { pattern: /\bthread\s*-?\s*safety\b/i, label: 'thread safety', absolute: false, family: 'threads' },
    { pattern: /\bconcurrent\b/i, label: 'concurrent', absolute: false, family: 'threads' },
    { pattern: /\bparallel\b/i, label: 'parallel', absolute: false, family: 'threads' },
    { pattern: /\bmulti-?threaded\b/i, label: 'multi-threaded', absolute: false, family: 'threads' },
    { pattern: /\bmultithreaded\b/i, label: 'multithreaded', absolute: false, family: 'threads' },
    // Synchronization primitives: a claim that names one is a claim about what it protects.
    { pattern: /\batomic\b/i, label: 'atomic', absolute: false, family: 'synchronization' },
    { pattern: /\bsynchronized\b/i, label: 'synchronized', absolute: false, family: 'synchronization' },
    { pattern: /\bmutex\b/i, label: 'mutex', absolute: false, family: 'synchronization' },
    { pattern: /\bsemaphore\b/i, label: 'semaphore', absolute: false, family: 'synchronization' },
    { pattern: /\bspinlock\b/i, label: 'spinlock', absolute: false, family: 'synchronization' },
    { pattern: /\breentrant\b/i, label: 'reentrant', absolute: false, family: 'synchronization' },
    // Shared state: no primitive named, so the review asks what guards it.
    { pattern: /\bshared\s+variable\b/i, label: 'shared variable', absolute: false, family: 'shared-state' },
    { pattern: /\bshared\s+memory\b/i, label: 'shared memory', absolute: false, family: 'shared-state' },
    { pattern: /\bglobal\s+state\b/i, label: 'global state', absolute: false, family: 'shared-state' },
    // Interrupts.
    { pattern: /\binterrupt\s*-?\s*safe\b/i, label: 'interrupt-safe', absolute: true, family: 'interrupts' },
    { pattern: /\bISR\s*-?\s*safe\b/i, label: 'ISR-safe', absolute: true, family: 'interrupts' },
    { pattern: /\binterrupt\s+safety\b/i, label: 'interrupt safety', absolute: false, family: 'interrupts' },
    { pattern: /\binterrupt\s+context\b/i, label: 'interrupt context', absolute: false, family: 'interrupts' },
    { pattern: /\bISR\b/i, label: 'ISR', absolute: false, family: 'interrupts' },
    { pattern: /\bIRQ\b/i, label: 'IRQ', absolute: false, family: 'interrupts' },
    { pattern: /\bNMI\b/i, label: 'NMI', absolute: false, family: 'interrupts' },
    { pattern: /\bcritical\s+section\b/i, label: 'critical section', absolute: false, family: 'interrupts' },
    { pattern: /\bdisable_irq\b/i, label: 'disable_irq', absolute: false, family: 'interrupts' },
    { pattern: /\benable_irq\b/i, label: 'enable_irq', absolute: false, family: 'interrupts' },
    { pattern: /\bspin_lock_irqsave\b/i, label: 'spin_lock_irqsave', absolute: false, family: 'interrupts' },
    // Async: a second execution model, with its own failure modes and its own verifiers. These terms were
    // absent, so an async design mined nothing and was refused as "no claim" - a blind spot that reads as a
    // clean scan, the same defect the Chinese vocabulary had.
    { pattern: /\bnon-?\s*blocking\b/i, label: 'non-blocking', absolute: true, family: 'async' },
    { pattern: /\bnever\s+blocks?\b/i, label: 'never blocks', absolute: true, family: 'async' },
    { pattern: /\bno\s+blocking\b/i, label: 'no blocking', absolute: true, family: 'async' },
    { pattern: /\basync\b/i, label: 'async', absolute: false, family: 'async' },
    { pattern: /\bawaits?\b/i, label: 'await', absolute: false, family: 'async' },
    { pattern: /\bpromises?\b/i, label: 'promise', absolute: false, family: 'async' },
    { pattern: /\bevent\s+loop\b/i, label: 'event loop', absolute: false, family: 'async' },
    { pattern: /\bcallbacks?\b/i, label: 'callback', absolute: false, family: 'async' },
    { pattern: /\bmicrotasks?\b/i, label: 'microtask', absolute: false, family: 'async' },
    { pattern: /\bcoroutines?\b/i, label: 'coroutine', absolute: false, family: 'async' },
    { pattern: /\bfire\s*-?\s*and\s*-?\s*forget\b/i, label: 'fire-and-forget', absolute: false, family: 'async' },
    { pattern: /\bbackpressure\b/i, label: 'backpressure', absolute: false, family: 'async' },
    { pattern: /\btask\s+queue\b/i, label: 'task queue', absolute: false, family: 'async' },
    // Chinese terms. The vocabulary was English-only, so a Chinese document about the same subject mined
    // nothing and landed in the no-claim path - a blind spot that read as a clean scan. A negated form is an
    // absolute claim, and the lookbehind keeps the bare term from firing on the same line as well.
    { pattern: /线程安全/, label: '线程安全 (thread-safe)', absolute: true, family: 'threads' },
    { pattern: /无数据竞争/, label: '无数据竞争 (no data race)', absolute: true, family: 'threads' },
    { pattern: /(?<!无)数据竞争/, label: '数据竞争 (data race)', absolute: false, family: 'threads' },
    { pattern: /无竞态/, label: '无竞态 (race-free)', absolute: true, family: 'threads' },
    { pattern: /(?:无锁|免锁)/, label: '无锁 (lock-free)', absolute: true, family: 'threads' },
    { pattern: /(?:中断安全|ISR安全)/, label: '中断安全 (interrupt-safe)', absolute: true, family: 'interrupts' },
    { pattern: /竞态条件/, label: '竞态条件 (race condition)', absolute: false, family: 'threads' },
    { pattern: /并发/, label: '并发 (concurrent)', absolute: false, family: 'threads' },
    { pattern: /并行/, label: '并行 (parallel)', absolute: false, family: 'threads' },
    { pattern: /多线程/, label: '多线程 (multi-threaded)', absolute: false, family: 'threads' },
    { pattern: /原子/, label: '原子 (atomic)', absolute: false, family: 'synchronization' },
    { pattern: /互斥/, label: '互斥 (mutex)', absolute: false, family: 'synchronization' },
    { pattern: /信号量/, label: '信号量 (semaphore)', absolute: false, family: 'synchronization' },
    { pattern: /自旋锁/, label: '自旋锁 (spinlock)', absolute: false, family: 'synchronization' },
    { pattern: /共享变量/, label: '共享变量 (shared variable)', absolute: false, family: 'shared-state' },
    { pattern: /共享内存/, label: '共享内存 (shared memory)', absolute: false, family: 'shared-state' },
    { pattern: /全局状态/, label: '全局状态 (global state)', absolute: false, family: 'shared-state' },
    { pattern: /可重入/, label: '可重入 (reentrant)', absolute: false, family: 'synchronization' },
    { pattern: /临界区/, label: '临界区 (critical section)', absolute: false, family: 'interrupts' },
    { pattern: /关中断/, label: '关中断 (disable interrupt)', absolute: false, family: 'interrupts' },
    { pattern: /(?:非阻塞|不阻塞|无阻塞|零阻塞)/, label: '非阻塞 (non-blocking)', absolute: true, family: 'async' },
    { pattern: /异步/, label: '异步 (async)', absolute: false, family: 'async' },
    { pattern: /回调/, label: '回调 (callback)', absolute: false, family: 'async' },
    { pattern: /事件循环/, label: '事件循环 (event loop)', absolute: false, family: 'async' },
    { pattern: /微任务/, label: '微任务 (microtask)', absolute: false, family: 'async' },
    { pattern: /协程/, label: '协程 (coroutine)', absolute: false, family: 'async' },
    { pattern: /背压/, label: '背压 (backpressure)', absolute: false, family: 'async' },
];
/**
 * The text to scan, or a refusal naming what arrived instead.
 *
 * `runConcurrencyScan(undefined)` threw a read of `split` on undefined. The scan proves nothing
 * either way, so a caller who passed the wrong variable must be told which one was wrong rather
 * than left with a crash.
 */
function requireScanText(value) {
    if (typeof value !== 'string') {
        const arrived = value === null ? 'null' : Array.isArray(value) ? 'an array' : typeof value;
        throw new Error('text must be a string to scan, got ' + arrived + '. Pass the source or the notes to scan for concurrency claims.');
    }
    return value;
}
export function runConcurrencyScan(text) {
    const source = requireScanText(text);
    const lines = source.split(/\r?\n/);
    const findings = [];
    const seen = new Set();
    const suggestionsFor = (family) => {
        if (family === 'async') {
            return [
                'TLA+ (exhaustive interleaving), or model_compose_verify for a handshake between two tasks',
                'model_verify with maxTicks + tickEvents (a timeout is a deadline), or model_export -> UPPAAL for clocks',
                'A runtime or static check for the three things a model cannot see: a blocking call on the event loop, a missing await (fire-and-forget), a lock held across an await',
            ];
        }
        if (family === 'threads') {
            return ['TSan / Helgrind (runtime data-race detection)', 'CBMC / static analysis (proof-oriented)', 'TLA+ (exhaustive interleaving model)'];
        }
        if (family === 'interrupts') {
            return ['RTOS-aware analysis (interrupt latency, priority inversion)', 'CBMC (state-machine + ISR interleaving proof)', 'TLA+ (preemption/exclusion model)'];
        }
        return ['Dedicated concurrency verification (TSan, CBMC, TLA+, or RTOS-specific analysis)'];
    };
    lines.forEach((line, index) => {
        const lineNumber = index + 1;
        const lower = line.toLowerCase();
        for (const rule of KEYWORD_RULES) {
            if (!rule.pattern.test(line))
                continue;
            const key = rule.label + ':' + lineNumber;
            if (seen.has(key))
                continue;
            seen.add(key);
            const finding = {
                code: rule.absolute ? 'CONCURRENCY_ABSOLUTE_CLAIM' : 'CONCURRENCY_KEYWORD',
                severity: rule.absolute ? 'error' : 'warning',
                message: rule.absolute
                    ? FAMILY_WORD[rule.family] + ' safety claim "' + rule.label + '" detected; this plugin does not verify it — it needs dedicated verification.'
                    : FAMILY_WORD[rule.family] + '-related term "' + rule.label + '" detected; review whether the plan addresses this risk.',
                line: lineNumber,
                snippet: line.trim().slice(0, 200),
                keyword: rule.label,
                family: rule.family,
                ...(rule.absolute ? { suggestions: suggestionsFor(rule.family) } : {}),
            };
            findings.push(finding);
        }
    });
    const families = new Set(findings.map((finding) => finding.family));
    const errors = findings.filter((finding) => finding.severity === 'error').length;
    const warnings = findings.filter((finding) => finding.severity === 'warning').length;
    const absoluteClaims = findings.filter((finding) => finding.code === 'CONCURRENCY_ABSOLUTE_CLAIM').length;
    const nextSteps = [];
    if (absoluteClaims > 0) {
        nextSteps.push('Every absolute claim must either cite dedicated evidence (a TSan/Helgrind run, a CBMC harness, a TLA+ model of the interleaving) or be restated as a bounded, testable property.');
    }
    if (findings.length > absoluteClaims) {
        nextSteps.push('Review each flagged keyword: a plan that names shared state, a mutex or an interrupt without a synchronization argument is incomplete, not merely verbose.');
    }
    if (families.has('async')) {
        nextSteps.push('For an async design, three defects are invisible to this scan and to any model: a blocking call on the event loop, an await that never happens (fire-and-forget), and a lock held across an await. Name them in the model, or check them at runtime.');
    }
    nextSteps.push('This scan mines claims; it does not prove concurrency safety — route each one to the tool named in its suggestions.');
    if (findings.length === 0) {
        // Nothing was mined, so nothing was examined. Reporting `pass` here said "no concurrency problem"
        // about a text this scan could not see: the same false green as a check that examined nothing, and the
        // common case, because a plan that is not about concurrency at all lands here too.
        const reason = 'the text contains no concurrency claim this scan can mine, so there is nothing to scan. It is either not about concurrency, or it is written in a vocabulary this scan does not match: it reads English terms such as mutex, atomic, thread-safe, async, await and event loop, and Chinese ones such as 互斥, 原子, 线程安全 and 事件循环';
        return {
            ok: false,
            ran: false,
            ...refusalVerdict(reason),
            schema: REPORT_SCHEMAS.concurrency,
            errorCode: 'CONCURRENCY_NO_CLAIM',
            error: reason,
            findings: [],
            summary: { lines: lines.length, keywords: 0, absoluteClaims: 0, warnings: 0, errors: 0 },
            hashes: {},
            nextSteps: [
                'If the text does discuss concurrency, name the claim explicitly — the resource, the guard, and what it protects — and scan it again.',
                'This scan mines claims; it does not prove concurrency safety — route each one to the tool named in its suggestions.',
            ],
        };
    }
    return {
        ok: true,
        ran: true,
        ...verdictOfFindings(findings),
        schema: REPORT_SCHEMAS.concurrency,
        findings,
        summary: {
            lines: lines.length,
            keywords: findings.length,
            absoluteClaims,
            warnings,
            errors,
        },
        hashes: {},
        nextSteps,
    };
}
