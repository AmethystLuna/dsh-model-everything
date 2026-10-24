/**
 * Build a dependency graph from source files, so the structure review can answer a question about a
 * tree instead of about a diagram someone drew by hand.
 *
 * The review engine already judges a graph; what it never had was a way to get one from a repository.
 * Drawing it first is the expensive step, and it is the step a model does worst: 34 files and 86 edges
 * is more than a reader enumerates reliably, and getting the graph wrong is indistinguishable from
 * getting the code wrong.
 *
 * One language is a pair: an extractor that turns a file into the specifiers it names, and a resolver
 * that turns a specifier into a module id. Adding a language means adding that pair to `LANGUAGES`,
 * not touching the scan.
 *
 * Granularity is per language and is reported, because it is a property of the language rather than of
 * this tool: a C file includes files, while a Go import names a package and a Java import names a
 * package too. A tree that mixes them has both kinds of node, and the edges say which is which.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, relative, resolve } from 'node:path'

import { OptionShapeError } from './option-shape.js'

export interface ScannedEdge {
  from: string
  to: string
}

export interface ScannedGraph {
  /** Module ids, posix-style and relative to the scanned root. File ids for file languages, directory ids for package languages. */
  nodes: string[]
  edges: ScannedEdge[]
  /** Files read, and files skipped because they are not source. */
  filesRead: number
  /**
   * Specifiers that are project-internal but did not resolve: a relative path that leaves the root or names
   * no file, and an alias-shaped specifier (`@/x`, `~/x`, `#x`) that no `tsconfig`/`jsconfig` declares.
   */
  unresolved: string[]
  /** Bare specifiers seen (a package name), counted once each. */
  packages: string[]
  /** Which languages were scanned, and at what granularity. */
  languages: { language: string; files: number; granularity: 'file' | 'package' }[]
}

/** A path alias from `tsconfig.json`: `@/*` -> `src/*`, or a bare `baseUrl`. */
interface Alias {
  prefix: string
  targets: string[]
}

/** `tsconfig.json` allows comments and trailing commas; this reads the subset it needs without a parser. */
function parseJsonc(text: string): unknown {
  const withoutComments = stripCComments(text)
  const withoutTrailingCommas = withoutComments.replaceAll(/,\s*([}\]])/g, '$1')
  try {
    return JSON.parse(withoutTrailingCommas)
  } catch {
    return undefined
  }
}

/**
 * The aliases a TypeScript or JavaScript tree declares in its own `tsconfig.json`/`jsconfig.json`.
 *
 * Read rather than asked for: the project already states how it resolves `@/x`, and asking a caller to
 * repeat it is how a scan silently loses half its edges.
 */
