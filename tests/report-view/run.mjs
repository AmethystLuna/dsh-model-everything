// The report body: what the model reads must carry every actionable fact and nothing else.
//
// The measured case this pins: a 37,167-character verification report was 33.1% indentation,
// 21.7% repeated key names and 12.7% punctuation, and its 105 findings stated 47 facts —
// the same (state, event) fact reported by both S5 and A1, twenty race findings saying the
// same thing with different variable snapshots. Silencing a passing check, grouping the
// repeated facts and dropping warning evidence is work the harness can do once instead of
// the model doing it on every call.
import { runVerification } from '../../lib/engine.js'
import { diffReports } from '../../lib/baseline.js'
import { exportModel } from '../../lib/exporters.js'
import { renderReportText, factKey, toViewFinding } from '../../lib/report-view.js'

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
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

/** A model that leaves (state, event) pairs undefined, so S5 and A1 both report them. */
function sparseModel() {
  return {
    schemaVersion: 1,
    init: 'IDLE',
    states: [{ id: 'IDLE' }, { id: 'DECIDE' }, { id: 'VERIFYING' }],
    transitions: [
      { from: 'IDLE', event: 'candidate', to: 'VERIFYING' },
      { from: 'VERIFYING', event: 'verify_pass', to: 'DECIDE' },
    ],
  }
}

const report = runVerification(sparseModel())
const body = renderReportText(report)

test('the report object is not mutated by rendering', () => {
  const before = JSON.stringify(report)
  renderReportText(report)
  assert(JSON.stringify(report) === before, 'rendering changed the report object')
})

test('the reported object keeps every machine-readable field the diff contract needs', () => {
  assert(typeof report.modelHash === 'string' && report.modelHash.length === 64, 'modelHash must survive')
  assert(report.verdict === 'fail', 'this fixture is a failing review')
  for (const check of report.checks) {
    assert(typeof check.id === 'string' && typeof check.status === 'string', 'check identity must survive')
  }
})

test('ok=true with a failing verdict still reads as a failing review', () => {
  assert(report.ok === true && report.verdict === 'fail', 'fixture precondition')
  assert(/verdict=fail/.test(body), 'the header must carry the verdict, not just ok')
  assert(/ok=true/.test(body), 'the header must also show ok, which only means the engine ran')
})

test('passing checks are silenced but still inventoried', () => {
  const passed = report.checks.filter((check) => check.status === 'pass').map((check) => check.id)
  const failed = report.checks.filter((check) => check.status === 'fail').map((check) => check.id)
  assert(passed.length > 0 && failed.length > 0, 'fixture precondition: both outcomes present')
  const inventory = body.split('\n').find((line) => line.startsWith('CHECKS'))
  for (const check of report.checks) assert(inventory.includes(check.id), `check ${check.id} missing from the inventory line`)
  for (const check of report.checks) {
    if (check.status === 'pass') {
      assert(!new RegExp(`^PASS ${check.id} `, 'm').test(body), `passing check ${check.id} must not expand a body`)
      continue
    }
    if (check.status !== 'fail') continue // a skipped check has nothing to expand
    // The heading follows the severity, so a warning-only check says WARN while its status stays `fail`.
    const label = check.findings.some((finding) => finding.severity === 'error') ? 'FAIL' : 'WARN'
    assert(new RegExp(`^${label} ${check.id} `, 'm').test(body), `check ${check.id} with findings must expand a body headed ${label}`)
  }
})

