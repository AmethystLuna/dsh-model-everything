// The contribution guide is a claim about this repository - the gates it lists, the counts it quotes,
// and the paths it links - so it is tested like one.
//
// Why this suite exists: the first draft cited `Karp 1972` as the feedback NODE set. That is a claim
// this repository records nowhere; it was memory rather than a source, sitting in the guide whose own
// advice is to check a source before citing it. The check below is what caught it.
import { execFileSync } from 'node:child_process'
import { readNormalised } from '../generated-text.mjs'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const repo = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
let failures = 0
const test = (name, fn) => {
  try {
    fn()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', String(error.message).slice(0, 240))
  }
}

test('the contribution mind map is the one the repository produces now', () => {
  const before = readNormalised(repo + 'docs/contributing/mindmap.mmd')
  execFileSync(process.execPath, [repo + 'docs/contributing/generate-mindmap.mjs'], { encoding: 'utf8', timeout: 300_000 })
  const after = readNormalised(repo + 'docs/contributing/mindmap.mmd')
  if (before !== after) throw new Error('the map drifted: the gates, the code tables or the provenance list moved, and the map is what the guide is written from')
})

test('CONTRIBUTING.md links only paths that exist', () => {
  const guide = readFileSync(repo + 'CONTRIBUTING.md', 'utf8')
  const linked = [...guide.matchAll(/\]\(([^)#][^)]*)\)/g)].map((match) => match[1])
  if (linked.length === 0) throw new Error('the guide links nothing; this check would pass vacuously')
  const missing = linked.filter((target) => !existsSync(repo + target))
  if (missing.length > 0) throw new Error('the guide links paths that do not exist: ' + missing.join(', '))
})

test('CONTRIBUTING.md quotes the counts the repository has', () => {
  const raw = readFileSync(repo + 'CONTRIBUTING.md', 'utf8')
  // Prose wraps at a column, so a phrase can straddle a line break. Comparing literal substrings would
  // make the check depend on where the wrap falls, which is a defect in the check rather than in the
  // guide.
  const guide = raw.replace(/\s+/g, ' ')
  const codeFiles = []
  for (const file of readdirSync(repo + 'src').filter((name) => name.endsWith('.ts'))) {
    const found = [...readFileSync(repo + 'src/' + file, 'utf8').matchAll(/code: '([A-Z][A-Z0-9_]+)'/g)]
    if (found.length > 0) codeFiles.push({ file, count: found.length })
  }
  if (!guide.includes(String(codeFiles.length) + ' source files')) {
    throw new Error('the guide does not quote the current number of source files that declare codes: ' + String(codeFiles.length))
  }
  // The provenance count is the other measured number in the guide.
  let withProvenance = 0
  let references = 0
  for (const skill of readdirSync(repo + 'skills', { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)) {
    const refDir = repo + 'skills/' + skill + '/references'
    if (!existsSync(refDir)) continue
    for (const name of readdirSync(refDir).filter((entry) => entry.endsWith('.md'))) {
      references += 1
      if (/[Pp]rovenance/.test(readFileSync(refDir + '/' + name, 'utf8'))) withProvenance += 1
    }
  }
  if (!guide.includes(String(withProvenance) + ' of ' + String(references) + ' reference files')) {
    throw new Error('the guide does not quote the current provenance count: ' + String(withProvenance) + ' of ' + String(references))
  }
})

test('CONTRIBUTING.md lists the gates CI actually runs', () => {
  const guide = readFileSync(repo + 'CONTRIBUTING.md', 'utf8')
  const workflow = readFileSync(repo + '.github/workflows/dsh-bundle.yml', 'utf8')
  for (const gate of ['npm ci --legacy-peer-deps', 'npm run typecheck', 'npm run build', 'npm run test:engine', 'git diff --exit-code -- lib']) {
    if (!workflow.includes(gate)) continue
    if (!guide.includes(gate)) throw new Error('CI runs a gate the guide does not list: ' + gate)
  }
  const versions = /node-version: \[([^\]]+)\]/.exec(workflow)
  if (versions !== null) {
    for (const version of versions[1].split(',').map((entry) => entry.trim())) {
      if (!guide.includes('Node ' + version)) throw new Error('CI tests a Node version the guide does not name: ' + version)
    }
  }
})

test('the guide cites no source the repository cannot back', () => {
  const guide = readFileSync(repo + 'CONTRIBUTING.md', 'utf8')
  // Every author-year citation the guide makes has to appear in the repository's own references, or
  // the guide is asking contributors to trust a memory.
  const citations = [...guide.matchAll(/([A-Z][A-Za-z&.\s]+?)\s+((?:19|20)\d{2})/g)].map((match) => ({ name: match[1].trim(), year: match[2] }))
  const sources = []
  const collect = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) { collect(dir + '/' + entry.name); continue }
      if (entry.name.endsWith('.md')) sources.push(readFileSync(dir + '/' + entry.name, 'utf8'))
    }
  }
  collect(repo + 'skills')
  collect(repo + '.github/memory')
  for (const citation of citations) {
    const surname = citation.name.split(/[\s&]+/).filter(Boolean).pop()
    const backed = sources.some((text) => text.includes(surname) && text.includes(citation.year))
    if (!backed) throw new Error('the guide cites ' + citation.name + ' ' + citation.year + ', which no reference file records')
  }
})

