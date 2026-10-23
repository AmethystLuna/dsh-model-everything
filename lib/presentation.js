import { routeFor } from './routing.js';
import { diagramLegend, drawStateDiagram } from './visualize.js';
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
    if (findings.length === 0) {
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
    if (card.diagram !== undefined && card.diagram.length > 0) {
        lines.push('');
        lines.push(...card.diagram);
    }
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
 * The card payload with the machine drawn, when the arguments carry one worth drawing.
 *
 * Drawn from the arguments, not the report: the model already knows its own machine, and putting it in the
 * result would spend tokens to tell it what it just wrote.
 */
export function cardWithDiagram(value, family, drawable) {
    const card = reportCard(value, family);
    if (drawable === undefined)
        return card;
    const diagram = drawStateDiagram(drawable);
    return diagram.length === 0 ? card : { ...card, diagram };
}
/** A LogicModelV1 shape as the drawing needs it: `event` labels the edge, `init` is the start. */
export function machineDrawable(model) {
    const m = record(model);
    if (m === undefined)
        return undefined;
    const states = array(m.states).map((entry) => record(entry)).filter((entry) => entry !== undefined && typeof entry.id === 'string');
    const transitions = array(m.transitions).map((entry) => record(entry)).filter((entry) => entry !== undefined && typeof entry.from === 'string' && typeof entry.to === 'string');
    if (states.length === 0 || transitions.length === 0)
        return undefined;
    return {
        states: states.map((state) => ({ id: String(state.id) })),
        transitions: transitions.map((transition) => ({ from: String(transition.from), to: String(transition.to), ...(typeof transition.event === 'string' ? { label: transition.event } : {}) })),
        ...(typeof m.init === 'string' ? { initial: m.init } : {}),
    };
}
/** An automaton shape as the drawing needs it: the symbol labels the edge, `init` is the start. */
export function automatonDrawable(automaton) {
    const a = record(automaton);
    if (a === undefined)
        return undefined;
    const states = array(a.states).filter((state) => typeof state === 'string');
    const transitions = array(a.transitions).map((entry) => record(entry)).filter((entry) => entry !== undefined && typeof entry.from === 'string' && typeof entry.to === 'string');
    if (states.length === 0 || transitions.length === 0)
        return undefined;
    return {
        states: states.map((id) => ({ id })),
        transitions: transitions.map((transition) => ({ from: String(transition.from), to: String(transition.to), ...(typeof transition.symbol === 'string' ? { label: transition.symbol } : {}) })),
        ...(typeof a.init === 'string' ? { initial: a.init } : {}),
    };
}
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
/** `presentResult` for `report_diff`: the delta leads, never the current report's own verdict. */
export function diffResultView(family) {
    return (_args, result) => {
        const card = record(result.meta);
        if (card === undefined || card === null)
            return undefined;
        return { card: 'generic', title: family + '  ' + (card.verdict ?? ''), content: diffCardBlocks(card) };
    };
}
