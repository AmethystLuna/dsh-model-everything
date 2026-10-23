import { routeFor } from './routing.js';
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
    // Two shapes live under one payload: the families with a top-level `findings` array, and the verify
    // family, whose findings sit inside `checks` and whose counts live in `summary`. Reading only the first
    // shape made a failing verification card say "0 error(s)" while its own verdict said fail.
    const violations = array(report.violations);
    const signals = array(report.signals);
    const facts = array(report.facts);
    if (findings.length === 0 && violations.length > 0) {
        // The design family keeps three levels apart on purpose: a violation decides the verdict, a signal is a
        // structural fact, and a fact is a measurement. Only the violations are findings here, or the card would
        // show a signal with an error mark.
        for (const entry of violations) {
            const finding = record(entry);
            if (finding !== undefined)
                findings.push({ ...finding, severity: 'error' });
        }
    }
    else if (findings.length === 0 && violations.length === 0 && array(report.violations).length === 0 && !Array.isArray(report.violations)) {
        for (const check of array(report.checks)) {
            for (const entry of array(record(check)?.findings)) {
                const finding = record(entry);
                if (finding !== undefined)
                    findings.push(finding);
            }
        }
    }
    const severity = (entry) => String(entry.severity ?? 'info');
    const errors = findings.filter((entry) => severity(entry) === 'error');
    const warnings = findings.filter((entry) => severity(entry) === 'warning');
    const summary = record(report.summary);
    const summaryErrors = typeof summary?.errors === 'number' ? summary.errors : undefined;
    const summaryWarnings = typeof summary?.warnings === 'number' ? summary.warnings : undefined;
    const checksRun = typeof summary?.checksRun === 'number'
        ? summary.checksRun
        : array(report.checks).length > 0
            ? array(report.checks).length
            : undefined;
    const first = errors[0] ?? warnings[0];
    const next = array(report.nextSteps).map((step) => String(step))[0];
    const deltaSummary = record(record(report.reportDelta)?.summary) ?? record(report.summary);
    const delta = deltaSummary === undefined
        ? undefined
        : {
            added: Number(deltaSummary.added ?? 0),
            removed: Number(deltaSummary.removed ?? 0),
            changed: Number(deltaSummary.changed ?? 0),
            addedErrors: Number(deltaSummary.addedErrors ?? 0),
        };
    const changes = array(report.changes)
        .map((entry) => record(entry))
        .filter((entry) => entry !== undefined)
        .map((entry) => ({ kind: String(entry.kind ?? '?'), what: String(entry.what ?? ''), ...(typeof entry.detail === 'string' && entry.detail !== '' ? { detail: entry.detail } : {}) }));
    const firstAddedRaw = (array(report.added).map((entry) => record(entry)).find((entry) => entry !== undefined && String(entry.severity ?? '') === 'error')
        ?? array(report.added).map((entry) => record(entry)).find((entry) => entry !== undefined));
    return {
        ...(typeof report.verdict === 'string' ? { verdict: report.verdict } : {}),
        ...(typeof report.verdictReason === 'string' ? { verdictReason: shorten(report.verdictReason) } : {}),
        errors: summaryErrors ?? errors.length,
        warnings: summaryWarnings ?? warnings.length,
        ...(checksRun === undefined ? {} : { checksRun }),
        first: first === undefined
            ? null
            : { code: String(first.code ?? 'UNKNOWN'), severity: severity(first), message: shorten(String(first.message ?? '')) },
        next: next === undefined ? null : shorten(next),
        family,
        ...(routeFor(family) === undefined
            ? {}
            : { route: { owns: routeFor(family)?.owns ?? '', instead: routeFor(family)?.notFor.tool ?? '' } }),
        ...(changes.length === 0 ? {} : { changes }),
        ...(delta === undefined ? {} : { delta }),
        ...(firstAddedRaw === undefined ? {} : { firstAdded: { code: String(firstAddedRaw.code ?? '?'), severity: String(firstAddedRaw.severity ?? 'info'), message: shorten(String(firstAddedRaw.message ?? '')) } }),
        ...(typeof report.currentVerdict === 'string' ? { currentVerdict: report.currentVerdict } : {}),
        ...(typeof summary?.nodes === 'number' && typeof summary?.edges === 'number'
            ? { graph: { nodes: summary.nodes, edges: summary.edges, cycles: Number(summary.cycles ?? 0), isolated: Number(summary.isolated ?? 0), dangling: Number(summary.dangling ?? 0) } }
            : {}),
        ...(violations.length === 0 && signals.length === 0 && facts.length === 0
            ? {}
            : { levels: { violations: violations.length, signals: signals.length, facts: facts.length, skipped: array(report.checksSkipped).length } }),
        ...(typeof summary?.absoluteClaims === 'number'
            ? { claims: { absolute: summary.absoluteClaims, keywords: Number(summary.keywords ?? 0), families: claimFamilies(findings) } }
            : {}),
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
    if (card.source !== undefined) {
        lines.push('');
        const shown = card.source.lines.length;
        lines.push(card.source.label + (card.source.total > shown ? ' (first ' + String(shown) + ' of ' + String(card.source.total) + ' lines)' : ''));
        lines.push(...card.source.lines);
    }
    return [{ type: 'text', text: lines.join('\n') }];
}
/**
 * `presentResult` for a report tool: render the card from the persisted payload, and fall back to the
 * raw content by returning undefined when there is none.
 */