test('the same (state, event) fact is reported once, not once per check', () => {
  const s5 = report.checks.find((check) => check.id === 'S5')
  const a1 = report.checks.find((check) => check.id === 'A1')
  if (s5 === undefined || a1 === undefined || s5.findings.length === 0) return // nothing to dedupe here
  const keys = (check) => new Set(check.findings.map((finding) => factKey(toViewFinding(finding))))
  const overlap = [...keys(s5)].filter((key) => keys(a1).has(key))
  if (overlap.length === 0) return
  const repeated = a1.findings.filter((finding) => finding.severity !== 'error').length
  assert(
    body.includes(`${repeated} finding(s) here repeat facts already reported above`),
    'the later check must say it adds nothing instead of reprinting the facts',
  )
  const idles = body.split('\n').filter((line) => /^  IDLE \(\d+\) \[/.test(line))
  assert(idles.length <= 1, `the grouped IDLE line must appear once per check at most, saw ${idles.length}`)
})

test('identical finding lines collapse with a multiplier', () => {
  const many = {
    schema: 'model-everything/verify/v1',
    ok: true,
    verdict: 'fail',
    verdictReason: '20 warning finding(s)',
    findings: Array.from({ length: 10 }, () => ({
      code: 'A2_ORDER_DEPENDENT',
      severity: 'warning',
      message: 'Events candidate and source_failed produce order-dependent outcomes from state COLLECT',
    })),
  }
  const rendered = renderReportText(many)
  // Finding lines start with the bracketed severity/code; the FINDINGS inventory line also
  // names the code, so match the body shape, not the code.
  const lines = rendered.split('\n').filter((line) => /^\s+\[[a-z]+\/A2_ORDER_DEPENDENT\]/.test(line))
  assert(lines.length === 1, `ten identical findings must render as one line, got ${lines.length}`)
  assert(lines[0].includes('(x10)'), `the collapsed line must carry the count: ${lines[0]}`)
})

test('warning evidence is not inlined, error evidence is', () => {
  const mixed = {
    schema: 'model-everything/verify/v1',
    verdict: 'fail',
    checks: [
      {
        id: 'S6',
        name: 'Guard Completeness',
        status: 'fail',
        detail: '1 error',
        findings: [
          { code: 'S6_INCOMPLETE_GUARD', severity: 'error', message: 'guard missing', evidence: { assignment: { remaining: 0 } } },
          { code: 'A5_OUT_OF_DOMAIN', severity: 'warning', message: 'boundary value below min', evidence: { variable: 'remaining', value: -1 } },
        ],
      },
    ],
  }
  const rendered = renderReportText(mixed)
  assert(rendered.includes('evidence={"assignment":{"remaining":0}}'), 'an error finding keeps its evidence inline')
  assert(!rendered.includes('"value":-1'), 'a warning finding must not pay for its evidence')
})

test('a rendered diagram is printed verbatim exactly once', () => {
  const diagram = 'stateDiagram-v2\n  [*] --> IDLE\n  IDLE --> DECIDE: go\n'
  const rendered = renderReportText({
    schema: 'model-everything/uml/render/v1',
    ok: true,
    verdict: 'pass',
    verdictReason: 'no findings',
    action: 'render',
    notation: 'mermaid',
    kind: 'state',
    diagram,
    warnings: [],
  })
  assert(rendered.split(diagram.trimEnd()).length === 2, 'the diagram body must appear once')
  assert(!rendered.includes('\\n'), 'the diagram must not be re-escaped as a JSON string')
})

test('an exported payload is printed verbatim, without JSON escaping', () => {
  const exported = exportModel(sparseModel(), 'uppaal')
  const rendered = renderReportText(exported)
  assert(typeof exported.primary === 'string' && exported.primary.length > 0, 'fixture precondition')
  assert(rendered.includes(exported.primary.trimEnd()), 'the generated file must appear verbatim')
  assert(!rendered.includes('\\n'), 'the generated file must not be re-escaped')
})

test('a baseline delta renders its three sections and the current verdict', () => {
  const before = runVerification(sparseModel())
  const after = runVerification({
    ...sparseModel(),
    transitions: [
      ...sparseModel().transitions,
      { from: 'IDLE', event: 'verify_pass', to: 'DECIDE' },
      { from: 'DECIDE', event: 'candidate', to: 'IDLE' },
      { from: 'DECIDE', event: 'verify_pass', to: 'IDLE' },
      { from: 'VERIFYING', event: 'candidate', to: 'IDLE' },
    ],
  })
  const delta = diffReports(before, after)
  const rendered = renderReportText(delta)
  assert(/^model-everything\/baseline\/v1/m.test(rendered), 'the delta header must name its schema')
  assert(/CURRENT\s+verdict=/.test(rendered), 'the current verdict must stay readable')
  for (const key of ['added', 'removed', 'changed']) {
    const count = Array.isArray(delta[key]) ? delta[key].length : 0
    if (count > 0) assert(rendered.includes(`${key.toUpperCase()} (${count})`), `the ${key} section must be present`)
  }
})

test('an unrecognized shape still states its failure reason', () => {
  const rendered = renderReportText({
    ok: false,
    ran: false,
    verdict: 'fail',
    verdictReason: 'the tool did not run: model invalid',
    schema: 'model-everything/verify/v1',
    errorCode: 'MODEL_INVALID',
    error: 'model: must be an object',
  })
  assert(rendered.includes('ERROR  model: must be an object [MODEL_INVALID]'), 'the refusal reason must be first-class')
  assert(rendered.includes('verdict=fail'), 'the verdict must survive the refusal path')
})

test('full is the escape hatch for a caller that needs the object itself', () => {
  const full = renderReportText(report, { full: true })
  // The contract is that the object survives, not that it keeps its whitespace: `full` is handed to
  // report_diff, which parses it. Pretty-printing a 37k report spent a third of its bytes on
  // indentation, so the escape hatch is compact.
  assert(JSON.stringify(JSON.parse(full)) === JSON.stringify(report), 'full must carry the structured report without loss')
  assert(full.length < JSON.stringify(report, null, 2).length, 'compact is smaller than pretty, which is the point')
  assert(full.length > renderReportText(report).length, 'full is still the expensive path, by construction')
})

test('asking for one check prints its lines past the digest budget', () => {
  // 30 warning findings on one check: the digest keeps `maxFindingsPerCheck` (24) and says the rest
  // are available by id — a sentence that named something the tools could not do until `check`.
  const findings = Array.from({ length: 30 }, (_, i) => ({ severity: 'warning', code: 'A9_RACE', message: 'race on x' + String(i) }))
  const withFindings = {
    ok: true,
    ran: true,
    verdict: 'pass_with_findings',
    verdictReason: '30 warning finding(s)',
    schema: 'model-everything/verify/v1',
    summary: { checksRun: 1 },
    checks: [{ id: 'A9', name: 'Race', status: 'fail', detail: 'races', findings }],
  }
  const digest = renderReportText(withFindings)
  assert(digest.includes('ask for this check by id'), 'the digest must offer the narrower view')
  const one = renderReportText(withFindings, { check: 'A9' })
  assert(!one.includes('ask for this check by id'), 'the narrowed view must not still be truncated')
  assert(one.split('race on x').length - 1 >= 30, 'every finding of that check must print')
  assert(one.includes('CHECKS'), 'the inventory still heads the report, so the reader keeps the map')
})

test('an unknown check id is answered with the ids the report carries', () => {
  const one = renderReportText(report, { check: 'ZZ9' })
  assert(one.includes('no check `ZZ9`'), 'the miss must be named rather than silently printing everything')
  const ids = (report.checks ?? []).map((check) => check.id)
  assert(ids.some((id) => one.includes(id)), 'the available ids must be listed')
})

test('rendering is deterministic', () => {
  assert(renderReportText(report) === renderReportText(report), 'two renders of one report must be identical')
})

test('a warning-only check is grouped and headed as warn, not as fail', () => {
  // `status` is `fail` for any check with a finding, which is right for a machine and misleading for a
  // reader: a report can say "no error findings" on its first line and then label the same checks FAIL. The
  // body has to agree with the inventory, or the misreading simply moves down a line.
  const reportWithWarnings = {
    schema: 'model-everything/verify/v1',
    verdict: 'pass_with_findings',
    ok: true,
    ran: true,
    summary: { errors: 0, warnings: 1, checksRun: 2 },
    checks: [
      { id: 'S1', name: 'Reachability', status: 'pass', detail: 'All states reachable', findings: [] },
      { id: 'S5', name: 'Event Completeness', status: 'fail', detail: '1 unhandled pair (1 warnings)', findings: [
        { code: 'S5_UNHANDLED_EVENT', severity: 'warning', message: 'A does not handle stop' },
      ] },
      { id: 'A12', name: 'Budget', status: 'fail', detail: 'Budget exceeded (1 errors)', findings: [
        { code: 'A12_BUDGET_OVER', severity: 'error', message: 'worst-case path cost 115 is over budget 100' },
      ] },
      { id: 'A14', name: 'Deadline', status: 'skip', detail: 'skipped: no state declares maxTicks', findings: [] },
    ],
    nextSteps: ['nothing to do'],
  }
  const text = renderReportText(reportWithWarnings)
  const inventory = text.split('\n').find((line) => line.startsWith('CHECKS'))
  assert(inventory.includes('warn S5'), `the inventory groups the warning-only check under warn — got ${inventory}`)
  assert(inventory.includes('fail A12'), `and the error-carrying check under fail — got ${inventory}`)
  assert(inventory.includes('skip A14'), `and the skipped check under skip — got ${inventory}`)
  // The section headers must say the same thing as the inventory.
  assert(text.includes('WARN S5 Event Completeness'), 'the body heading for a warning-only check says WARN')
  assert(!text.includes('FAIL S5'), 'and never FAIL')
  assert(text.includes('FAIL A12 Budget'), 'an error-carrying check still says FAIL')
  // A skipped check is named in the inventory and expands nothing: there is no finding to show, which is
  // exactly what skipping means. Its heading would be a paragraph about nothing.
  assert(!/^SKIP A14 /m.test(text), 'a skipped check must not expand a body')
})

test('the body costs a fraction of the pretty JSON it replaces', () => {
  const pretty = JSON.stringify(report, null, 2)
  assert(body.length < pretty.length, `body ${body.length} must beat pretty ${pretty.length}`)
  assert(body.length < pretty.length * 0.8, `body ${body.length} should be well under pretty ${pretty.length}`)
})

// ---------------------------------------------------------------------------
// The fields the body used to drop, and why each one matters
// ---------------------------------------------------------------------------

test('a truncated report says so, and a complete one stays quiet', () => {
  // `summary.truncated` is the flag that says a search stopped at its budget. The object carried it and the
  // body never printed it, so the one reader who only sees the body - the model - read an unfinished search as
  // a complete one. The model here is the cheapest way to produce the flag: a climb with no guard or set.
  const climbing = {
    schemaVersion: 1, init: 'A',
    states: [{ id: 'A' }],
    transitions: [{ from: 'A', event: 'tick', to: 'A', updates: [{ variable: 'n', op: 'inc' }] }],
    variables: [{ name: 'n', kind: 'integer', init: 0 }],
  }
  const capped = runVerification(climbing, { maxStates: 5 })
  assert(capped.summary.truncated === true, 'the fixture must actually be truncated')
  const cappedText = renderReportText(capped)
  assert(/^LIMIT /m.test(cappedText), 'a truncated body must carry a LIMIT line:\n' + cappedText.split('\n').slice(0, 4).join('\n'))
  assert(/undecided/i.test(cappedText.split('\n').find((line) => line.startsWith('LIMIT '))), 'and say what truncated means for the reader')
  // The near miss: a report that decided everything must not carry the line, or it becomes noise every reader
  // learns to skip - which is the same as not having it.
  assert(report.summary.truncated === undefined || report.summary.truncated === false, 'fixture precondition')
  assert(!/^LIMIT /m.test(body), 'a complete report must not claim its searches stopped')
})

test('a replaced or clamped bound is stated in the body', () => {
  // `summary.boundNotes` explains that the budget the caller asked for is not the one that ran. It reached the
  // object and never the body, so the numbers in the header read as the ones that were requested.
  const replaced = { ...report, summary: { ...report.summary, boundNotes: ['maxStates was replaced with the default 10000: NaN cannot bound a search'] } }
  const text = renderReportText(replaced)
  assert(/^BOUND /m.test(text), 'the note about the bound must reach the body')
  assert(/NaN cannot bound a search/.test(text), 'and carry its own words, not a summary of them')
  assert(!/^BOUND /m.test(body), 'a report whose bound was taken as given says nothing about it')
})

test('hashSpec is named where the hash is, so two hashes can be compared', () => {
  // A hash with no spec is a hex string: it cannot be reproduced or compared across report versions. The field
  // is on the object; the header printed the digest and dropped the scheme that produced it.
  assert(report.hashSpec === 'v1', 'fixture precondition')
  assert(/modelHash=[0-9a-f]+…\s+hashSpec=v1/.test(body), 'the header must name the hash scheme beside the hash:\n' + body.split('\n')[0])
})

test('echoed metadata keys are named, so the ignored fields are auditable', () => {
  // `_`-prefixed keys are annotation metadata: the schema ignores them and the report echoes their paths. The
  // body dropped them, which made "the schema ignored your field" invisible - the opposite of auditable.
  const annotated = { ...report, metadataKeys: ['_source', 'states[0]._note'] }
  const text = renderReportText(annotated)
  assert(/^METADATA /m.test(text), 'the echoed keys must be named')
  assert(text.includes('_source') && text.includes('states[0]._note'), 'and named exactly')
  assert(!/^METADATA /m.test(body), 'a report with no metadata keys has nothing to echo')
})

test('narrative coverage is rendered as the strings the engine produces', () => {
  // The engine reports coverage as "described/total" strings. The renderer only accepted numbers, so the line
  // never appeared - a filter that silently rejected every value the producer could send.
  const covered = { ...report, narrativeCoverage: { states: '2/3', events: '1/1', scenarios: '0/2' } }
  const text = renderReportText(covered)
  const line = text.split('\n').find((entry) => entry.startsWith('NARRATIVE '))
  assert(line !== undefined, 'a report with narrative coverage must say how much is documented')
  assert(line.includes('2/3') && line.includes('1/1') && line.includes('0/2'), 'and print the ratios it was given: ' + String(line))
})

// ---------------------------------------------------------------------------
// report_diff: a delta is its own shape, and `changed` is not a finding
// ---------------------------------------------------------------------------

/** A report shaped like a verify run: enough for the diff, and nothing else. */
const shaped = (findings) => ({
  schema: 'model-everything/verify/v1',
  ran: true,
  ok: true,
  verdict: findings.some((finding) => finding.severity === 'error') ? 'fail' : 'pass_with_findings',
  summary: { checksRun: 1, errors: 0, warnings: 0 },
  checks: [{ id: 'S5', name: 'Event Completeness', status: 'fail', detail: '', findings }],
})

test('a clean delta renders as a delta, not as a JSON blob', () => {
  // `isDelta` required at least one non-empty list, so the case a baseline is used for most often - nothing
  // changed - fell through to the unknown-shape fallback, which prints the whole object as JSON.
  const clean = diffReports(shaped([{ code: 'S5_UNHANDLED_EVENT', severity: 'warning', message: 'A ignores stop' }]), shaped([{ code: 'S5_UNHANDLED_EVENT', severity: 'warning', message: 'A ignores stop' }]))
  const text = renderReportText(clean)
  assert(!text.includes('{'), 'the body must not fall back to JSON:\n' + text.slice(0, 300))
  assert(/no new findings/.test(text), 'an empty delta says so in words')
  assert(/^CURRENT  verdict=/m.test(text), 'and still names the current verdict')
})

test('a changed finding shows both sides instead of inventing a severity', () => {
  // `changed[]` carries `before`/`after`; `toViewFinding` read the item itself, which has neither a `severity` nor
  // a `message`, so every change rendered as `[warning/CODE] CODE` - a fabrication, and the escalation a reader
  // most needs to see was the one it erased.
  // The evidence is what makes these two the same finding: identity falls back to the message when a finding
  // carries no locator, so without it a reworded message reads as one added and one removed - a different case.
  const evidence = { state: 'A', event: 'stop' }
  const before = shaped([{ code: 'S5_UNHANDLED_EVENT', severity: 'warning', message: 'A ignores stop', evidence }])
  const after = shaped([{ code: 'S5_UNHANDLED_EVENT', severity: 'error', message: 'A ignores stop, and that costs a retry', evidence }])
  const text = renderReportText(diffReports(before, after))
  assert(/^CHANGED \(1\)$/m.test(text), 'the changed section is named:\n' + text)
  assert(/severity warning → error/.test(text), 'the escalation is stated')
  assert(text.includes('A ignores stop') && text.includes('costs a retry'), 'and both messages survive')
  assert(!/\[warning\/S5_UNHANDLED_EVENT\]/.test(text), 'a change is not relabelled as a warning finding')
})

if (failures > 0) {
  console.error(`\n${failures} report-view test(s) failed`)
  process.exit(1)
}
console.log('\nreport-view: all assertions passed')