function readAliases(root: string): { aliases: Alias[]; baseUrl?: string } {
  for (const name of ['tsconfig.json', 'jsconfig.json']) {
    let text: string
    try {
      text = readFileSync(resolve(root, name), 'utf8')
    } catch {
      continue
    }
    const parsed = parseJsonc(text)
    if (typeof parsed !== 'object' || parsed === null) continue
    const options = (parsed as { compilerOptions?: unknown }).compilerOptions
    if (typeof options !== 'object' || options === null) continue
    const compiler = options as { baseUrl?: unknown; paths?: unknown }
    const baseUrl = typeof compiler.baseUrl === 'string' ? compiler.baseUrl.replaceAll(String.fromCharCode(92), '/').replace(/^\.\//, '') : undefined
    const aliases: Alias[] = []
    if (typeof compiler.paths === 'object' && compiler.paths !== null) {
      for (const [pattern, targets] of Object.entries(compiler.paths as Record<string, unknown>)) {
        if (!Array.isArray(targets)) continue
        const cleaned = targets.filter((target): target is string => typeof target === 'string').map((target) => (baseUrl === undefined ? target : normalise([baseUrl, target])))
        if (cleaned.length === 0) continue
        aliases.push({ prefix: pattern.replace(/\*$/, ''), targets: cleaned.map((target) => target.replace(/\*$/, '')) })
      }
    }
    return { aliases, ...(baseUrl === undefined ? {} : { baseUrl }) }
  }
  return { aliases: [] }
}

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.next', '.cache', 'target', 'vendor', '__pycache__', '.venv', 'venv'])
const LIMITS = { files: 5000, bytes: 2_000_000 }

/** Strip comments so a commented-out include is not an edge. */
const stripCComments = (text: string): string => text.replaceAll(/\/\*[\s\S]*?\*\//g, ' ').replaceAll(/(^|[^:])\/\/[^\n]*/g, '$1 ')
const stripHashComments = (text: string): string => text.replaceAll(/(^|\s)#[^\n]*/g, '$1 ')

const dirOf = (id: string): string => (id.includes('/') ? id.slice(0, id.lastIndexOf('/')) : '')
const normalise = (parts: string[]): string => {
  const stack: string[] = []
  // Each entry may itself be a path: a caller passes a directory and a specifier, and only splitting
  // both is what makes `./x.js` resolve to `x.js` instead of to a segment named `./x.js`.
  for (const entry of parts) {
    for (const part of entry.split('/')) {
      if (part === '' || part === '.') continue
      if (part === '..') stack.pop()
      else stack.push(part)
    }
  }
  return stack.join('/')
}
const joinPath = (fromId: string, specifier: string): string => normalise([dirOf(fromId), specifier])

// ------------------------------------------------------------------------------------------ languages --

export type LangGranularity = 'file' | 'package'

export interface Language {
  name: string
  extensions: string[]
  granularity: LangGranularity
  /** Specifiers this file names, already separated from external ones. */
  extract(text: string): { local: string[]; external: string[] }
}

const specifiers = (text: string, patterns: RegExp[]): { local: string[]; external: string[] } => {
  const local: string[] = []
  const external: string[] = []
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const specifier = match[1]
      if (specifier === undefined || specifier === '') continue
      if (specifier.startsWith('.') || specifier.startsWith('/')) local.push(specifier)
      else external.push(specifier)
    }
  }
  return { local, external }
}

const JS_LIKE: Language = {
  name: 'typescript',
  extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'],
  granularity: 'file',
  extract(text) {
    const source = stripCComments(text)
    const { local, external } = specifiers(source, [/(?:^|[^.\w])from\s*['"]([^'"]+)['"]/g, /(?:^|[^.\w])import\s*\(\s*['"]([^'"]+)['"]\s*\)/g, /(?:^|[^.\w])require\s*\(\s*['"]([^'"]+)['"]\s*\)/g, /(?:^|[^.\w])import\s*['"]([^'"]+)['"]/g])
    // `@/x`, `~/x` and `#x` are project-internal by convention: a path alias, a subpath import. Counting
    // them as packages made a tree full of aliases look like it had one external dependency and almost no
    // internal edges - the quietest way for a scan to be wrong.
    const aliasShaped = (name: string): boolean => name.startsWith('@/') || name.startsWith('~/') || name.startsWith('#')
    return { local: [...local, ...external.filter(aliasShaped)], external: external.filter((name) => !name.startsWith('node:') && !aliasShaped(name)) }
  },
}

const C_LIKE: Language = {
  name: 'c',
  extensions: ['.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.hh', '.hxx', '.ino'],
  granularity: 'file',
  extract(text) {
    const local: string[] = []
    const external: string[] = []
    for (const match of stripCComments(text).matchAll(/^[ \t]*#[ \t]*include[ \t]*([<"])([^>"]+)[>"]/gm)) {
      const specifier = match[2]
      if (specifier === undefined) continue
      // Quoted includes are the project's own files; angle brackets are the system's, and a system
      // header is not an edge in this tree.
      if (match[1] === '"') local.push(specifier)
      else external.push(specifier)
    }
    return { local, external }
  },
}

const PYTHON: Language = {
  name: 'python',
  extensions: ['.py', '.pyi'],
  granularity: 'file',
  extract(text) {
    const source = stripHashComments(text)
    const local: string[] = []
    const external: string[] = []
    for (const match of source.matchAll(/^[ \t]*from[ \t]+(\.*)([\w.]*)[ \t]+import\b/gm)) {
      const dots = match[1] ?? ''
      const module = match[2] ?? ''
      if (dots !== '') local.push(dots + module)
      else if (module !== '') external.push(module)
    }
    for (const match of source.matchAll(/^[ \t]*import[ \t]+([\w.]+)/gm)) {
      const module = match[1]
      if (module !== undefined) external.push(module)
    }
    return { local, external }
  },
}

const GO: Language = {
  name: 'go',
  extensions: ['.go'],
  granularity: 'package',
  extract(text) {
    const source = stripCComments(text)
    const local: string[] = []
    const external: string[] = []
    // A block import is the common form; the single form is rare but legal.
    for (const block of source.matchAll(/import\s*\(([\s\S]*?)\)/g)) {
      for (const entry of (block[1] ?? '').matchAll(/"([^"]+)"/g)) {
        const path = entry[1]
        // A module path says nothing about where the package lives relative to this file, so the
        // resolver decides: a path whose tail names a directory here is an edge, the rest are modules.
        if (path !== undefined) local.push(path)
      }
    }
    for (const match of source.matchAll(/^\s*import\s+"([^"]+)"/gm)) {
      const path = match[1]
      if (path !== undefined) local.push(path)
    }
    return { local, external }
  },
}

