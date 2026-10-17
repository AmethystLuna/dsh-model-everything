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
import { canonicalJson, REPORT_SCHEMAS, verdictOf } from './engine.js';
/**
 * The stable identity of a finding: check + file + code + a canonical locator. Prose is
 * excluded so a reworded message reads as `changed`, not as a new finding.
 */
export function findingIdentity(finding) {
    const locator = canonicalJson({
        ...(finding.evidence === undefined ? {} : { evidence: finding.evidence }),
        ...(finding.path === undefined ? {} : { path: finding.path }),
    });
    const where = locator === '{}' ? 'message:' + finding.message : locator;
    const file = finding.file === undefined ? '' : finding.file + '|';
    return (finding.check === undefined ? '' : finding.check + '|') + file + finding.code + '|' + where;
}
/** Flatten a report of any family into one finding list (`checks[].findings` or `findings[]`). */
export function flattenReportFindings(report) {
    if (report === null || typeof report !== 'object')
        return [];
    const record = report;
    const flat = [];
    if (Array.isArray(record.checks)) {
        for (const check of record.checks) {
            const id = typeof check.id === 'string' ? check.id : undefined;
            for (const finding of (Array.isArray(check.findings) ? check.findings : [])) {
                flat.push(id === undefined ? finding : { ...finding, check: id });
            }
        }
    }
    if (Array.isArray(record.findings)) {
        for (const finding of record.findings)
            flat.push(finding);
    }
    return flat;
}
/** The report's own verdict, whatever family it came from. */
function verdictOfReport(report) {
    if (report === null || typeof report !== 'object')
        return 'fail';
    const value = report.verdict;
    return value === 'pass' || value === 'pass_with_findings' || value === 'fail' ? value : 'fail';
}
/**
 * The delta's verdict, from the four ways a comparison can get worse or better.
 *
 * `escalated` is the one that used to be missing: a finding that keeps its identity and moves from warning to
 * error lives in `changed`, not in `added`, so folding severities into `addedErrors` only left the comparison
 * answering `pass` over a change that made the report strictly worse. A de-escalation is not a regression: it is
 * still a change, so it is named, and the verdict stays `pass`.
 */
