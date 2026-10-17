/**
 * Report diffing: "did this slice add findings, or remove them?"
 *
 * The acceptance criterion of a refactoring slice is usually *not* "zero findings" —
 * it is "no NEW findings, and none of the old ones got worse". Comparing two JSON
 * reports by hand is how that gets fudged, so the comparison is code.
 *
 * A finding's identity is its machine-readable locator, never its prose:
 * `check|code|<canonical evidence + path>`. Findings that carry neither evidence nor a
 * path fall back to their message, because an engine that reports nothing structured
 * has nothing stabler to match on. Two runs over the same input must produce zero
 * added and zero removed findings.
 *
 * @module dsh-model-everything-baseline
 */

import { canonicalJson, REPORT_SCHEMAS, verdictOf, type Finding, type Verdict, type VerdictSummary } from './engine.js'

/** A finding as it appears in any report family, after flattening. */
export interface ReportFinding extends Finding {
  /** The check that emitted it (verify/datamodel: `S2`, `C1`, …); absent for flat families. */
  check?: string
}

export interface BaselineChange {
  identity: string
  code: string
  before: { severity: string; message: string }
  after: { severity: string; message: string }
}

export interface BaselineReport {
  ok: boolean
  ran: boolean
  verdict: Verdict
  verdictReason: string
  /** The versioned report contract this result follows. */
  schema: string
  /** The current report's own verdict, echoed so "no new findings" cannot hide a failing run. */
  currentVerdict: Verdict
  added: ReportFinding[]
  removed: ReportFinding[]
  changed: BaselineChange[]
  summary: {
    baseline: number
    current: number
    added: number
    removed: number
    changed: number
    addedErrors: number
    addedWarnings: number
  }
  nextSteps: string[]
}

/**
 * The stable identity of a finding: check + file + code + a canonical locator. Prose is
 * excluded so a reworded message reads as `changed`, not as a new finding.
 */
export function findingIdentity(finding: ReportFinding): string {
  const locator = canonicalJson({
    ...(finding.evidence === undefined ? {} : { evidence: finding.evidence }),
    ...(finding.path === undefined ? {} : { path: finding.path }),
  })
  const where = locator === '{}' ? 'message:' + finding.message : locator
  const file = finding.file === undefined ? '' : finding.file + '|'
  return (finding.check === undefined ? '' : finding.check + '|') + file + finding.code + '|' + where
}

/** Flatten a report of any family into one finding list (`checks[].findings` or `findings[]`). */
export function flattenReportFindings(report: unknown): ReportFinding[] {
  if (report === null || typeof report !== 'object') return []
  const record = report as Record<string, unknown>
  const flat: ReportFinding[] = []
  if (Array.isArray(record.checks)) {
    for (const check of record.checks as Array<Record<string, unknown>>) {
      const id = typeof check.id === 'string' ? check.id : undefined
      for (const finding of (Array.isArray(check.findings) ? check.findings : []) as Finding[]) {
        flat.push(id === undefined ? finding : { ...finding, check: id })
      }
    }
  }
  if (Array.isArray(record.findings)) {
    for (const finding of record.findings as Finding[]) flat.push(finding)
  }
  return flat
}

/** The report's own verdict, whatever family it came from. */
function verdictOfReport(report: unknown): Verdict {
  if (report === null || typeof report !== 'object') return 'fail'
  const value = (report as Record<string, unknown>).verdict
  return value === 'pass' || value === 'pass_with_findings' || value === 'fail' ? value : 'fail'
}

function diffOf(added: number, removed: number, addedErrors: number, firstCode?: string): VerdictSummary {
  if (addedErrors > 0) {
    return {
      verdict: 'fail',
      verdictReason: String(added) + ' new finding(s) (' + String(addedErrors) + ' error)' + (firstCode === undefined ? '' : ' (first error: ' + firstCode + ')'),
    }
  }
  if (added > 0) {
    return { verdict: 'pass_with_findings', verdictReason: String(added) + ' new warning finding(s), no new errors' }
  }
  if (removed > 0) {
    return { verdict: 'pass', verdictReason: 'no new findings; ' + String(removed) + ' finding(s) resolved' }
  }
  return { verdict: 'pass', verdictReason: 'no new findings, nothing resolved' }
}

/**
 * Compare a baseline report with the current one. The verdict describes the *delta*
 * (a new error fails it), while `currentVerdict` keeps the absolute result visible.
 */
/**
 * Whether a value is a report this can compare.
 *
 * `diffReports(null, null)` answered `verdict: 'pass'`. With no inputs, every comparison found
 * nothing to compare and the report said the two agree - the worst shape of a false green, because
 * the absence of an input reads as agreement. A caller who passed the wrong variable would take
 * that verdict at face value.
 *
 * The first fix refused only `null` and `undefined`, on the argument that a present-but-wrong value
 * still carries `currentVerdict: 'fail'` and the delta is honestly empty. Running the installed
 * plugin disproved that: `report_diff` with two `'junk'` strings answered `verdict: pass`, and
 * `verdict` is the field a reader is told to act on. A mitigation in a field the reader is told to
 * ignore is not a mitigation.
 *
 * The second fix required "an object", which moved the hole rather than closing it: `{}` is an object,
 * has no findings, and two of them compare as agreement. A guard is only as deep as its requirement,
 * so the requirement is now what the name promises - an object that carries at least one report field.
 * A partial report still passes, because `findings` alone is one.
 */
const REPORT_FIELDS = ['schema', 'verdict', 'ran', 'ok', 'checks', 'findings', 'summary', 'hashes', 'currentVerdict', 'added', 'removed']