const RUST: Language = {
  name: 'rust',
  extensions: ['.rs'],
  granularity: 'file',
  extract(text) {
    const source = stripCComments(text)
    const local: string[] = []
    const external: string[] = []
    for (const match of source.matchAll(/^\s*(?:pub\s+)?mod\s+([a-z_][a-z0-9_]*)\s*;/gm)) {
      const name = match[1]
      if (name !== undefined) local.push('mod:' + name)
    }
    for (const match of source.matchAll(/^\s*use\s+(crate|super|self)::([\w:]+)/gm)) {
      const root = match[1]
      const path = match[2]
      if (root !== undefined && path !== undefined) local.push(root + '::' + path)
    }
    for (const match of source.matchAll(/^\s*use\s+([a-z_]\w*)::/gm)) {
      const name = match[1]
      if (name !== undefined && !['crate', 'super', 'self', 'std', 'core', 'alloc'].includes(name)) external.push(name)
    }
    return { local, external }
  },
}

const JAVA_LIKE: Language = {
  name: 'java',
  extensions: ['.java', '.kt', '.kts', '.scala'],
  granularity: 'package',
  extract(text) {
    const source = stripCComments(text)
    const project = /^\s*package\s+([\w.]+)/m.exec(source)?.[1] ?? ''
    const external: string[] = []
    const local: string[] = []
    for (const match of source.matchAll(/^\s*import\s+(?:static\s+)?([\w.]+)/gm)) {
      const name = match[1]
      if (name === undefined) continue
      // A package import says nothing about the project root, which is a build setting this scan does
      // not read, so every import is offered to the resolver; one that names no directory here is a
      // library and is counted as such.
      local.push(name)
    }
    return { local, external }
  },
}

const CSHARP: Language = {
  name: 'csharp',
  extensions: ['.cs'],
  granularity: 'package',
  extract(text) {
    const source = stripCComments(text)
    const project = /^\s*namespace\s+([\w.]+)/m.exec(source)?.[1] ?? ''
    const local: string[] = []
    const external: string[] = []
    for (const match of source.matchAll(/^\s*using\s+([\w.]+)\s*;/gm)) {
      const name = match[1]
      if (name === undefined) continue
      // Same as a Java package: the namespace root is a project setting, so the resolver decides.
      local.push(name)
    }
    return { local, external }
  },
}

