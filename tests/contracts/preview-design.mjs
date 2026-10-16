// Print what the design contract cases report, so the snapshot is recorded after reading the
// answers rather than instead of reading them. Imports the same fixtures the suite uses, so
// the preview cannot drift from what will be frozen.
import { runDesignReview } from '../../lib/design-engine.js'
import { declaredDesign, defectiveDesign, bareDesign, refusedDesign } from '../fixtures/design.mjs'

const cases = {
  'a layered design that keeps every declaration': declaredDesign,
  'a design that contradicts its declarations': defectiveDesign,
  'a design that declares nothing but a graph': bareDesign,
  'a model the schema refuses': refusedDesign,
}

for (const [name, model] of Object.entries(cases)) {
  const report = runDesignReview(model)
  console.log('=== ' + name + ' ===')
  console.log('  ok/ran         :', report.ok, '/', report.ran)
  console.log('  verdict        :', report.verdict, '|', report.verdictReason)
  console.log('  violations     :', JSON.stringify(report.violations.map((entry) => entry.code)))
  console.log('  signals        :', JSON.stringify(report.signals.map((entry) => entry.code)))
  console.log('  not-pass checks:', JSON.stringify(report.checks.filter((check) => check.status !== 'pass').map((check) => check.id + ':' + check.status)))
  console.log('  summary        :', JSON.stringify(report.summary))
  for (const finding of [...report.violations, ...report.signals]) {
    console.log('    ' + finding.severity.padEnd(7) + finding.code + ': ' + finding.message.slice(0, 140))
  }
  console.log('  nextSteps      :', report.nextSteps.map((step) => step.slice(0, 120)).join(' // '))
}
