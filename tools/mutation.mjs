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
 *   node tools/mutation.mjs --audit   which suites the run list leaves out
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const touched = new Set()
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
  'tests/skill-table/run.mjs',
  'tests/blocks/run.mjs',
  'tests/clearance/run.mjs',
  // The policy suites: pure arithmetic over points and rectangles, so they cost little and each one decides a pass that a
  // mutation can break.
  'tests/names/run.mjs',
  'tests/jog/run.mjs',
  'tests/separate/run.mjs',
  'tests/lift/run.mjs',
  'tests/repair/run.mjs',
  'tests/ports/run.mjs',
  'tests/labels/run.mjs',
  'tests/cycle-break/run.mjs',
  'tests/routing/run.mjs',
  'tests/arrows/run.mjs',
  'tests/directives/run.mjs',
  'tests/declaration/run.mjs',
  'tests/boundary/run.mjs',
  'tests/edge/run.mjs',
  'tests/note/run.mjs',
  'tests/marked-edge/run.mjs',
  'tests/resolve/run.mjs',
  'tests/page-blocks/run.mjs',
  'tests/mermaid-node/run.mjs',
  'tests/mermaid-chain/run.mjs',
  'tests/uml-families/run.mjs',
  'tests/uml-capability/run.mjs',
  'tests/uml-docs/run.mjs',
  'tests/report-contract/run.mjs',
  'tests/report-views/run.mjs',
  'tests/next-steps/run.mjs',
  'tests/doc-paths/run.mjs',
  'tests/docs-paths/run.mjs',
  'tests/tool-schema/run.mjs',
  'tests/tool-defaults/run.mjs',
  'tests/diff-claims/run.mjs',
  'tests/suite-registry/run.mjs',
  'tests/intent/run.mjs',
  'tests/check-status/run.mjs',
  'tests/summary-counters/run.mjs',
  'tests/edit-refusals/run.mjs',
  'tests/export-warnings/run.mjs',
  'tests/diff-families/run.mjs',
  'tests/diff-next-steps/run.mjs',
  'tests/compose-inputs/run.mjs',
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

  {
    id: 'M16',
    what: 'the canvas ignores the background the source asked for',
    file: 'src/render/svg.ts',
    from: "'\" fill=\"' + (canvas.background ?? colours.background) + '\" />'",
    to: "'\" fill=\"' + colours.background + '\" />'",
  },

  {
    id: 'M17',
    what: 'the legend and the captions keep the coordinates the turn gave them',
    file: 'src/render/paint.ts',
    from: '        const top = furnitureAt.get(index)',
    to: '        const top = undefined as number | undefined',
  },

  {
    id: 'M18',
    what: 'the delivered size ignores the scale the source asked for',
    file: 'src/render/svg.ts',
    from: "n(canvas.width * (canvas.scale ?? 1)) + '\" height=\"' + n(canvas.height * (canvas.scale ?? 1))",
    to: "n(canvas.width) + '\" height=\"' + n(canvas.height)",
  },

  {
    id: 'M19',
    what: 'a title statement is read and dropped',
    file: 'src/render/from-plantuml.ts',
    from: '    title: sourceTitle ?? title,',
    to: '    title,',
  },

  {
    id: 'M20',
    what: 'the notation table refuses an element it says it draws',
    file: 'skills/model-everything-diagram/SKILL.md',
    from: 'and the lifeline events |',
    to: 'the lifeline events and `component` |',
  },
  {
    id: 'M21',
    what: 'the notation table names one keyword twice in a cell',
    file: 'skills/model-everything-diagram/SKILL.md',
    from: '`title` (one line, or a block ending `end title`)',
    to: '`title` `title` (one line, or a block ending `end title`)',
  },

  {
    id: 'M22',
    what: 'a hide directive is reported as a layout control again',
    file: 'src/render/from-plantuml.ts',
    from: '      if (HIDE_DIRECTIVE.test(line)) {',
    to: '      if (false) {',
  },

  {
    id: 'M23',
    what: 'text is escaped for angle brackets but not for ampersands',
    file: 'src/render/svg.ts',
    from: "  value.replaceAll('&', '&amp;').replaceAll('<', '&lt;')",
    to: "  value.replaceAll('<', '&lt;')",
  },

  {
    id: 'M24',
    what: 'the machine caption is drawn even when the source wrote its own',
    file: 'src/render/paint.ts',
    from: "  const showMachine = diagram.sourceCaption === undefined || machineCaption.includes('refused')",
    to: '  const showMachine = true',
  },

  {
    id: 'M25',
    what: 'a stereotype stays in the name it follows',
    file: 'src/render/from-plantuml.ts',
    from: "      const rest = declared[2].replace(/\\s+#\\S+\\s*$/, '').replace(/\\s*<<[^<>]*>>\\s*$/, '').trim()",
    to: "      const rest = declared[2].replace(/\\s+#\\S+\\s*$/, '').trim()",
  },
  {
    id: 'M26',
    what: 'a description line becomes part of the element name',
    file: 'src/render/from-plantuml.ts',
    from: '    if (described !== null && SHAPES[described[1] as string] !== undefined) {',
    to: '    if (false) {',
  },

  {
    id: 'M27',
    what: 'a cardinality written before a name stays in it',
    file: 'src/render/names.ts',
    from: '    if (leading === null) break',
    to: '    if (leading !== null) break',
  },
  {
    id: 'M28',
    what: 'a quoted name followed by `as` is read as a cardinality',
    file: 'src/render/names.ts',
    from: '    if (/^as\\s/i.test(after)) break',
    to: '    if (false) break',
  },

  {
    id: 'M29',
    what: 'a bare name inside a together block is not a box',
    file: 'src/render/from-plantuml.ts',
    from: "      if (/^[A-Za-z_][\\w.-]*$/.test(line)) {",
    to: '      if (false) {',
  },
  {
    id: 'M30',
    what: 'a brace inside a together block ends the block',
    file: 'src/render/from-plantuml.ts',
    from: '      if (open !== undefined && depth > 0) {',
    to: '      if (false) {',
  },

  {
    id: 'M31',
    what: 'a bracketed subgraph label keeps its brackets',
    file: 'src/render/from-mermaid.ts',
    from: '        spelled !== null',
    to: '        false',
  },
  {
    id: 'M32',
    what: 'a direction inside a subgraph is refused again',
    file: 'src/render/from-mermaid.ts',
    from: '    if (/^direction\\s+(tb|td|bt|lr|rl)\\b/i.test(line) && builder.open.length > 0) {',
    to: '    if (false) {',
  },

  {
    id: 'M33',
    what: 'a composite state is refused again',
    file: 'src/render/from-mermaid.ts',
    from: '      if (composite !== null) {',
    to: '      if (false) {',
  },
  {
    id: 'M34',
    what: 'a composite state keeps a box of the same name',
    file: 'src/render/from-mermaid.ts',
    from: '  for (const group of builder.groups) builder.nodes.delete(group.id)',
    to: '  void builder.groups',
  },
  {
    id: 'M35',
    what: 'a state type is refused again',
    file: 'src/render/from-mermaid.ts',
    from: '      const typed = /^state\\s+([A-Za-z_][\\w-]*)\\s*(<<[^<>]*>>)\\s*$/.exec(line)',
    to: '      const typed = null as RegExpExecArray | null',
  },

  {
    id: 'M36',
    what: 'a run beside a box is moved towards it instead of away',
    file: 'src/render/clearance.ts',
    from: '  if (high !== undefined) return high - CLEARANCE',
    to: '  if (high !== undefined) return high + CLEARANCE',
  },
  {
    id: 'M37',
    what: 'a run may hug a box as closely as it likes',
    file: 'src/render/clearance.ts',
    from: 'export const HUG = 3',
    to: 'export const HUG = 0',
  },

  {
    id: 'M38',
    what: 'a Mermaid configuration block is read as diagram source',
    file: 'src/render/from-mermaid.ts',
    from: "      if (!open && !text.startsWith('%%{')) return",
    to: '      if (!open) return',
  },

  {
    id: 'M39',
    what: 'a style directive is refused instead of dropped with a reason',
    file: 'src/render/from-mermaid.ts',
    from: "      ignored.push(where + '`' + name + '` ' + reason)",
    to: "      refused.push(where + '`' + name + '` ' + reason)",
  },

  {
    id: 'M40',
    what: 'a together opener is not recognised and is refused as a boundary',
    file: 'src/render/from-plantuml.ts',
    from: '    if (/^together\\b[^{]*\\{\\s*$/.test(line)) {',
    to: '    if (false) {',
  },

  {
    id: 'M41',
    what: 'an arrow mark on the left end is read as if it were on the right',
    file: 'src/render/plantuml-reference.ts',
    from: '      from: right,',
    to: '      from: left,',
  },

  {
    id: 'M42',
    what: 'a boundary keeps its decorations in its name',
    file: 'src/render/plantuml-reference.ts',
    from: '  const rest = bare.name',
    to: '  const rest = declaration.slice(keyword.length).trim()',
  },

  {
    id: 'M43',
    what: 'a bare name inside a together block is not collected as a member',
    file: 'src/render/plantuml-reference.ts',
    from: "      if (/^[A-Za-z_][\\w.-]*$/.test(line)) {",
    to: '      if (false) {',
  },

  {
    id: 'M44',
    what: 'a file include is dropped instead of refused',
    file: 'src/render/plantuml-directives.ts',
    from: "      channel: 'refused',",
    to: "      channel: 'ignored',",
  },

  {
    id: 'M45',
    what: 'a delivery size outside its range is taken anyway',
    file: 'src/render/plantuml-page.ts',
    from: '    if (!(factor >= SCALE_RANGE.min && factor <= SCALE_RANGE.max)) {',
    to: '    if (false) {',
  },

  {
    id: 'M46',
    what: 'a declaration keeps its decorations in its name',
    file: 'src/render/plantuml-declaration.ts',
    from: '    const rest = bare.name',
    to: '    const rest = declared[2] as string',
  },

  {
    id: 'M47',
    what: 'every boundary is drawn dashed, including a state',
    file: 'src/render/plantuml-boundary.ts',
    from: '    solid: SOLID_BOUNDARY.has(opener),',
    to: '    solid: false,',
  },

  {
    id: 'M48',
    what: 'an exit marker is drawn solid',
    file: 'src/render/plantuml-edge.ts',
    from: '      dashed: true,',
    to: '      dashed: false,',
  },
  {
    id: 'M49',
    what: 'a note above a box is placed below it',
    file: 'src/render/plantuml-note.ts',
    from: "      hint: side === 'top' ? 'up' : side === 'bottom' ? 'down' : side,",
    to: "      hint: side === 'top' ? 'down' : side === 'bottom' ? 'up' : side,",
  },
  {
    id: 'M50',
    what: 'a hidden edge is drawn',
    file: 'src/render/plantuml-marked-edge.ts',
    from: '      invisible: true,',
    to: '      invisible: false as unknown as true,',
  },
  {
    id: 'M51',
    what: 'an edge re-pointed at a block lands on nothing',
    file: 'src/render/plantuml-resolve.ts',
    from: '      boundaryAt.set(id, groupId)',
    to: '      boundaryAt.set(id, id)',
  },
  {
    id: 'M52',
    what: 'a note block keeps its own lines instead of becoming one note',
    file: 'src/render/plantuml-page-blocks.ts',
    from: '      all[openedAt] =',
    to: '      all[openedAt] = all[openedAt],',
  },
  {
    id: 'M53',
    what: 'a divider is read as a statement again, so `...` becomes an arrow',
    file: 'src/render/plantuml-directives.ts',
    from: "  if (!/^([-.]{2,}|={2,}.*={2,})$/.test(line)) return undefined",
    to: "  if (true) return undefined",
  },
  {
    id: 'M54',
    what: 'a styled arrow is not read as an edge',
    file: 'src/render/plantuml-marked-edge.ts',
    from: '  const styled = STYLED.exec(line)',
    to: '  const styled = null as RegExpExecArray | null',
  },
  {
    id: 'M55',
    what: 'a partition is refused as a block that cannot be drawn',
    file: 'src/render/plantuml-boundary.ts',
    from: "export const BOUNDARY = new Set(['package', 'folder', 'node', 'component', 'rectangle', 'artifact', 'state', 'partition'])",
    to: "export const BOUNDARY = new Set(['package', 'folder', 'node', 'component', 'rectangle', 'artifact', 'state'])",
  },
  {
    id: 'M56',
    what: 'two notes beside one box share an id, so the second is dropped',
    file: 'src/render/plantuml-note.ts',
    from: "      noteId: 'note-' + target.id + '-' + String(ordinal),",
    to: "      noteId: 'note-' + target.id,",
  },
  {
    id: 'M57',
    what: 'a second start marker is dropped in silence again',
    file: 'src/render/from-plantuml.ts',
    from: "        if (startId !== undefined && startId !== marked.target.id) {",
    to: '        if (false) {',
  },
  {
    id: 'M58',
    what: 'a Mermaid machine drops a second start marker in silence',
    file: 'src/render/from-mermaid.ts',
    from: '        if (startId !== undefined && startId !== to) {',
    to: '        if (false) {',
  },
  {
    id: 'M59',
    what: 'two notes beside one Mermaid state share an id again',
    file: 'src/render/from-mermaid.ts',
    from: "        const noteId = 'note-' + target + '-' + String(noteCount)",
    to: "        const noteId = 'note-' + target",
  },
  {
    id: 'M60',
    what: 'a parenthesised name keeps its parentheses',
    file: 'src/render/plantuml-declaration.ts',
    from: "    const parenAlias = /^\\((.+?)\\)\\s+as\\s+([A-Za-z_][\\w-]*)$/.exec(rest)",
    to: '    const parenAlias = null as RegExpExecArray | null',
  },
  {
    id: 'M61',
    what: 'an interface circle is refused as a line that cannot be read',
    file: 'src/render/plantuml-declaration.ts',
    from: "  const circle = /^\\(\\)\\s*(?:\"(.+?)\"|([^\"\\s][^\"\\s]*))?\\s*(?:as\\s+([A-Za-z_][\\w-]*))?\\s*$/.exec(line)",
    to: '  const circle = null as RegExpExecArray | null',
  },
  {
    id: 'M62',
    what: 'a stadium is drawn as a rectangle',
    file: 'src/render/mermaid-node.ts',
    from: "  [/^\\(\\[(.+)\\]\\)$/, 'stadium'],",
    to: "  [/^\\(\\[(.+)\\]\\)$/, 'rect'],",
  },
  {
    id: 'M63',
    what: 'an ampersand splits a label as if it were a separator',
    file: 'src/render/mermaid-chain.ts',
    from: "    if (char === '&' && depth === 0) {",
    to: "    if (char === '&') {",
  },
  {
    id: 'M64',
    what: 'a use case diagram written with its own keyword is read as a state machine',
    file: 'src/uml-syntax.ts',
    from: "  const order: readonly UmlFamilyId[] = ['class', 'object', 'component', 'deployment', 'package', 'sequence', 'use-case', 'activity']",
    to: "  const order: readonly UmlFamilyId[] = ['class', 'object', 'component', 'deployment', 'package', 'sequence', 'activity']",
  },
  {
    id: 'M65',
    what: 'a composite classifier is drawn with a label the model never had',
    file: 'src/uml-composite.ts',
    from: "  const selfHead = model.self.label === undefined || model.self.label === '' || model.self.label === model.self.id",
    to: '  const selfHead = false',
  },
  {
    id: 'M66',
    what: 'an approximation is drawn as if it were faithful',
    file: 'src/uml-syntax.ts',
    from: "    if (support.fidelity === 'approximate') {",
    to: '    if (false) {',
  },
  {
    id: 'M67',
    what: 'a failing verdict names no failing code',
    file: 'src/engine.ts',
    from: "  verdictReason: String(errors) + ' error finding(s)' + (firstCode === undefined ? '' : ' (first error: ' + firstCode + ')'),",
    to: "  verdictReason: String(errors) + ' error finding(s)',",
  },
  {
    id: 'M68',
    what: 'the body view drops the next step a reader needs',
    file: 'src/report-view.ts',
    from: "  if (resolved.full) return JSON.stringify(value as JsonValue)",
    to: "  if (resolved.full) return JSON.stringify(value as JsonValue)\n  if (true) return JSON.stringify(value as JsonValue)",
  },
  {
    id: 'M69',
    what: 'a step names a tool this plugin does not ship',
    file: 'src/uml.ts',
    from: "nextSteps.push('Run model_verify on this model",
    to: "nextSteps.push('Run model_verifier on this model",
  },
  {
    id: 'M70',
    what: 'a report carries a modelHash that disagrees with its hashes',
    file: 'src/data-engine.ts',
    from: "  return createHash('sha256').update(stableStringify(model)).digest('hex')",
    to: "  return ''",
  },
  {
    id: 'M71',
    what: 'a document links to a reference file that is not there',
    file: 'skills/model-everything/SKILL.md',
    from: 'references/logic-verification-guide.md#manual',
    to: 'references/logic-verification-handbook.md#manual',
  },
  {
    id: 'M72',
    what: 'the schema offers a diagram kind the engine does not know',
    file: 'src/uml-tool.ts',
    from: 'const FAMILIES = [...UML_DIAGRAMS]',
    to: "const FAMILIES = [...UML_DIAGRAMS, 'block-diagram']",
  },
  {
    id: 'M73',
    what: 'the sequence render ignores the step cap',
    file: 'src/uml.ts',
    from: 'export function renderUml(input: unknown, notation: UmlNotation = \'mermaid\', diagram: UmlDiagram = \'state\', maxSteps = 60, intent?',
    to: 'export function renderUml(input: unknown, notation: UmlNotation = \'mermaid\', diagram: UmlDiagram = \'state\', maxSteps = 1000, intent?',
  },
  {
    id: 'M74',
    what: 'a finding is identified by its prose, so a reworded message is a new finding',
    file: 'src/baseline.ts',
    from: "  const where = locator === '{}' ? 'message:' + finding.message : locator",
    to: "  const where = 'message:' + finding.message",
  },
  {
    id: 'M75',
    what: 'a suite on disk is dropped from the gate',
    file: 'package.json',
    from: 'node tests/uml/run.mjs && ',
    to: '',
  },
  {
    id: 'M76',
    what: 'an intent no action can serve is accepted',
    file: 'src/uml.ts',
    from: '  if (!served.includes(intent)) {',
    to: '  if (false) {',
  },
  {
    id: 'M77',
    what: 'a capped check reports pass instead of skip',
    file: 'src/engine.ts',
    from: "    skipped.status = 'skip'",
    to: "    skipped.status = 'pass'",
  },
  {
    id: 'M78',
    what: 'the summary counts a check the report skipped as run',
    file: 'src/engine.ts',
    from: "  checksRun: checks.filter((check) => check.status !== 'skip').length,",
    to: "  checksRun: checks.length,",
  },
  {
    id: 'M79',
    what: 'a refused edit writes the batch anyway',
    file: 'src/editor.ts',
    from: "  if (!validation.ok && options.allowInvalid !== true) {",
    to: '  if (false) {',
  },
  {
    id: 'M80',
    what: 'an export drops an invariant the target cannot express, in silence',
    file: 'src/exporters.ts',
    from: "    if (invariant.kind !== 'never-states') warnings.push('UPPAAL export carries invariant kind",
    to: "    if (false) warnings.push('UPPAAL export carries invariant kind",
  },
  {
    id: 'M81',
    what: 'two reports of different families are compared as if they shared a vocabulary',
    file: 'src/baseline.ts',
    from: '  if (beforeFamily !== undefined && afterFamily !== undefined && beforeFamily !== afterFamily) {',
    to: '  if (false) {',
  },
  {
    id: 'M82',
    what: 'a clean delta over a failing report says nothing about the report',
    file: 'src/baseline.ts',
    from: "  if (verdictOfReport(current) === 'fail') {",
    to: '  if (false) {',
  },
  {
    id: 'M83',
    what: 'a rendezvous no machine declares is skipped, as it was before';
    file: 'src/engine.ts',
    from: '    if (allEventsSet.has(event)) continue',
    to: '    if (true) continue',
  },
]

