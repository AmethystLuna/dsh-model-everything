import { REPORT_SCHEMAS, refusalVerdict, verdictOfFindings } from './engine.js';
const KEYWORD_RULES = [
    { pattern: /\bthread\s*-?\s*safe\b/i, label: 'thread-safe', absolute: true },
    { pattern: /\block\s*-?\s*free\b/i, label: 'lock-free', absolute: true },
    { pattern: /\bwait\s*-?\s*free\b/i, label: 'wait-free', absolute: true },
    { pattern: /\bno\s+data\s+race\b/i, label: 'no data race', absolute: true },
    { pattern: /\brace\s*-?\s*free\b/i, label: 'race-free', absolute: true },
    { pattern: /\bdata\s+race\b/i, label: 'data race', absolute: false },
    { pattern: /\brace\s+condition\b/i, label: 'race condition', absolute: false },
    { pattern: /\bthread\s*-?\s*safety\b/i, label: 'thread safety', absolute: false },
    { pattern: /\bconcurrent\b/i, label: 'concurrent', absolute: false },
    { pattern: /\bparallel\b/i, label: 'parallel', absolute: false },
    { pattern: /\bmulti-?threaded\b/i, label: 'multi-threaded', absolute: false },
    { pattern: /\bmultithreaded\b/i, label: 'multithreaded', absolute: false },
    { pattern: /\batomic\b/i, label: 'atomic', absolute: false },
    { pattern: /\bsynchronized\b/i, label: 'synchronized', absolute: false },
    { pattern: /\bmutex\b/i, label: 'mutex', absolute: false },
    { pattern: /\bsemaphore\b/i, label: 'semaphore', absolute: false },
    { pattern: /\bspinlock\b/i, label: 'spinlock', absolute: false },
    { pattern: /\bshared\s+variable\b/i, label: 'shared variable', absolute: false },
    { pattern: /\bshared\s+memory\b/i, label: 'shared memory', absolute: false },
    { pattern: /\bglobal\s+state\b/i, label: 'global state', absolute: false },
    { pattern: /\breentrant\b/i, label: 'reentrant', absolute: false },
    { pattern: /\binterrupt\s*-?\s*safe\b/i, label: 'interrupt-safe', absolute: true },
    { pattern: /\bISR\s*-?\s*safe\b/i, label: 'ISR-safe', absolute: true },
    { pattern: /\binterrupt\s+safety\b/i, label: 'interrupt safety', absolute: false },
    { pattern: /\binterrupt\s+context\b/i, label: 'interrupt context', absolute: false },
    { pattern: /\bISR\b/i, label: 'ISR', absolute: false },
    { pattern: /\bIRQ\b/i, label: 'IRQ', absolute: false },
    { pattern: /\bNMI\b/i, label: 'NMI', absolute: false },
    { pattern: /\bcritical\s+section\b/i, label: 'critical section', absolute: false },
    { pattern: /\bdisable_irq\b/i, label: 'disable_irq', absolute: false },
    { pattern: /\benable_irq\b/i, label: 'enable_irq', absolute: false },
    { pattern: /\bspin_lock_irqsave\b/i, label: 'spin_lock_irqsave', absolute: false },
    // Chinese terms. The vocabulary was English-only, so a Chinese document about the same subject mined
    // nothing and landed in the no-claim path - a blind spot that read as a clean scan. A negated form is an
    // absolute claim, and the lookbehind keeps the bare term from firing on the same line as well.
    { pattern: /线程安全/, label: '线程安全 (thread-safe)', absolute: true },
    { pattern: /无数据竞争/, label: '无数据竞争 (no data race)', absolute: true },
    { pattern: /(?<!无)数据竞争/, label: '数据竞争 (data race)', absolute: false },
    { pattern: /无竞态/, label: '无竞态 (race-free)', absolute: true },
    { pattern: /(?:无锁|免锁)/, label: '无锁 (lock-free)', absolute: true },
    { pattern: /(?:中断安全|ISR安全)/, label: '中断安全 (interrupt-safe)', absolute: true },
    { pattern: /竞态条件/, label: '竞态条件 (race condition)', absolute: false },
    { pattern: /并发/, label: '并发 (concurrent)', absolute: false },
    { pattern: /并行/, label: '并行 (parallel)', absolute: false },
    { pattern: /多线程/, label: '多线程 (multi-threaded)', absolute: false },
    { pattern: /原子/, label: '原子 (atomic)', absolute: false },
    { pattern: /互斥/, label: '互斥 (mutex)', absolute: false },
    { pattern: /信号量/, label: '信号量 (semaphore)', absolute: false },
    { pattern: /自旋锁/, label: '自旋锁 (spinlock)', absolute: false },
    { pattern: /共享变量/, label: '共享变量 (shared variable)', absolute: false },
    { pattern: /共享内存/, label: '共享内存 (shared memory)', absolute: false },
    { pattern: /全局状态/, label: '全局状态 (global state)', absolute: false },
    { pattern: /可重入/, label: '可重入 (reentrant)', absolute: false },
    { pattern: /临界区/, label: '临界区 (critical section)', absolute: false },
    { pattern: /关中断/, label: '关中断 (disable interrupt)', absolute: false },
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
    const suggestionsFor = (label) => {
        if (/thread-safe|lock-free|wait-free|race-free|no data race|data race|race condition|thread safety/.test(label)) {
            return ['TSan / Helgrind (runtime data-race detection)', 'CBMC / static analysis (proof-oriented)', 'TLA+ (exhaustive interleaving model)'];
        }
        if (/interrupt-safe|ISR-safe|interrupt context|critical section|disable_irq|enable_irq/.test(label)) {
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
                    ? 'Concurrency safety claim "' + rule.label + '" detected; this plugin does not verify concurrency — this needs dedicated verification.'
                    : 'Concurrency-related term "' + rule.label + '" detected; review whether the plan addresses this risk.',
                line: lineNumber,
                snippet: line.trim().slice(0, 200),
                keyword: rule.label,
                ...(rule.absolute ? { suggestions: suggestionsFor(rule.label) } : {}),
            };
            findings.push(finding);
        }
    });
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
    nextSteps.push('This scan mines claims; it does not prove concurrency safety — route each one to the tool named in its suggestions.');
    if (findings.length === 0) {
        // Nothing was mined, so nothing was examined. Reporting `pass` here said "no concurrency problem"
        // about a text this scan could not see: the same false green as a check that examined nothing, and the
        // common case, because a plan that is not about concurrency at all lands here too.
        const reason = 'the text contains no concurrency claim this scan can mine, so there is nothing to scan. It is either not about concurrency, or it is written in a vocabulary this scan does not match: it reads English terms such as mutex, atomic and thread-safe, and Chinese ones such as 互斥, 原子 and 线程安全';
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