/** The last path segment, for a title. No `node:path` here: this runs on replay too. */
function lastSegment(path) {
    const parts = path.split(/[\\/]/).filter((part) => part !== '' && part !== '.');
    return parts[parts.length - 1] ?? path;
}
/**
 * The pending card for a report tool: a title naming the artifact, and the file to follow.
 *
 * From the arguments only, because a UI calls this during streaming and again on replay; the file has not
 * been opened at that point and must not be.
 */
/**
 * The card payload with the artifact previewed.
 *
 * A translation and a rendering both produce text a reader wants to see the shape of, and neither should
 * paste the whole file into a card: the preview is bounded, and it says how much it left out. The report
 * keeps the artifact in full for whoever needs it.
 */
export function cardWithSource(value, family, text, label, limit = 14) {
    const card = reportCard(value, family);
    if (text === undefined || text.trim() === '')
        return card;
    const all = text.split(String.fromCharCode(10));
    const lines = all.slice(0, limit);
    return { ...card, source: { label, lines, total: all.length } };
}
export function reportCallView(family) {
    return (args) => {
        const a = record(args) ?? {};
        const path = ['modelPath', 'repoPath', 'path']
            .map((key) => a[key])
            .find((value) => typeof value === 'string' && value !== '');
        const kind = family === 'model_edit' ? 'edit' : family.startsWith('uml_') ? 'search' : 'other';
        const title = path === undefined ? family : family + '  ' + lastSegment(path);
        return { card: 'generic', title, kind, ...(path === undefined ? {} : { locations: [{ path }] }) };
    };
}
/**
 * The card for `model_edit`: what changed, and what the change did to the findings.
 *
 * Both lists are already in the report, so this is a rendering of the same value rather than a second
 * computation - the rule every card here follows.
 */
export function editCardBlocks(card) {
    const changes = card.changes ?? [];
    const lines = [];
    const head = card.verdict === undefined ? card.family : card.verdict.toUpperCase();
    lines.push(head + (changes.length === 0 ? '  —  no change was applied' : '  —  ' + String(changes.length) + ' change(s)'));
    for (const change of changes.slice(0, 6)) {
        lines.push('· ' + change.kind + ' ' + change.what + (change.detail === undefined ? '' : ' (' + change.detail + ')'));
    }
    if (changes.length > 6)
        lines.push('· … ' + String(changes.length - 6) + ' more in the report');
    if (card.delta !== undefined) {
        lines.push('findings: added ' + String(card.delta.added) + ' (' + String(card.delta.addedErrors) + ' error) · removed ' + String(card.delta.removed) + ' · changed ' + String(card.delta.changed));
    }
    if (card.next !== null)
        lines.push('next: ' + card.next);
    return [{ type: 'text', text: lines.join('\n') }];
}
/**
 * The card for `report_diff`: does this change add anything, read as counts and the first added error.
 *
 * A diff's `verdict` is about the delta, so the card leads with the delta and never with the current
 * report's own verdict - the two differ exactly when a clean change lands on an already-failing report.
 */