const argument = process.argv[2]
// A mutation is only caught if the suite that would catch it runs. The suite list below is a fast subset of
// `test:engine`, so this mode prints what it leaves out - the places where a mutation could go unnoticed.
// The suites the drawing mutations cannot reach, and why: a mutation rewrites the painter or a reader, and these suites look at
// something else - the report contract, the tool surface, the skills - so running them for every mutation would cost minutes and
// decide nothing. The list is here so `--audit` can say which of the two a missing suite is.
const NOT_DRAWING = new Set([
  'tests/engine/run.mjs',
  'tests/design-engine/run.mjs',
  'tests/catalog/run.mjs',
  'tests/data-engine/run.mjs',
  'tests/concurrency/run.mjs',
  'tests/uml/run.mjs',
  'tests/apply-smoke.mjs',
  'tests/memory/run.mjs',
  'tests/skills/run.mjs',
  'tests/gate/run.mjs',
  'tests/skill-routing/run.mjs',
  'tests/toolset/run.mjs',
  'tests/principles/run.mjs',
  'tests/feature-checklist/run.mjs',
  'tests/usage/run.mjs',
  'tests/translation/run.mjs',
  'tests/documentation/run.mjs',
  'tests/contributing/run.mjs',
  'tests/routing-map/run.mjs',
  'tests/report-reading/run.mjs',
  'tests/structure/run.mjs',
  'tests/automaton/run.mjs',
  'tests/client/run.mjs',
  'tests/layering/run.mjs',
  'tests/coords/run.mjs',
  'tests/components/run.mjs',
  'tests/placement/run.mjs',
  'tests/presentation/run.mjs',
  'tests/tool-routing/run.mjs',
  'tests/tools/run.mjs',
  'tests/baseline/run.mjs',
  'tests/granularity/run.mjs',
  'tests/exporters/run.mjs',
  'tests/report-view/run.mjs',
  'tests/contracts/run.mjs',
  'tests/tool-boundary/run.mjs',
  'tests/negatives/run.mjs',
  'tests/external/run.mjs',
])

