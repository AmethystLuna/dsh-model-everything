// Skill frontmatter guard.
//
// The DSH skill catalog renders `description` ONLY (not `whenToUse`) and truncates it:
// dsh-tool-skill has `DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH = 500` and
// `catalogDescription()` does `slice(0, maxLength - 3) + "..."` past that. So an
// over-long description is not merely long — its tail is invisible at the exact moment
// the model decides whether to load the skill. That is how the UML trigger went missing
// from the this plugin catalog entry while it sat at the end of a 1595-character string.
//
// This test is the number, not an impression: it renders each description the way the
// catalog does, fails when anything would be cut, and requires the decision-critical
// trigger words to survive inside the visible budget.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

/** dsh-tool-skill: DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH (catalogDescriptionMaxLength). */
const CATALOG_DESCRIPTION_MAX_LENGTH = 500

/** Trigger words that must survive inside the catalog budget: the use cases the skill exists for. */
const REQUIRED_TRIGGERS = {
  // The entry point: broad intent, the doctrine, and the route to each domain skill.
  'dsh-model-everything': ['Use when', 'verify', 'file:line', 'S1-S8', 'model-everything-uml', 'model-everything-interleaving', 'model-everything-datamodel'],
  'model-everything-uml': ['Use when', 'diagram', 'round-trip', 'refused', 'model-everything skill'],
  'model-everything-interleaving': ['Use when', 'thread-safe', 'ISR-safe', 'does not prove', 'model-everything skill'],
  'model-everything-datamodel': ['Use when', 'migration', 'data invariants', 'rollback', 'model-everything-uml'],
  // The architecture/dependency domain: the intent ("review this architecture") must
  // reach this skill, and the description must not promise more than the checks do.
  'model-everything-structure': ['Use when', 'architecture', 'dependency', 'cycle', 'layer', 'model-everything skill'],
}

const skillsRoot = fileURLToPath(new URL('../../skills/', import.meta.url))
let failures = 0

function check(name, fn) {
  try {
    fn()
    console.log('PASS', name)
  } catch (error) {
    failures += 1
    console.log('FAIL', name, '-', error instanceof Error ? error.message : String(error))
  }
}

/** The exact projection dsh-tool-skill applies before rendering a catalog line. */
function catalogDescription(value) {
  const normalized = value.replaceAll(/\s+/g, ' ').trim()
  return normalized.length <= CATALOG_DESCRIPTION_MAX_LENGTH
    ? normalized
    : normalized.slice(0, CATALOG_DESCRIPTION_MAX_LENGTH - 3) + '...'
}

function readFrontmatter(file) {
  const raw = readFileSync(file, 'utf8')
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)
  if (block === null) throw new Error('no frontmatter block')
  const name = /^name:\s*(\S+)\s*$/m.exec(block[1])
  const description = /^description:\s*"([\s\S]*?)"\s*$/m.exec(block[1])
  if (name === null) throw new Error('no name field')
  if (description === null) throw new Error('no quoted description field')
  return { name: name[1], description: description[1] }
}

