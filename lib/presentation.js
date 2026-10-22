const SHORT = 160;
function shorten(text, limit = SHORT) {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length <= limit ? flat : flat.slice(0, limit - 1).trimEnd() + '…';
}
function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}
function array(value) {
    return Array.isArray(value) ? value : [];
}
/**
 * Project a report into the card payload.
 *
 * Read defensively: this runs on replay too, and a payload that once had a shape may come back with a
 * field missing. A card that throws would take the whole session view with it.
 */
export function reportCard(value, family) {
    const report = record(value) ?? {};
    const findings = array(report.findings)
        .map((entry) => record(entry))
        .filter((entry) => entry !== undefined);
    const severity = (entry) => String(entry.severity ?? 'info');
    const errors = findings.filter((entry) => severity(entry) === 'error');
    const warnings = findings.filter((entry) => severity(entry) === 'warning');
    const summary = record(report.summary);
    const checksRun = typeof summary?.checksRun === 'number'
        ? summary.checksRun
        : array(report.checks).length > 0
            ? array(report.checks).length
            : undefined;
    const first = errors[0] ?? warnings[0];
    const next = array(report.nextSteps).map((step) => String(step))[0];
    return {
        ...(typeof report.verdict === 'string' ? { verdict: report.verdict } : {}),
        ...(typeof report.verdictReason === 'string' ? { verdictReason: shorten(report.verdictReason) } : {}),
        errors: errors.length,
        warnings: warnings.length,
        ...(checksRun === undefined ? {} : { checksRun }),
        first: first === undefined
            ? null
            : { code: String(first.code ?? 'UNKNOWN'), severity: severity(first), message: shorten(String(first.message ?? '')) },
        next: next === undefined ? null : shorten(next),
        family,
    };
}
/** The card body: four lines, in the order a reader asks the questions. */
export function cardBlocks(card) {
    const lines = [];
    const head = card.verdict === undefined ? card.family : card.verdict.toUpperCase();
    const counts = card.checksRun === undefined
        ? `${String(card.errors)} error(s), ${String(card.warnings)} warning(s)`
        : `${String(card.checksRun)} checks · ${String(card.errors)} error(s) · ${String(card.warnings)} warning(s)`;
    lines.push(head + '  —  ' + counts);
    if (card.verdictReason !== undefined)
        lines.push(card.verdictReason);
    if (card.first !== null) {
        lines.push((card.first.severity === 'error' ? '✗ ' : '⚠ ') + card.first.code + ': ' + card.first.message);
    }
    if (card.next !== null)
        lines.push('next: ' + card.next);
    return [{ type: 'text', text: lines.join('\n') }];
}
/**
 * `presentResult` for a report tool: render the card from the persisted payload, and fall back to the
 * raw content by returning undefined when there is none.
 */
export function reportResultView(family) {
    return (_args, result) => {
        const card = record(result.meta);
        if (card === undefined || card === null)
            return undefined;
        if (card.verdict === undefined && card.next === null && card.first === null)
            return undefined;
        return { card: 'generic', title: family + '  ' + (card.verdict ?? ''), content: cardBlocks(card) };
    };
}