if (argument === '--audit') {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  const engine = String(pkg.scripts['test:engine'] ?? '')
  const all = [...engine.matchAll(/node (tests\/[^\s&]+)/g)].map((match) => match[1])
  const missing = all.filter((suite) => !SUITES.includes(suite))
  console.log('on the mutation run list:', SUITES.length)
  console.log('not on it:', missing.length)
  for (const suite of missing) console.log('  ' + suite + (NOT_DRAWING.has(suite) ? '   (not a drawing suite)' : '   <-- drawing suite, add it'))
  process.exit(0)
}

if (argument === '--list') {
  for (const mutation of MUTATIONS) console.log(mutation.id, mutation.what)
  process.exit(0)
}
// A suite that is on neither list was written and never added: it runs under `test:engine` and never under a mutation, so a defect it would
// catch is reported as missed. Three mutations were reported that way before this check existed, each of them a suite that was simply not on the
// run list. It is loud on every run now, because the alternative is discovering it from a MISSED line and blaming the suite.
const pkgForAudit = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const everySuite = [...String(pkgForAudit.scripts['test:engine'] ?? '').matchAll(/node (tests\/[^\s&]+)/g)].map((match) => match[1])
const unclassified = everySuite.filter((suite) => !SUITES.includes(suite) && !NOT_DRAWING.has(suite))
if (unclassified.length > 0) {
  console.error('warning: ' + String(unclassified.length) + ' suite(s) are on neither the mutation run list nor the not-a-drawing list:')
  for (const suite of unclassified) console.error('  ' + suite)
  console.error('a mutation that only this suite would catch will read as MISSED; add it to SUITES or to NOT_DRAWING.')
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
    touched.add(mutation.file)
    writeFileSync(path, original)
    run('npm', ['run', 'build'])
  }
} finally {
  run('git', ['checkout', '--', ...(touched.size === 0 ? ['src', 'lib'] : [...touched, 'src', 'lib'])])
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