const skills = readdirSync(skillsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

if (skills.length === 0) throw new Error('no skills found under skills/')

for (const directory of skills) {
  const file = join(skillsRoot, directory, 'SKILL.md')
  let frontmatter
  try {
    frontmatter = readFrontmatter(file)
  } catch (error) {
    failures += 1
    console.log('FAIL frontmatter ' + directory, '-', error instanceof Error ? error.message : String(error))
    continue
  }

  check('catalog line fits the 500-char budget: ' + frontmatter.name, () => {
    const visible = catalogDescription(frontmatter.description)
    if (visible.endsWith('...')) {
      const cut = visible.slice(0, -3).length
      throw new Error(
        'description is ' + String(frontmatter.description.length) + ' chars; the catalog shows ' + String(cut) +
        ' and cuts the rest. First invisible text: "' + frontmatter.description.slice(cut, cut + 60) + '…"',
      )
    }
  })

  check('frontmatter follows the "Use when" format: ' + frontmatter.name, () => {
    if (!frontmatter.description.startsWith('Use when')) {
      throw new Error('description must open with "Use when": ' + frontmatter.description.slice(0, 40))
    }
    if (frontmatter.name !== directory) throw new Error('name "' + frontmatter.name + '" does not match directory "' + directory + '"')
  })

  const required = REQUIRED_TRIGGERS[frontmatter.name]
  if (required !== undefined) {
    check('catalog line still names every use case: ' + frontmatter.name, () => {
      const visible = catalogDescription(frontmatter.description).toLowerCase()
      const missing = required.filter((trigger) => !visible.includes(trigger.toLowerCase()))
      if (missing.length > 0) throw new Error('not visible to the model: ' + missing.join(', '))
    })
  }
}

// A registered tool must be named where the model looks for it: the core skill's tool table
// and the injected gate's tool list. A tool named in neither exists but is unreachable — it
// can only be called by accident. The reverse matters too: a name left behind after a tool
// was renamed is a dangling pointer that sends the model after something that is gone.
const srcRoot = fileURLToPath(new URL('../../src/', import.meta.url))
const registeredTools = readdirSync(srcRoot)
  .filter((entry) => entry.endsWith('tool.ts'))
  .flatMap((entry) =>
    [...readFileSync(join(srcRoot, entry), 'utf8').matchAll(/export const [A-Z_]+TOOL_NAME = '([a-z_]+)'/g)].map((match) => match[1]),
  )
  .sort()


// Shipped text carries no catalogue counts: "four skills" is wrong the moment a fifth lands.
// Shipped text carries no catalogue counts: "four skills" is wrong the moment a fifth lands.
// Every document this plugin ships and a reader can open is checked: the README pair, the
// plugin entry and the skills.
const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const shippedText = [
  join(repoRoot, 'README.md'),
  join(repoRoot, 'README.en-US.md'),
  join(repoRoot, 'src', 'index.ts'),
  ...readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const dir = join(skillsRoot, entry.name)
      const files = [join(dir, 'SKILL.md')]
      try {
        for (const extra of readdirSync(join(dir, 'references'))) files.push(join(dir, 'references', extra))
      } catch {
        // A skill without a references directory is fine.
      }
      return files
    }),
]

// so they stay out of this scan. The report contract holds the real counts, where a test
// asserts them.
const COUNT_PATTERNS = [
  /\b(?:two|three|four|five|six|seven|eight|nine|ten)\s+(?:skills?|agents?|tools?|checks?|attacks?|probes?|subcommands?|domains?)\b/i,
  /\b\d+\s+(?:skills?|agents?|tools?|checks?|attacks?|probes?|subcommands?|domains?)\b/i,
  /\b(?:two|three|four|five|six|seven|eight|nine|ten|\d+)\s+in total\b/i,
  /一共[一二三四五六七八九十百\d]+个/,
  /共[一二三四五六七八九十百\d]+个/,
  /[一二三四五六七八九十百]+个(?:技能|智能体|工具|检查|子命令|领域)/,
]

/** Host manifests and store text: the surfaces a user reads before installing. */
const HOST_DIRS = ['.claude-plugin', '.codex-plugin', '.cursor-plugin', '.kimi-plugin', '.opencode', '.zcode', '.dsh']
const hostText = HOST_DIRS.flatMap((directory) => {
  try {
    return readdirSync(join(repoRoot, directory))
      .filter((name) => /\.(json|md|ya?ml|toml|txt)$/.test(name))
      .map((name) => join(repoRoot, directory, name))
  } catch {
    return []
  }
})

check('shipped text carries no catalogue counts', () => {
  const problems = []
  for (const file of [...shippedText, ...hostText]) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    lines.forEach((line, index) => {
      for (const pattern of COUNT_PATTERNS) {
        if (pattern.test(line)) {
          problems.push(file.slice(repoRoot.length + 1) + ':' + String(index + 1) + ' -> ' + line.trim().slice(0, 90))
        }
      }
    })
  }
  if (problems.length > 0) {
    throw new Error('catalogue count in shipped text; name the capability instead: ' + problems.join(' | '))
  }
})

// Print what the model actually receives, so a drift is readable in the test log.
console.log('\n--- catalog lines as the model sees them ---')
for (const directory of skills) {
  const frontmatter = readFrontmatter(join(skillsRoot, directory, 'SKILL.md'))
  const visible = catalogDescription(frontmatter.description)
  console.log('- `' + frontmatter.name + '`: ' + visible)
  console.log('  (' + String(frontmatter.description.length) + ' chars written, ' + String(visible.length) + ' visible, budget ' + String(CATALOG_DESCRIPTION_MAX_LENGTH) + ')')
}