function requireReport(value: unknown, role: string): Record<string, unknown> {
  if (value === null || value === undefined) {
    throw new Error(role + ' is ' + String(value) + '. A diff needs both sides: with no input at all, every comparison finds nothing and the report reads as agreement between two things that were never compared.')
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(role + ' is a ' + typeof value + (Array.isArray(value) ? ' (an array)' : '') + ', not a report. A diff needs two report objects: two values that are not reports flatten to two empty finding lists, and the delta then reads as agreement between things that were never compared.')
  }
  const record = value as Record<string, unknown>
  if (!REPORT_FIELDS.some((field) => field in record)) {
    const keys = Object.keys(record)
    throw new Error(role + ' is an object with no report fields' + (keys.length === 0 ? ' at all' : ' (' + keys.slice(0, 6).join(', ') + ')') + ', not a report. Two such values flatten to two empty finding lists, and the delta then reads as agreement between things that were never compared.')
  }
  return record
}

/**
 * Why a report-shaped value still must not be compared, or `undefined` if it can be.
 *
 * Two shapes reach here legitimately and neither is a report about a model:
 *
 * - a REFUSAL (`ran: false`): the tool did not run, so there is nothing to compare against;
 * - a report about an INVALID INPUT (`summary.checksRun === 0`): the engine ran, refused the input, and
 *   examined nothing. Its finding list is not empty because the model is clean, and comparing it against
 *   a real report would call every finding in that report resolved.
 *
 * `checksRun` is read only when the report carries it, because the families that report flat findings
 * have no check roster and `compose` counts machines rather than checks.
 */
function incomparableReason(record: Record<string, unknown>, role: string): string | undefined {
  if (record.ran === false) {
    return role + ' is a refusal: the fields describe why the tool did not run, so there is no report to compare'
  }
  const summary = record.summary
  if (summary !== null && typeof summary === 'object' && (summary as Record<string, unknown>).checksRun === 0) {
    return role + ' examined nothing (its summary says checksRun 0), so its empty finding list is not evidence of anything'
  }
  return undefined
}

/** The family a report belongs to, when it says so. Two different schemas cannot be compared. */
function familyOf(record: Record<string, unknown>): string | undefined {
  return typeof record.schema === 'string' && record.schema !== '' ? record.schema : undefined
}

export function diffReports(baseline: unknown, current: unknown): BaselineReport {
  const beforeRecord = requireReport(baseline, 'baseline')
  const afterRecord = requireReport(current, 'current')
  for (const [record, role] of [[beforeRecord, 'baseline'], [afterRecord, 'current']] as const) {
    const reason = incomparableReason(record, role)
    if (reason !== undefined) throw new Error(reason + '. A diff needs two runs that produced reports.')
  }
  const beforeFamily = familyOf(beforeRecord)
  const afterFamily = familyOf(afterRecord)
  if (beforeFamily !== undefined && afterFamily !== undefined && beforeFamily !== afterFamily) {
    throw new Error('cannot compare a ' + beforeFamily + ' report with a ' + afterFamily + ' report: they do not share a finding vocabulary, so every finding on one side would read as resolved or added on the other. Compare two runs of the same tool.')
  }
  const before = flattenReportFindings(baseline)
  const after = flattenReportFindings(current)
  const beforeByIdentity = new Map<string, ReportFinding>()
  for (const finding of before) beforeByIdentity.set(findingIdentity(finding), finding)
  const seen = new Set<string>()
  const added: ReportFinding[] = []
  const changed: BaselineChange[] = []
  for (const finding of after) {
    const identity = findingIdentity(finding)
    seen.add(identity)
    const previous = beforeByIdentity.get(identity)
    if (previous === undefined) {
      added.push(finding)
      continue
    }
    if (previous.severity !== finding.severity || previous.message !== finding.message) {
      changed.push({
        identity,
        code: finding.code,
        before: { severity: previous.severity, message: previous.message },
        after: { severity: finding.severity, message: finding.message },
      })
    }
  }
  const removed = before.filter((finding) => !seen.has(findingIdentity(finding)))
  const addedErrors = added.filter((finding) => finding.severity === 'error')
  const addedWarnings = added.filter((finding) => finding.severity === 'warning')
  const delta = diffOf(added.length, removed.length, addedErrors.length, addedErrors[0]?.code)

  const nextSteps: string[] = []
  if (addedErrors.length > 0) {
    nextSteps.push('Fix or explicitly accept the ' + String(addedErrors.length) + ' new error finding(s) before calling this slice done: the baseline is what "not worse" is measured against.')
  } else if (added.length > 0) {
    nextSteps.push('The new warnings are not failures, but they are new: decide per finding whether the change introduced them or the baseline was incomplete.')
  } else {
    nextSteps.push('No new findings: re-record the baseline with this report if the slice is accepted, so the next comparison starts from it.')
  }
  if (changed.length > 0) nextSteps.push('Review the ' + String(changed.length) + ' changed finding(s): the same locator now reports something different, which usually means the fix moved the problem.')
  if (removed.length > 0) nextSteps.push(String(removed.length) + ' finding(s) from the baseline are gone — confirm they were fixed rather than renamed out of the report (a renamed check or a reworded message changes the identity).')
  if (verdictOfReport(current) === 'fail') nextSteps.push('The current report still fails on its own terms; the delta being clean does not make the run clean.')

  return {
    ok: true,
    ran: true,
    ...delta,
    schema: REPORT_SCHEMAS.baseline,
    currentVerdict: verdictOfReport(current),
    added,
    removed,
    changed,
    summary: {
      baseline: before.length,
      current: after.length,
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      addedErrors: addedErrors.length,
      addedWarnings: addedWarnings.length,
    },
    nextSteps,
  }
}

export type { VerdictSummary }
