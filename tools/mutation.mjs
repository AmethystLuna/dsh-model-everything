#!/usr/bin/env node
/**
 * Mutation check: inject a defect, run the suites, see which one goes red, restore.
 *
 * A suite that passes a broken drawing is a suite that asserts nothing a reader would notice. This walks a short list of
 * defects a careless change could introduce, and fails when one of them is not caught. It is opt-in (`node tools/mutation.mjs`)
 * and not part of `npm run check`: it rewrites the working tree, so it refuses to start unless the tree is clean, and it
 * restores every file it touched in a `finally`.
 *
 *   node tools/mutation.mjs           run every mutation
 *   node tools/mutation.mjs M3        run one, by its prefix
 *   node tools/mutation.mjs --list    list them
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const git = (...args) => execSync(['git', ...args].join(' '), { cwd: root, encoding: 'utf8' })
// `npm` is `npm.cmd` on Windows, and a command runner cannot start a `.cmd` without a shell: without one the build never ran
// and every suite passed the unmutated `lib/`, which is the worst possible answer from a mutation check. The command is
// built as one string so the shell is used without the deprecation that passing an argument list to it brings.
const run = (command, args) => {
  const line = [command, ...args].join(' ')
  try {
    return execSync(line, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (error) {
    return String(error.stdout ?? '') + String(error.stderr ?? '')
  }
}

/** The suites a drawing defect could land in. Fast enough to run once per mutation. */
const SUITES = [
  'tests/plantuml-corpus/run.mjs',
  'tests/placement/run.mjs',
  'tests/channels/run.mjs',
  'tests/ordering/run.mjs',
  'tests/render/run.mjs',
  'tests/diagram/run.mjs',
]

const MUTATIONS = [
  {
    id: 'M1',
    what: 'the separation pass is switched off',
    file: 'src/render/paint.ts',
    from: 'const SHARED_LINE_ROUNDS = 8',
    to: 'const SHARED_LINE_ROUNDS = 0',
  },
  {
    id: 'M2',
    what: 'ports are packed at a fixed gap instead of the one the side can hold',
    file: 'src/render/paint.ts',
    from: 'const separation = wanted.length <= 1 ? PORT_SEPARATION : Math.min(PORT_SEPARATION, span / (wanted.length - 1))',
    to: 'const separation = PORT_SEPARATION',
  },
  {
    id: 'M3',
    what: 'the short jog between two parallel legs is left in',
    file: 'src/render/paint.ts',
    from: 'const SNAP_JOG = 6',
    to: 'const SNAP_JOG = 0',
  },
  {
    id: 'M4',
    what: "a mermaid thick line is drawn dashed again",
    file: 'src/render/from-mermaid.ts',
    from: "      if (edge[2] === '==>') {",
    to: "      if (edge[2] === '##>') {",
  },
  {
    id: 'M5',
    what: 'the separation rows are patched for the moved route only',
    file: 'src/render/paint.ts',
    from: ['    let rebuilt = 0', '    for (let index = 0; index < drawnPieces.length; index += 1) {', '      sharedRows[index] = sharedWith(drawnPieces, index)', '      rebuilt += sharedRows[index] as number', '    }', '    shared = rebuilt / 2'].join('\n'),
    to: ['    sharedRows[best.at] = sharedWith(drawnPieces, best.at)', '    shared = best.total'].join('\n'),
  },
  {
    id: 'M6',
    what: 'crossings are counted as zero, so the ordering pass stops improving',
    file: 'src/render/order.ts',
    from: 'export function countCrossings(layers: string[][], chains: Chain[]): number {',
    to: 'export function countCrossings(layers: string[][], chains: Chain[]): number {\n  return 0',
  },
  {
    id: 'M7',
    what: 'lanes are offered at the box edge instead of a gap away',
    file: 'src/render/route.ts',
    from: 'const LANE_GAP = 10',
    to: 'const LANE_GAP = 0',
  },
  {
    id: 'M8',
    what: 'folding a boundary does nothing',
    file: 'src/render/collapse.ts',
    from: '  if (asked.size === 0 || groups.length === 0) return diagram',
    to: '  if (asked.size === 0 || groups.length === 0 || true) return diagram',
  },
  {
    id: 'M9',
    what: 'a header is read and never drawn',
    file: 'src/render/paint.ts',
    from: '  if (diagram.header !== undefined) {',
    to: '  if (false) {',
  },
  {
    id: 'M10',
    what: 'a legend block is read and never drawn',
    file: 'src/render/paint.ts',
    from: "  if (legend.length > 0) shapes.push({ kind: 'legend', x: MARGIN, y: legendTop, lines: legend, colour: 'text' })",
    to: '',
  },
  {
    id: 'M11',
    what: 'the edge that places a note beside a box is drawn',
    file: 'src/render/from-plantuml.ts',
    from: [
      "        hint: side === 'top' ? 'up' : side === 'bottom' ? 'down' : side,",
      '        invisible: true,',
    ].join('\n'),
    to: "        hint: side === 'top' ? 'up' : side === 'bottom' ? 'down' : side,",
  },
  {
    id: 'M12',
    what: 'the lines inside a page-text block reach the parser',
    file: 'src/render/from-plantuml.ts',
    from: ["      inLegend.add(index)", "      if (new RegExp('^end\\\\s*' + (open === 'sourceCaption' ? 'caption' : open) + '\\\\b').test(text)) {"].join('\n'),
    to: "      if (new RegExp('^end\\\\s*' + (open === 'sourceCaption' ? 'caption' : open) + '\\\\b').test(text)) {",
  },
  {
    id: 'M13',
    what: 'a header takes one band however many lines it has',
    file: 'src/render/paint.ts',
    from: 'const headerShift = diagram.header === undefined ? 0 : Math.max(1, diagram.header.length) * 16',
    to: 'const headerShift = diagram.header === undefined ? 0 : 16',
  },
  {
    id: 'M14',
    what: 'the body of a block reaches the parser',
    file: 'src/render/blocks.ts',
    from: '    skip.add(index)',
    to: '    void index',
  },
  {
    id: 'M15',
    what: 'a block that is never closed is not reported',
    file: 'src/render/blocks.ts',
    from: '  return state === undefined ? undefined : { state, openedAt }',
    to: '  return undefined',
  },
]