const PHP: Language = {
  name: 'php',
  extensions: ['.php'],
  granularity: 'file',
  extract(text) {
    const source = stripCComments(text)
    const local: string[] = []
    const external: string[] = []
    for (const match of source.matchAll(/(?:require|require_once|include|include_once)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const path = match[1]
      if (path !== undefined) local.push(path)
    }
    for (const match of source.matchAll(/^\s*use\s+([\w\\]+)/gm)) {
      const name = match[1]
      if (name !== undefined) external.push(name.replaceAll('\\', '.'))
    }
    return { local, external }
  },
}

const RUBY: Language = {
  name: 'ruby',
  extensions: ['.rb'],
  granularity: 'file',
  extract(text) {
    const source = stripHashComments(text)
    const local: string[] = []
    const external: string[] = []
    for (const match of source.matchAll(/^\s*require_relative\s+['"]([^'"]+)['"]/gm)) {
      const path = match[1]
      if (path !== undefined) local.push(path)
    }
    for (const match of source.matchAll(/^\s*require\s+['"]([^'"]+)['"]/gm)) {
      const path = match[1]
      if (path !== undefined) external.push(path)
    }
    return { local, external }
  },
}

const LUA: Language = {
  name: 'lua',
  extensions: ['.lua'],
  granularity: 'file',
  extract(text) {
    const source = stripHashComments(stripCComments(text))
    const local: string[] = []
    const external: string[] = []
    for (const match of source.matchAll(/require\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const path = match[1]
      if (path === undefined) continue
      if (path.startsWith('.')) local.push(path)
      else external.push(path)
    }
    return { local, external }
  },
}

const ZIG: Language = {
  name: 'zig',
  extensions: ['.zig'],
  granularity: 'file',
  extract(text) {
    const local: string[] = []
    const external: string[] = []
    for (const match of stripCComments(text).matchAll(/@import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const specifier = match[1]
      if (specifier === undefined) continue
      // `@import` always names a file in the tree, so there is no bare form to separate out.
      local.push(specifier)
    }
    return { local, external }
  },
}

const DART: Language = {
  name: 'dart',
  extensions: ['.dart'],
  granularity: 'file',
  extract(text) {
    const source = stripCComments(text)
    const local: string[] = []
    const external: string[] = []
    for (const match of source.matchAll(/^\s*(?:import|export|part)\s+['"]([^'"]+)['"]/gm)) {
      const path = match[1]
      if (path === undefined) continue
      if (path.startsWith('dart:') || path.startsWith('package:')) external.push(path)
      else local.push(path)
    }
    return { local, external }
  },
}

const ELIXIR: Language = {
  name: 'elixir',
  extensions: ['.ex', '.exs'],
  granularity: 'file',
  extract(text) {
    const source = stripHashComments(text)
    const local: string[] = []
    const external: string[] = []
    for (const match of source.matchAll(/^\s*(?:alias|import|use)\s+([A-Z][\w.]*)/gm)) {
      const name = match[1]
      if (name === undefined) continue
      local.push('mod:' + name)
    }
    return { local, external }
  },
}

const SWIFT: Language = {
  name: 'swift',
  extensions: ['.swift'],
  granularity: 'package',
  extract(text) {
    const source = stripCComments(text)
    const local: string[] = []
    const external: string[] = []
    for (const match of source.matchAll(/^\s*import\s+(?:\w+\s+)?([\w.]+)/gm)) {
      const name = match[1]
      if (name === undefined) continue
      // A module name is not a path, and the module-to-file map is a build setting this scan does not
      // read, so a Swift import is reported as external instead of being guessed into an edge.
      external.push(name)
    }
    return { local, external }
  },
}

/** Every language this scan understands, by extension. */
export const LANGUAGES: Language[] = [JS_LIKE, C_LIKE, PYTHON, GO, RUST, JAVA_LIKE, CSHARP, PHP, RUBY, LUA, ZIG, DART, ELIXIR, SWIFT]

const BY_EXTENSION = new Map<string, Language>(LANGUAGES.flatMap((language) => language.extensions.map((extension) => [extension, language] as const)))

/** Which language a file belongs to, if any. */
export function languageOf(path: string): Language | undefined {
  return BY_EXTENSION.get(extname(path).toLowerCase())
}

// ------------------------------------------------------------------------------------------ resolution --

interface Index {
  /** Every scanned file id. */
  files: Set<string>
  /** Declared path aliases, so `@/lib/a` resolves the way the project resolves it. */
  aliases: Alias[]
  /** `compilerOptions.baseUrl`, for a bare specifier that names a file under it. */
  baseUrl?: string
  /** Directory ids, so a package language can resolve a package name to a directory. */
  directories: string[]
  /** Directory ids by their dotted form (`a/b` for both `a.b` and `a/b`). */
  byDotted: Map<string, string>
}

const tryFiles = (base: string, extensions: string[], index: Index): string | undefined => {
  const candidates = [base]
  for (const extension of extensions) candidates.push(base + extension)
  for (const extension of extensions) candidates.push(base + '/index' + extension)
  return candidates.find((candidate) => index.files.has(candidate))
}

/** Resolve one specifier to a module id, following the language's own rules. */
function resolveSpecifier(language: Language, fromId: string, specifier: string, index: Index): string | undefined {
  if (language.granularity === 'package') {
    // A package language names a package, not a file: strip the member and match a directory.
    // A Java import separates with dots and a Go import with slashes, and a Go module path contains
    // both, so the specifier is split on either and the pieces are matched from both ends.
    const dotted = specifier.replaceAll('\\', '/').split(/[/.]/).filter(Boolean)
    // Two shapes meet here. A Java or C# import carries the package *root* and then the member, so the
    // directory is a prefix of the specifier. A Go import carries the module path and then the package,
    // so the directory is a suffix. Both are tried, exact package names first.
    const candidates: string[] = []
    for (let end = dotted.length; end > 0; end--) candidates.push(dotted.slice(0, end).join('/'))
    for (let start = 1; start < dotted.length; start++) candidates.push(dotted.slice(start).join('/'))
    for (const candidate of candidates) {
      // The index keys a directory by its dotted form, which is what a Java or C# specifier already is.
      const hit = index.byDotted.get(candidate.replaceAll('/', '.'))
      if (hit !== undefined) return hit
      const tail = index.directories.find((directory) => directory === candidate || directory.endsWith('/' + candidate))
      if (tail !== undefined) return tail
    }
    return undefined
  }
  if (language.name === 'python') {
    if (specifier.startsWith('.')) {
      // `.x` is the current package, `..x` is one level up; the dot count is how many levels to climb.
      const dots = /^\.+/.exec(specifier)?.[0].length ?? 1
      let base = dirOf(fromId)
      for (let level = 1; level < dots; level++) base = dirOf(base)
      return tryFiles(normalise([base, specifier.slice(dots).replaceAll('.', '/')]), ['.py', '.pyi'], index)
    }
    return tryFiles(specifier.replaceAll('.', '/'), ['.py', '.pyi'], index)
  }
  if (language.name === 'rust') {
    if (specifier.startsWith('mod:')) {
      const name = specifier.slice(4)
      return tryFiles(normalise([dirOf(fromId), name]), ['.rs'], index) ?? tryFiles(normalise([dirOf(fromId), name, 'mod']), ['.rs'], index)
    }
    const [root, path] = specifier.split('::')
    const segments = (path ?? '').split('::').filter(Boolean)
    const base = root === 'crate' ? '' : dirOf(fromId)
    // A use path names a module or an item inside it; try the longest prefix that exists.
    for (let length = segments.length; length > 0; length--) {
      const hit = tryFiles(normalise([base, segments.slice(0, length).join('/')]), ['.rs'], index)
      if (hit !== undefined) return hit
    }
    return undefined
  }
  if (language.name === 'elixir') {
    const name = specifier.startsWith('mod:') ? specifier.slice(4) : specifier
    const candidate = name.split('.').map((part) => part.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()).join('/')
    return tryFiles(candidate, ['.ex', '.exs'], index)
  }
  if (language.name === 'swift') {
    return index.byDotted.get(specifier.toLowerCase())
  }
  if (specifier.startsWith('/')) return undefined
  if (!specifier.startsWith('.')) {
    // A bare specifier is resolved the way the project declares it: a path alias first, then `baseUrl`.
    // That is also the only way a bare specifier can be project-internal, so the same helper decides
    // whether one is an edge or a package.
    const declared = resolveDeclared(language, specifier, index)
    if (declared !== undefined) return declared
  }
  const base = joinPath(fromId, specifier)
  const extension = extname(base)
  const stem = extension === '' ? base : base.slice(0, -extension.length)
  // A specifier may carry an extension the language does not store (TypeScript writes `./x.js` for a
  // `.ts` source), so the stem is tried against the language's own extensions as well.
  const candidates = extension === ''
    ? [base, ...language.extensions.map((entry) => base + entry), ...language.extensions.map((entry) => base + '/index' + entry)]
    : [base, ...language.extensions.map((entry) => stem + entry)]
  return candidates.find((candidate) => index.files.has(candidate))
}

// ------------------------------------------------------------------------------------------------ scan --


/**
 * A bare specifier that the project itself declares: a `paths` alias, or a file under `baseUrl`.
 *
 * `@/lib/a` is not a package, and counting it as one dropped the edge without saying so. Returns
 * undefined when nothing is declared for it, which leaves the caller free to treat it as external.
 */
function resolveDeclared(language: Language, specifier: string, index: Index): string | undefined {
  for (const alias of index.aliases) {
    if (!specifier.startsWith(alias.prefix)) continue
    const rest = specifier.slice(alias.prefix.length)
    for (const target of alias.targets) {
      const hit = tryFiles(normalise([target + rest]), language.extensions, index)
      if (hit !== undefined) return hit
    }
  }
  if (index.baseUrl !== undefined) {
    return tryFiles(normalise([index.baseUrl, specifier]), language.extensions, index)
  }
  return undefined
}

export function scanDependencyGraph(root: unknown): ScannedGraph {
  if (typeof root !== 'string' || root.trim() === '') {
    throw new OptionShapeError('STRUCTURE_OPTION_INVALID', 'repoPath must be a non-empty path to a directory or a single source file.')
  }
  const absolute = resolve(root)
  let stat
  try {
    stat = statSync(absolute)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new OptionShapeError('STRUCTURE_OPTION_INVALID', `repoPath could not be read: ${reason}. The path resolves against the process working directory, which is the session workspace.`)
  }
  if (stat.isFile()) {
    const id = relative(resolve('/'), absolute).slice(1).replaceAll('\\', '/')
    return { nodes: [id], edges: [], filesRead: 1, unresolved: [], packages: [], languages: [] }
  }
  if (!stat.isDirectory()) {
    throw new OptionShapeError('STRUCTURE_OPTION_INVALID', 'repoPath must be a directory or a source file.')
  }

  const files: string[] = []
  const contents = new Map<string, string>()
  const byLanguage = new Map<string, number>()
  const walk = (directory: string): void => {
    if (files.length >= LIMITS.files) return
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (files.length >= LIMITS.files) return
      if (entry.isSymbolicLink()) continue
      const full = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        if (SKIP.has(entry.name)) continue
        walk(full)
        continue
      }
      if (!entry.isFile()) continue
      const language = languageOf(entry.name)
      if (language === undefined) continue
      const id = relative(absolute, full).replaceAll('\\', '/')
      let text
      try {
        if (statSync(full).size > LIMITS.bytes) continue
        text = readFileSync(full, 'utf8')
      } catch {
        continue
      }
      files.push(id)
      contents.set(id, text)
      byLanguage.set(language.name, (byLanguage.get(language.name) ?? 0) + 1)
    }
  }
  walk(absolute)
  files.sort()

  const fileSet = new Set(files)
  const directories = [...new Set(files.map((id) => dirOf(id)).filter((id) => id !== ''))].sort()
  const byDotted = new Map<string, string>()
  for (const directory of directories) byDotted.set(directory.replaceAll('/', '.'), directory)
  const index: Index = { files: fileSet, directories, byDotted, ...readAliases(absolute) }

  const edges: ScannedEdge[] = []
  const seen = new Set<string>()
  const unresolved: string[] = []
  const packages = new Set<string>()
  const nodeSet = new Set<string>()

  for (const id of files) {
    const language = languageOf(id) as Language
    const { local, external } = language.extract(contents.get(id) ?? '')
    const nodeOf = (fileId: string): string => (language.granularity === 'package' ? (dirOf(fileId) === '' ? '.' : dirOf(fileId)) : fileId)
    const from = nodeOf(id)
    nodeSet.add(from)
    for (const specifier of local) {
      const target = resolveSpecifier(language, id, specifier, index)
      if (target === undefined) {
        // A package language names modules by a path this tree may not contain. That is an external
        // dependency, not a broken reference, so it is counted rather than reported as unresolved.
        if (language.granularity === 'package') {
          const name = specifier.split(/[/.]/).filter(Boolean)[0]
          if (name !== undefined) packages.add(name)
        } else {
          unresolved.push(`${id} -> ${specifier}`)
        }
        continue
      }
      // A package resolver already answers with a directory; only a file resolver answers with a file.
      const to = target
      nodeSet.add(to)
      if (to === from) continue
      const key = from + '\u0000' + to
      if (seen.has(key)) continue
      seen.add(key)
      edges.push({ from, to })
    }
    for (const specifier of external) {
      const internal = language.granularity === 'file' ? resolveDeclared(language, specifier, index) : undefined
      if (internal !== undefined) {
        const target = nodeOf(internal)
        nodeSet.add(target)
        if (target !== from) {
          const key = from + ' ' + target
          if (!seen.has(key)) {
            seen.add(key)
            edges.push({ from, to: target })
          }
        }
        continue
      }
      const name = specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split(/[/.:]/)[0]
      if (name !== undefined && name !== '') packages.add(name)
    }
  }

  const languages = [...byLanguage.entries()]
    .map(([name, count]) => ({ language: name, files: count, granularity: (LANGUAGES.find((language) => language.name === name)?.granularity ?? 'file') as LangGranularity }))
    .sort((a, b) => b.files - a.files)
  edges.sort((a, b) => (a.from === b.from ? a.to.localeCompare(b.to) : a.from.localeCompare(b.to)))
  unresolved.sort()
  return { nodes: [...nodeSet].sort(), edges, filesRead: files.length, unresolved, packages: [...packages].sort(), languages }
}