function diffOf(added, removed, addedErrors, escalated, deescalated, firstCode) {
    const errors = addedErrors + escalated;
    if (errors > 0) {
        const bits = [];
        if (added > 0)
            bits.push(String(added) + ' new finding(s)');
        if (escalated > 0)
            bits.push(String(escalated) + ' finding(s) escalated to error');
        return {
            verdict: 'fail',
            // The count of errors is the sum: a reader must not have to add "new" and "escalated" in their head.
            verdictReason: bits.join(', ') + ' (' + String(errors) + ' error)' + (firstCode === undefined ? '' : ' (first error: ' + firstCode + ')'),
        };
    }
    if (added > 0) {
        return {
            verdict: 'pass_with_findings',
            verdictReason: String(added) + ' new warning finding(s), no new errors' + (deescalated > 0 ? '; ' + String(deescalated) + ' finding(s) moved to a lower severity' : ''),
        };
    }
    if (removed > 0) {
        return { verdict: 'pass', verdictReason: 'no new findings; ' + String(removed) + ' finding(s) resolved' };
    }
    if (deescalated > 0) {
        return { verdict: 'pass', verdictReason: 'no new findings; ' + String(deescalated) + ' finding(s) moved to a lower severity' };
    }
    return { verdict: 'pass', verdictReason: 'no new findings, nothing resolved' };
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
const REPORT_FIELDS = ['schema', 'verdict', 'ran', 'ok', 'checks', 'findings', 'summary', 'hashes', 'currentVerdict', 'added', 'removed'];
function requireReport(value, role) {
    if (value === null || value === undefined) {
        throw new Error(role + ' is ' + String(value) + '. A diff needs both sides: with no input at all, every comparison finds nothing and the report reads as agreement between two things that were never compared.');
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(role + ' is a ' + typeof value + (Array.isArray(value) ? ' (an array)' : '') + ', not a report. A diff needs two report objects: two values that are not reports flatten to two empty finding lists, and the delta then reads as agreement between things that were never compared.');
    }
    const record = value;
    if (!REPORT_FIELDS.some((field) => field in record)) {
        const keys = Object.keys(record);
        throw new Error(role + ' is an object with no report fields' + (keys.length === 0 ? ' at all' : ' (' + keys.slice(0, 6).join(', ') + ')') + ', not a report. Two such values flatten to two empty finding lists, and the delta then reads as agreement between things that were never compared.');
    }
    return record;
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
function incomparableReason(record, role) {
    if (record.ran === false) {
        return role + ' is a refusal: the fields describe why the tool did not run, so there is no report to compare';
    }
    const summary = record.summary;
    if (summary !== null && typeof summary === 'object' && summary.checksRun === 0) {
        return role + ' examined nothing (its summary says checksRun 0), so its empty finding list is not evidence of anything';
    }
    return undefined;
}
/** The family a report belongs to, when it says so. Two different schemas cannot be compared. */
function familyOf(record) {
    return typeof record.schema === 'string' && record.schema !== '' ? record.schema : undefined;
}
export function diffReports(baseline, current) {
    const beforeRecord = requireReport(baseline, 'baseline');
    const afterRecord = requireReport(current, 'current');
    for (const [record, role] of [[beforeRecord, 'baseline'], [afterRecord, 'current']]) {
        const reason = incomparableReason(record, role);
        if (reason !== undefined)
            throw new Error(reason + '. A diff needs two runs that produced reports.');
    }
    const beforeFamily = familyOf(beforeRecord);
    const afterFamily = familyOf(afterRecord);
    if (beforeFamily !== undefined && afterFamily !== undefined && beforeFamily !== afterFamily) {
        throw new Error('cannot compare a ' + beforeFamily + ' report with a ' + afterFamily + ' report: they do not share a finding vocabulary, so every finding on one side would read as resolved or added on the other. Compare two runs of the same tool.');
    }
    const before = flattenReportFindings(baseline);
    const after = flattenReportFindings(current);
    const beforeByIdentity = new Map();
    for (const finding of before)
        beforeByIdentity.set(findingIdentity(finding), finding);
    const seen = new Set();
    const added = [];
    const changed = [];
    for (const finding of after) {
        const identity = findingIdentity(finding);
        seen.add(identity);
        const previous = beforeByIdentity.get(identity);
        if (previous === undefined) {
            added.push(finding);
            continue;
        }
        if (previous.severity !== finding.severity || previous.message !== finding.message) {
            changed.push({
                identity,
                code: finding.code,
                before: { severity: previous.severity, message: previous.message },
                after: { severity: finding.severity, message: finding.message },
            });
        }
    }
    const removed = before.filter((finding) => !seen.has(findingIdentity(finding)));
    const addedErrors = added.filter((finding) => finding.severity === 'error');
    const addedWarnings = added.filter((finding) => finding.severity === 'warning');
    // Severity movement lives in `changed`. Counted here, because the verdict is about whether the slice got worse,
    // and a warning that became an error did - even though nothing was added.
    const escalated = changed.filter((change) => change.before.severity !== 'error' && change.after.severity === 'error');
    const deescalated = changed.filter((change) => change.before.severity === 'error' && change.after.severity !== 'error');
    const delta = diffOf(added.length, removed.length, addedErrors.length, escalated.length, deescalated.length, addedErrors[0]?.code ?? escalated[0]?.code);
    const nextSteps = [];
    if (addedErrors.length > 0) {
        nextSteps.push('Fix or explicitly accept the ' + String(addedErrors.length) + ' new error finding(s) before calling this slice done: the baseline is what "not worse" is measured against.');
    }
    else if (escalated.length > 0) {
        nextSteps.push('A finding moved from warning to error (' + String(escalated.length) + '): the slice added nothing but still made the report worse, so the baseline is less strict than the run.');
    }
    else if (added.length > 0) {
        nextSteps.push('The new warnings are not failures, but they are new: decide per finding whether the change introduced them or the baseline was incomplete.');
    }
    else {
        nextSteps.push('No new findings: re-record the baseline with this report if the slice is accepted, so the next comparison starts from it.');
    }
    if (changed.length > 0)
        nextSteps.push('Review the ' + String(changed.length) + ' changed finding(s): the same locator now reports something different, which usually means the fix moved the problem.');
    if (removed.length > 0)
        nextSteps.push(String(removed.length) + ' finding(s) from the baseline are gone — confirm they were fixed rather than renamed out of the report (a renamed check or a reworded message changes the identity).');
    if (verdictOfReport(current) === 'fail')
        nextSteps.push('The current report still fails on its own terms; the delta being clean does not make the run clean.');
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
    };
}