// A skill's body is read by a model to do a task, so repository-maintenance content in there spends
// context on something its reader cannot use: a generator it cannot run, a suite it does not own, a
// release step that is not its job. The markers are paths and artefacts rather than words, because a
// word like "CI" appears in legitimate prose - a hash is compared "in a CI comparison" - and a gate
// that fires on that is worse than no gate.
//
// What is deliberately NOT flagged: `tests/skills/run.mjs` as the enforcement of the catalog budget.
// The budget is a constraint on whoever WRITES a skill, the model is that writer when it adds one, and
// the rule is useless to it without the thing that enforces it. Where a marker would fire on content
// like that, it is listed below with the reason, so allowing it is a decision rather than a silence.
const MAINTENANCE_MARKERS = [
  { id: 'test-path', re: /\btests\/[a-zA-Z0-9-]+\//g, why: 'a regression suite path' },
  { id: 'docs-path', re: /(?<![\w`/"])docs\/[a-zA-Z0-9]/g, why: 'a path into docs/, which the package does not publish' },
  { id: 'generator', re: /\bgenerate-[a-z-]+\.mjs\b/g, why: 'a generator of this repository' },
  { id: 'npm-script', re: /\bnpm run [a-z:]+/g, why: 'a package script' },
  { id: 'release', re: /\bRELEASE\.md\b|\bnpm publish\b|\bbump-version\b/g, why: 'the release process' },
  { id: 'memory', re: /\.github\/memory/g, why: 'the project memory tree' },
  { id: 'contributor-guide', re: /\bAGENTS\.md\b|\bCONTRIBUTING\.md\b/g, why: 'a contributor guide' },
  { id: 'roster', re: /\b(?:two|three|four|five|six|seven|eight|nine|ten)\s+(?:skills?|tools?|checks?|families|suites?)\b/gi, why: 'a count of a roster that changes' },
]

/** Content a marker would flag that is a constraint the skill's reader has to work within. */
const ALLOWED_MAINTENANCE_MENTIONS = [
  {
    file: 'skills/model-everything/SKILL.md',
    marker: 'test-path',
    match: 'tests/skills/',
    why: 'the catalog budget is a constraint on whoever writes a skill, and the model is that writer; the suite is what enforces the rule it is being told',
  },
  {
    file: 'skills/model-everything/references/hash-spec.md',
    marker: 'test-path',
    match: 'tests/engine/',
    why: 'the hash specification says how it is kept honest; "pinned by golden tests" is what makes the published algorithm checkable rather than asserted',
  },
]

/** Every markdown file a skill ships: its own body, and the references beside it. */
function shippedSkillFiles(directory) {
  const files = [join(skillsRoot, directory, 'SKILL.md')]
  try {
    for (const name of readdirSync(join(skillsRoot, directory, 'references')).filter((entry) => entry.endsWith('.md'))) {
      files.push(join(skillsRoot, directory, 'references', name))
    }
  } catch { /* a skill with no references directory is normal */ }
  return files
}

check('skill bodies carry no repository-maintenance content', () => {
  const offenders = []
  for (const directory of skills) {
    for (const file of shippedSkillFiles(directory)) {
      const text = readFileSync(file, 'utf8')
      const relative = file.slice(file.indexOf('skills')).replaceAll('\\', '/')
      for (const marker of MAINTENANCE_MARKERS) {
        for (const match of text.matchAll(marker.re)) {
          const allowed = ALLOWED_MAINTENANCE_MENTIONS.some((entry) => entry.file === relative && entry.marker === marker.id && entry.match === match[0])
          if (allowed) continue
          offenders.push(relative + ': ' + match[0] + ' (' + marker.why + ')')
        }
      }
    }
  }
  if (offenders.length > 0) {
    throw new Error('a model reads these to do a task, not to maintain this repository:\n    ' + offenders.join('\n    '))
  }
})

check('a skill references only files that ship beside it', () => {
  // A relative link inside a skill resolves against the package, so a link that leaves `skills/` is a
  // dangling pointer for the model that follows it - the published package has no `docs/`.
  const offenders = []
  for (const directory of skills) {
    for (const file of shippedSkillFiles(directory)) {
      const text = readFileSync(file, 'utf8')
      const relative = file.slice(file.indexOf('skills')).replaceAll('\\', '/')
      for (const match of text.matchAll(/\]\(([^)]*)\)/g)) {
        // A link may carry an anchor, and the anchor is not part of the path: comparing the whole thing
        // against the filesystem reported `references/uml-modeling-guide.md#choosing-the-view` as missing
        // while the file it names was there.
        const target = match[1].split('#')[0]
        if (target === '' || target.startsWith('http')) continue
        if (!existsSync(resolve(dirname(file), target))) offenders.push(relative + ' -> ' + match[1])
      }
    }
  }
  if (offenders.length > 0) throw new Error('a link a model would follow does not resolve: ' + offenders.join(', '))
})

if (failures > 0) {
  console.log('skill catalog checks failed:', failures)
  process.exit(1)
}
console.log('\nall skill catalog checks passed')
