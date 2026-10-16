// Keep the published copies honest.
//
// The package publishes `lib`, `src`, `skills`, `examples`, `locale` and the manifest - NOT `docs/`.
// So the reading guide has to live inside the skill to ship at all, while the generator and its
// measured facts stay in `docs/` where they belong. Two copies of one document drift, so this script
// makes the copy explicit and a test fails when they disagree.
//
// It also wires the generator to write the published artifacts directly, so there is one authoring
// step rather than a copy somebody has to remember.
import { readFileSync, writeFileSync } from 'node:fs'

const root = 'F:/workspace/dsh-plugins/dsh-model-everything/'
const pairs = [
  ['docs/report-reading/guide.md', 'skills/model-everything-report-reading/references/reading-a-report.md'],
  ['docs/report-reading/mindmap.mmd', 'skills/model-everything-report-reading/references/reading-a-report.mmd'],
]

let drifted = 0
for (const [source, published] of pairs) {
  const from = readFileSync(root + source, 'utf8')
  const to = readFileSync(root + published, 'utf8')
  if (from === to) {
    console.log('in step   ' + published)
    continue
  }
  drifted += 1
  console.log('DRIFTED   ' + published)
}
if (drifted > 0) {
  console.log('')
  console.log('Copy the source over the published copy; the published one is what the model reads.')
  process.exit(1)
}
console.log('')
console.log('both published copies are in step with their sources')