const argument = process.argv[2]
if (argument === '--list') {
  for (const mutation of MUTATIONS) console.log(mutation.id, mutation.what)
  process.exit(0)
}
const chosen = argument === undefined ? MUTATIONS : MUTATIONS.filter((mutation) => mutation.id === argument)
if (chosen.length === 0) {
  console.error('no mutation matches ' + argument)
  process.exit(2)
}

const dirty = git('status', '--porcelain').trim()
if (dirty !== '') {
  console.error('the working tree has changes; this rewrites files and restores them with git, so commit or stash first')
  console.error(dirty.split('\n').slice(0, 5).join('\n'))
  process.exit(2)
}

const results = []
try {
  for (const mutation of chosen) {
    const path = resolve(root, mutation.file)
    const original = readFileSync(path, 'utf8')
    const eol = original.includes('\r\n') ? '\r\n' : '\n'
    const source = original.split('\r\n').join('\n')
    if (!source.includes(mutation.from)) {
      results.push({ mutation, caught: undefined, why: 'patch did not apply' })
      continue
    }
    writeFileSync(path, source.replace(mutation.from, mutation.to).split('\n').join(eol))
    run('npm', ['run', 'build'])
    const red = []
    for (const suite of SUITES) {
      const output = run('node', [suite])
      const failures = output.split('\n').filter((line) => line.startsWith('FAIL')).length
      if (failures > 0) red.push(suite.split('/')[1] + ' (' + String(failures) + ')')
    }
    results.push({ mutation, caught: red.length > 0, why: red.join(', ') })
    writeFileSync(path, original)
    run('npm', ['run', 'build'])
  }
} finally {
  run('git', ['checkout', '--', 'src', 'lib'])
}

let missed = 0
for (const result of results) {
  const verdict = result.caught === undefined ? 'BROKEN  ' : result.caught ? 'caught  ' : 'MISSED  '
  if (result.caught === false || result.caught === undefined) missed += 1
  console.log(verdict + result.mutation.id + '  ' + result.mutation.what + (result.why === '' ? '' : '  <- ' + result.why))
}
if (missed > 0) {
  console.error(String(missed) + ' mutation(s) went unnoticed: the suite that should catch them asserts something else')
  process.exit(1)
}
console.log('every mutation was caught')