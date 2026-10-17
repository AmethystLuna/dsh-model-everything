import { runConcurrencyScan } from '../../lib/concurrency.js'

function assertNoUndefinedValues(value, path = 'root') {
  if (value === undefined) throw new Error(`undefined at ${path}`)
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoUndefinedValues(entry, `${path}[${index}]`))
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) assertNoUndefinedValues(entry, `${path}.${key}`)
  }
}

let failures = 0
function test(name, fn) {
  try {
    fn()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', error instanceof Error ? error.message : String(error))
  }
}

test('flags absolute concurrency claims and risk keywords', () => {
  const report = runConcurrencyScan('This module is thread-safe and lock-free. There may be a race condition in the shared buffer.')
  const absolute = report.findings.filter((finding) => finding.code === 'CONCURRENCY_ABSOLUTE_CLAIM')
  const keywords = report.findings.filter((finding) => finding.code === 'CONCURRENCY_KEYWORD')
  if (absolute.length === 0) throw new Error('expected absolute concurrency claims')
  if (keywords.length === 0) throw new Error('expected concurrency keywords')
  if (report.summary.errors === 0) throw new Error('expected errors for absolute claims')
  assertNoUndefinedValues(report)
})

test('text with no claim is refused, not reported as clean', () => {
  // It used to answer `verdict: pass` with `keywords: 0`. "I found no claim to examine" and "I examined
  // the claims and they hold" then read the same, and the first is the common case for a paragraph that
  // is not about concurrency at all.
  const report = runConcurrencyScan('The migration copies users from source to target.')
  if (report.findings.length !== 0) throw new Error('expected no findings, got ' + JSON.stringify(report.findings))
  if (report.ran !== false) throw new Error('a scan that mined nothing did not do its work: ran=' + String(report.ran))
  if (report.ok !== false) throw new Error('and it must not report success: ok=' + String(report.ok))
  if (report.errorCode !== 'CONCURRENCY_NO_CLAIM') throw new Error('the refusal carries a code, got ' + String(report.errorCode))
  if (!/no concurrency claim/.test(String(report.verdictReason))) throw new Error('and says what it looked for: ' + String(report.verdictReason))
  assertNoUndefinedValues(report)
})

test('the near miss: one claim is enough to scan', () => {
  // The refusal must be about the input, not about the scanner being timid: a single mined claim turns the
  // same call into a report.
  const report = runConcurrencyScan('The queue is guarded by a mutex.')
  if (report.ran !== true || report.ok !== true) throw new Error('one claim must be enough: ran=' + String(report.ran) + ' ok=' + String(report.ok))
  if (report.findings.length === 0) throw new Error('and the claim must be mined')
})

test('Chinese claims are mined, not silently passed over', () => {
  // The vocabulary was English-only (`\bthread-safe\b`, `\bmutex\b`), so a Chinese document about the same
  // subject mined nothing and landed in the no-claim path - a blind spot that read as a clean scan.
  //
  // One term per case, because a sentence that carries several of them stays green when any one rule is
  // deleted. The mutation check found that: dropping the thread-safety rule changed nothing as long as the
  // sentence also said 无数据竞争, which is exactly what "one positive case per code" is for.
  const absolute = ['线程安全', '无数据竞争', '无竞态', '无锁', '中断安全']
  for (const term of absolute) {
    const report = runConcurrencyScan('结论：' + term + '。')
    const codes = report.findings.map((finding) => finding.code)
    if (!codes.includes('CONCURRENCY_ABSOLUTE_CLAIM')) throw new Error(term + ' is an absolute claim, got ' + JSON.stringify(codes))
    if (codes.includes('CONCURRENCY_KEYWORD')) throw new Error(term + ' must not also fire as a bare term, got ' + JSON.stringify(report.findings.map((finding) => finding.keyword)))
  }
  const plain = ['数据竞争', '竞态条件', '并发', '并行', '多线程', '原子', '互斥', '信号量', '自旋锁', '共享变量', '共享内存', '全局状态', '可重入', '临界区', '关中断']
  for (const term of plain) {
    const report = runConcurrencyScan('结论：' + term + '。')
    const codes = report.findings.map((finding) => finding.code)
    if (!codes.includes('CONCURRENCY_KEYWORD')) throw new Error(term + ' must be mined as a keyword, got ' + JSON.stringify(codes))
    if (codes.includes('CONCURRENCY_ABSOLUTE_CLAIM')) throw new Error(term + ' is not an absolute claim, got ' + JSON.stringify(report.findings.map((finding) => finding.keyword)))
  }
  // A negated form is one absolute claim, not an absolute claim plus its bare term.
  const negated = runConcurrencyScan('无数据竞争。')
  const codes = negated.findings.map((finding) => finding.code)
  if (codes.filter((code) => code === 'CONCURRENCY_ABSOLUTE_CLAIM').length !== 1) throw new Error('no-data-race is one absolute claim: ' + JSON.stringify(codes))
  if (codes.includes('CONCURRENCY_KEYWORD')) throw new Error('and not also its bare term: ' + JSON.stringify(negated.findings.map((finding) => finding.keyword)))
})

test('flags interrupt safety claims and IRQ keywords', () => {
  const report = runConcurrencyScan('The ISR is interrupt-safe and uses disable_irq/enable_irq.')
  const absolute = report.findings.filter((finding) => finding.code === 'CONCURRENCY_ABSOLUTE_CLAIM')
  if (!absolute.some((finding) => finding.keyword === 'interrupt-safe')) throw new Error('expected interrupt-safe absolute claim')
  const keywords = report.findings.filter((finding) => finding.code === 'CONCURRENCY_KEYWORD')
  if (!keywords.some((finding) => finding.keyword === 'disable_irq')) throw new Error('expected disable_irq keyword')
  assertNoUndefinedValues(report)
})

test('absolute claims carry dedicated-tool routing suggestions', () => {
  const report = runConcurrencyScan('This module is thread-safe. The ISR is interrupt-safe.')
  const absolute = report.findings.filter((finding) => finding.code === 'CONCURRENCY_ABSOLUTE_CLAIM')
  if (absolute.length === 0) throw new Error('expected absolute claims')
  for (const finding of absolute) {
    if (!Array.isArray(finding.suggestions) || finding.suggestions.length === 0) {
      throw new Error('absolute claim must carry suggestions, got ' + JSON.stringify(finding))
    }
  }
  const threadSafe = absolute.find((finding) => finding.keyword === 'thread-safe')
  if (threadSafe === undefined || !threadSafe.suggestions.some((s) => s.includes('TLA+'))) {
    throw new Error('thread-safe should suggest TLA+ among its routes')
  }
  const interruptSafe = absolute.find((finding) => finding.keyword === 'interrupt-safe')
  if (interruptSafe === undefined || !interruptSafe.suggestions.some((s) => s.includes('CBMC'))) {
    throw new Error('interrupt-safe should suggest CBMC among its routes')
  }
  const keywords = report.findings.filter((finding) => finding.code === 'CONCURRENCY_KEYWORD')
  for (const keyword of keywords) {
    if (keyword.suggestions !== undefined) throw new Error('keyword findings must not carry suggestions')
  }
  assertNoUndefinedValues(report)
})

if (failures > 0) {
  console.log('concurrency tests failed:', failures)
  process.exit(1)
}
console.log('all concurrency tests passed')