export function diffCardBlocks(card) {
    const delta = card.delta;
    const lines = [];
    const head = card.verdict === undefined ? card.family : card.verdict.toUpperCase();
    lines.push(head + '  —  added ' + String(delta?.added ?? 0) + ' (' + String(delta?.addedErrors ?? 0) + ' error) · removed ' + String(delta?.removed ?? 0) + ' · changed ' + String(delta?.changed ?? 0));
    if (card.currentVerdict !== undefined)
        lines.push('the current report on its own: ' + card.currentVerdict);
    if (card.firstAdded !== undefined)
        lines.push('✗ ' + card.firstAdded.code + ': ' + card.firstAdded.message);
    if ((delta?.added ?? 0) === 0)
        lines.push('nothing was added: this change is accepted by the "no new findings" rule');
    if (card.next !== null)
        lines.push('next: ' + card.next);
    return [{ type: 'text', text: lines.join('\n') }];
}
/** `presentResult` for `model_edit`, falling back to the generic card when the payload has no changes. */
export function editResultView(family) {
    return (_args, result) => {
        const card = record(result.meta);
        if (card === undefined || card === null)
            return undefined;
        const changeCount = card.changes === undefined ? '' : '  ·  ' + String(card.changes.length) + ' change(s)';
        return { card: 'generic', title: family + '  ' + (card.verdict ?? '') + changeCount, content: editCardBlocks(card) };
    };
}
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
/** How many findings per family, for the scan card: the reader wants the shape, not the list. */
function claimFamilies(findings) {
    const counts = new Map();
    for (const finding of findings) {
        const family = typeof finding.family === 'string' ? finding.family : 'other';
        counts.set(family, (counts.get(family) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([family, count]) => ({ family, count }));
}
/** The card for `uml_structure_verify`: the graph's shape first, then the first finding. */
export function structureCardBlocks(card) {
    const lines = [];
    const head = card.verdict === undefined ? card.family : card.verdict.toUpperCase();
    lines.push(head + '  —  ' + String(card.errors) + ' error(s) · ' + String(card.warnings) + ' warning(s)');
    if (card.graph !== undefined) {
        lines.push('graph: ' + String(card.graph.nodes) + ' nodes · ' + String(card.graph.edges) + ' edges · ' + String(card.graph.cycles) + ' cycle(s) · ' + String(card.graph.isolated) + ' isolated');
    }
    if (card.first !== null)
        lines.push((card.first.severity === 'error' ? '✗ ' : '⚠ ') + card.first.code + ': ' + card.first.message);
    if (card.next !== null)
        lines.push('next: ' + card.next);
    return [{ type: 'text', text: lines.join(String.fromCharCode(10)) }];
}
/** The card for `model_design_review`: violations, then signals, then facts - never one number. */
export function designCardBlocks(card) {
    const lines = [];
    const head = card.verdict === undefined ? card.family : card.verdict.toUpperCase();
    lines.push(head + '  —  ' + String(card.errors) + ' violation(s) · ' + String(card.warnings) + ' signal(s)');
    if (card.levels !== undefined) {
        lines.push('levels: ' + String(card.levels.violations) + ' violation · ' + String(card.levels.signals) + ' signal · ' + String(card.levels.facts) + ' fact · ' + String(card.levels.skipped) + ' check(s) skipped');
    }
    if (card.first !== null)
        lines.push('✗ ' + card.first.code + ': ' + card.first.message);
    if (card.levels !== undefined && card.levels.skipped > 0)
        lines.push('a skipped check examined nothing: silence there is not a pass');
    if (card.next !== null)
        lines.push('next: ' + card.next);
    return [{ type: 'text', text: lines.join(String.fromCharCode(10)) }];
}
/** The card for `model_interleaving_scan`: claims by family, and the reminder that nothing was proven. */
export function scanCardBlocks(card) {
    const lines = [];
    const head = card.verdict === undefined ? card.family : card.verdict.toUpperCase();
    lines.push(head + '  —  ' + String(card.errors) + ' absolute claim(s) · ' + String(card.warnings) + ' risk(s)');
    if (card.claims !== undefined) {
        const families = card.claims.families.map((entry) => entry.family + ' ' + String(entry.count)).join(' · ');
        lines.push('claims: ' + String(card.claims.absolute) + ' absolute, ' + String(card.claims.keywords) + ' keyword(s) hit' + (families === '' ? '' : ' · ' + families));
    }
    if (card.first !== null)
        lines.push('✗ ' + card.first.code + ': ' + card.first.message);
    lines.push('this plugin routed the claims; it proved none of them');
    return [{ type: 'text', text: lines.join(String.fromCharCode(10)) }];
}
/** One `presentResult` per card body, since the shapes differ but the fallback does not. */
export function familyResultView(family, body) {
    return (_args, result) => {
        const card = record(result.meta);
        if (card === undefined || card === null)
            return undefined;
        return { card: 'generic', title: family + '  ' + (card.verdict ?? ''), content: body(card) };
    };
}
export const structureResultView = familyResultView('uml_structure_verify', structureCardBlocks);
export const designResultView = familyResultView('model_design_review', designCardBlocks);
export const scanResultView = familyResultView('model_interleaving_scan', scanCardBlocks);
/** `presentResult` for `report_diff`: the delta leads, never the current report's own verdict. */
export function diffResultView(family) {
    return (_args, result) => {
        const card = record(result.meta);
        if (card === undefined || card === null)
            return undefined;
        return { card: 'generic', title: family + '  ' + (card.verdict ?? ''), content: diffCardBlocks(card) };
    };
}