test('the issue templates ask for the two shapes', () => {
  const dir = repo + '.github/ISSUE_TEMPLATE/'
  if (!existsSync(dir)) throw new Error('there is no issue template directory')
  const files = readdirSync(dir).filter((name) => name.endsWith('.md'))
  if (files.length < 2) throw new Error('the two shapes need a template each, found: ' + files.join(', '))
  const bodies = files.map((name) => readFileSync(dir + name, 'utf8').replace(/\s+/g, ' '))
  // The check is on what is ASKED FOR, not on what is mentioned: a proposal legitimately discusses the
  // verdict it would change. Each shape is identified by the thing only it needs.
  const asksForReport = bodies.some((body) => body.includes('verdictReason') && /finding codes|发现码/.test(body))
  const asksForSource = bodies.some((body) => body.includes('Citation') && body.includes('provenance'))
  if (!asksForReport) throw new Error('no template asks for the report fields a behaviour problem needs')
  if (!asksForSource) throw new Error('no template asks for the citation and provenance a method proposal needs')
  // Front matter is what makes GitHub show them as templates rather than as ordinary files.
  for (const name of files) {
    const text = readFileSync(dir + name, 'utf8')
    if (!/^---\n/.test(text) || !/^name:/m.test(text) || !/^about:/m.test(text)) {
      throw new Error(name + ' has no template front matter with a name and an about')
    }
  }
})

test('every issue template has a Chinese sibling that asks for the same things', () => {
  // A template is not a document the maintainer reads - it is a form the contributor WRITES IN. Asking a
  // Chinese-speaking reporter to describe behaviour in English degrades the one thing the report needs to
  // be good at, so each shape ships in both languages and the two have to stay in step.
  const dir = repo + '.github/ISSUE_TEMPLATE/'
  const files = readdirSync(dir).filter((name) => name.endsWith('.md'))
  const english = files.filter((name) => !name.includes('.zh-CN.'))
  if (english.length === 0) throw new Error('no English template found; this check would pass vacuously')

  // The fields each shape must ask for, in either language. Two forms of the same request count: the
  // frontmatter keys are always English, the prose is not.
  const REQUIRED = {
    report: [['verdict', /`verdict`/], ['verdictReason', /`verdictReason`/], ['schema', /`schema`/], ['the smallest input', /smallest|最小/]],
    source: [['a citation', /Citation|引用/], ['provenance', /provenance/], ['the mutation', /mutation|变异/], ['the non-goal', /not decide|不决定/]],
  }
  for (const name of english) {
    const sibling = name.replace(/\.md$/, '.zh-CN.md')
    if (!existsSync(dir + sibling)) throw new Error(name + ' has no Chinese sibling (' + sibling + ')')
    const source = readFileSync(dir + name, 'utf8')
    const translated = readFileSync(dir + sibling, 'utf8')
    const kind = /problem/.test(name) ? 'report' : 'source'
    for (const [what, pattern] of REQUIRED[kind]) {
      if (!pattern.test(source)) throw new Error(name + ' does not ask for ' + what)
      if (!pattern.test(translated)) throw new Error(sibling + ' does not ask for ' + what + ', so a Chinese reporter is asked for less')
    }
    // And the identifiers survive: a translated `verdictReason` would name a field that does not exist.
    for (const identifier of ['`verdict`', '`verdictReason`', '`schema`']) {
      if (source.includes(identifier) && !translated.includes(identifier)) {
        throw new Error(sibling + ' dropped the field name ' + identifier)
      }
    }
  }
})

test('the template config names the repository that is declared', () => {
  const dir = repo + '.github/ISSUE_TEMPLATE/'
  const config = readFileSync(dir + 'config.yml', 'utf8')
  const declared = JSON.parse(readFileSync(repo + 'package.json', 'utf8')).repository
  // A contact link that points somewhere else is worse than no link: the guide says so about dangling
  // pointers, and this is one.
  if (typeof declared !== 'string') throw new Error('the package declares no repository to check against')
  if (!config.includes(declared + '/blob/')) {
    throw new Error('the contact link does not point at the declared repository (' + declared + ')')
  }
})

if (failures > 0) {
  console.log('contributing guide tests failed:', failures)
  process.exit(1)
}
console.log('all contributing guide tests passed')
